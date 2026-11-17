create policy "Restaurants can view locations of their assigned couriers"
on public.courier_locations for select to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.courier_id = public.courier_locations.courier_id
      and o.restaurant_id = public.current_restaurant_id()
      and o.status in ('accepted'::public.order_status, 'picked_up'::public.order_status)
  )
);

create or replace function public.advance_order_status(p_order_id uuid, p_next_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.order_status;
  next_status public.order_status;
  v_courier_id bigint := public.current_courier_id();
  v_amount_due_piasters bigint;
  v_restaurant_due_piasters bigint;
begin
  if public.current_user_role() <> 'courier'::public.app_role then
    raise exception 'Only a courier can update delivery status';
  end if;
  if p_next_status not in ('picked_up', 'delivered') then
    raise exception 'Unsupported delivery status';
  end if;
  next_status := p_next_status::public.order_status;

  select o.status, o.amount_due_piasters, o.restaurant_due_piasters
    into current_status, v_amount_due_piasters, v_restaurant_due_piasters
  from public.orders o
  where o.id = p_order_id
    and o.courier_id = v_courier_id
  for update;

  if not found then
    raise exception 'Order is not assigned to this courier';
  end if;
  if not (
    (current_status = 'accepted'::public.order_status and next_status = 'picked_up'::public.order_status)
    or (current_status = 'picked_up'::public.order_status and next_status = 'delivered'::public.order_status)
  ) then
    raise exception 'Invalid order status transition';
  end if;

  update public.orders
  set status = next_status,
      delivered_at = case when next_status = 'delivered'::public.order_status then now() else delivered_at end,
      updated_at = now()
  where id = p_order_id;

  if next_status = 'delivered'::public.order_status then
    insert into public.order_cash (
      order_id, courier_id, collected_piasters, paid_to_restaurant_piasters, recorded_at
    )
    values (
      p_order_id, v_courier_id, v_amount_due_piasters, v_restaurant_due_piasters, now()
    )
    on conflict (order_id) do update
    set courier_id = excluded.courier_id,
        collected_piasters = excluded.collected_piasters,
        paid_to_restaurant_piasters = excluded.paid_to_restaurant_piasters,
        recorded_at = excluded.recorded_at;
  end if;
end;
$$;

revoke all on function public.record_order_cash(uuid, bigint, bigint) from public, anon, authenticated;
