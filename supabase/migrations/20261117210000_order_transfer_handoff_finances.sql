alter table public.order_cash
  add column paid_to_previous_courier_piasters bigint not null default 0
    check (paid_to_previous_courier_piasters >= 0),
  add column previous_courier_id bigint references public.couriers (id),
  add constraint order_cash_transfer_payment_consistency check (
    (previous_courier_id is null and paid_to_previous_courier_piasters = 0)
    or (previous_courier_id is not null and previous_courier_id <> courier_id)
  );

drop policy if exists "Management and assigned couriers can read cash entries"
  on public.order_cash;
create policy "Management and cash participants can read cash entries"
on public.order_cash for select to authenticated
using (
  public.is_admin()
  or courier_id = public.current_courier_id()
  or previous_courier_id = public.current_courier_id()
);

create policy "Support can read orders with transfer requests"
on public.orders for select to authenticated
using (
  public.is_support_staff()
  and exists (
    select 1
    from public.order_transfer_requests r
    where r.order_id = orders.id
  )
);

create or replace function public.advance_order_status(p_order_id uuid, p_next_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_status public.order_status;
  v_next_status public.order_status;
  v_courier_id bigint := public.current_courier_id();
  v_amount_due_piasters bigint;
  v_restaurant_due_piasters bigint;
  v_previous_courier_id bigint;
  v_is_handoff boolean := false;
begin
  if public.current_user_role() <> 'courier'::public.app_role then
    raise exception 'Only a courier can update delivery status';
  end if;
  if p_next_status not in ('picked_up', 'delivered') then
    raise exception 'Unsupported delivery status';
  end if;
  v_next_status := p_next_status::public.order_status;

  select o.status, o.amount_due_piasters, o.restaurant_due_piasters
    into v_current_status, v_amount_due_piasters, v_restaurant_due_piasters
  from public.orders o
  where o.id = p_order_id
    and o.courier_id = v_courier_id
  for update;
  if not found then
    raise exception 'Order is not assigned to this courier';
  end if;

  if exists (
    select 1
    from public.order_transfer_requests r
    where r.order_id = p_order_id
      and r.status = 'pending'
  ) then
    raise exception 'Order actions are paused while a transfer request is pending';
  end if;
  if not (
    (v_current_status = 'accepted'::public.order_status and v_next_status = 'picked_up'::public.order_status)
    or (v_current_status = 'picked_up'::public.order_status and v_next_status = 'delivered'::public.order_status)
  ) then
    raise exception 'Invalid order status transition';
  end if;

  select r.from_courier_id
    into v_previous_courier_id
  from public.order_transfer_requests r
  where r.order_id = p_order_id
    and r.status = 'approved'
    and r.to_courier_id = v_courier_id
    and r.requires_handoff
  order by r.resolved_at desc
  limit 1;
  v_is_handoff := found;

  update public.orders
  set status = v_next_status,
      delivered_at = case
        when v_next_status = 'delivered'::public.order_status then now()
        else delivered_at
      end,
      updated_at = now()
  where id = p_order_id;

  if v_next_status = 'picked_up'::public.order_status and v_is_handoff then
    insert into public.order_cash (
      order_id,
      courier_id,
      collected_piasters,
      paid_to_restaurant_piasters,
      paid_to_previous_courier_piasters,
      previous_courier_id,
      recorded_at
    )
    values (
      p_order_id,
      v_courier_id,
      0,
      0,
      v_restaurant_due_piasters,
      v_previous_courier_id,
      now()
    )
    on conflict (order_id) do update
    set paid_to_restaurant_piasters = 0,
        paid_to_previous_courier_piasters = excluded.paid_to_previous_courier_piasters,
        previous_courier_id = excluded.previous_courier_id,
        recorded_at = excluded.recorded_at
    where public.order_cash.courier_id = v_courier_id;
    if not found then
      raise exception 'Cash entry belongs to another courier';
    end if;
  end if;

  if v_next_status = 'delivered'::public.order_status then
    insert into public.order_cash (
      order_id,
      courier_id,
      collected_piasters,
      paid_to_restaurant_piasters,
      paid_to_previous_courier_piasters,
      previous_courier_id,
      recorded_at
    )
    values (
      p_order_id,
      v_courier_id,
      v_amount_due_piasters,
      case when v_is_handoff then 0 else v_restaurant_due_piasters end,
      case when v_is_handoff then v_restaurant_due_piasters else 0 end,
      case when v_is_handoff then v_previous_courier_id else null end,
      now()
    )
    on conflict (order_id) do update
    set collected_piasters = excluded.collected_piasters,
        paid_to_restaurant_piasters = excluded.paid_to_restaurant_piasters,
        paid_to_previous_courier_piasters = excluded.paid_to_previous_courier_piasters,
        previous_courier_id = excluded.previous_courier_id,
        recorded_at = excluded.recorded_at
    where public.order_cash.courier_id = v_courier_id;
    if not found then
      raise exception 'Cash entry belongs to another courier';
    end if;
  end if;
end;
$$;
