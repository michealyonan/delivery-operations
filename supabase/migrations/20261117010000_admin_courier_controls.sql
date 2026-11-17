create or replace function public.admin_assign_order(
  p_order_id uuid,
  p_courier_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.order_status;
  v_target_courier_id bigint;
  v_is_on_shift boolean;
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can assign orders';
  end if;

  select o.status into v_status
  from public.orders o
  where o.id = p_order_id
  for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_status not in (
    'pending'::public.order_status,
    'assigned'::public.order_status,
    'accepted'::public.order_status,
    'picked_up'::public.order_status
  ) then
    raise exception 'This order can no longer be assigned';
  end if;

  select c.id into v_target_courier_id
  from public.couriers c
  where c.id = p_courier_id
    and c.is_active
  for update;
  if not found then
    raise exception 'The selected courier account is disabled';
  end if;

  select p.is_on_shift into v_is_on_shift
  from public.courier_presence p
  where p.courier_id = p_courier_id
  for update;
  if not coalesce(v_is_on_shift, false) then
    raise exception 'The selected courier is not on shift';
  end if;

  update public.orders
  set courier_id = p_courier_id,
      status = 'assigned'::public.order_status,
      assigned_at = now(),
      accepted_at = null,
      updated_at = now()
  where id = p_order_id;
end;
$$;

create or replace function public.admin_set_courier_active(
  p_courier_id bigint,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courier_id bigint;
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can change courier accounts';
  end if;

  select c.id into v_courier_id
  from public.couriers c
  where c.id = p_courier_id
  for update;
  if not found then
    raise exception 'Courier account not found';
  end if;

  if not p_is_active and exists (
    select 1
    from public.orders o
    where o.courier_id = p_courier_id
      and o.status in (
        'assigned'::public.order_status,
        'accepted'::public.order_status,
        'picked_up'::public.order_status
      )
  ) then
    raise exception 'Transfer or complete this courier''s unfinished orders before disabling the account';
  end if;

  update public.couriers
  set is_active = p_is_active
  where id = p_courier_id;

  if not p_is_active then
    update public.courier_presence
    set is_on_shift = false,
        updated_at = now()
    where courier_id = p_courier_id;
  end if;
end;
$$;

drop policy if exists "Management can dispatch and cancel orders" on public.orders;
revoke update on public.orders from anon, authenticated;

revoke all on function public.admin_assign_order(uuid, bigint) from public, anon;
revoke all on function public.admin_set_courier_active(bigint, boolean) from public, anon;
grant execute on function public.admin_assign_order(uuid, bigint) to authenticated;
grant execute on function public.admin_set_courier_active(bigint, boolean) to authenticated;
