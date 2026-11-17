alter table public.orders
  alter column delivery_fee_piasters drop not null,
  alter column delivery_fee_piasters drop default;

update public.orders
set delivery_fee_piasters = null,
    amount_due_piasters = restaurant_due_piasters
where status = 'pending'::public.order_status;

create or replace function public.set_order_restaurant_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant public.restaurants%rowtype;
begin
  if auth.uid() is not null and public.current_user_role() = 'restaurant'::public.app_role then
    new.restaurant_id := public.current_restaurant_id();
  end if;

  select r.* into v_restaurant
  from public.restaurants r
  where r.id = new.restaurant_id;

  if not found then
    raise exception 'Restaurant account not found';
  end if;

  new.restaurant_name := v_restaurant.name;
  new.restaurant_address := v_restaurant.address;
  new.restaurant_latitude := v_restaurant.latitude;
  new.restaurant_longitude := v_restaurant.longitude;

  if auth.uid() is not null and public.current_user_role() = 'restaurant'::public.app_role then
    new.delivery_fee_piasters := null;
    new.amount_due_piasters := new.restaurant_due_piasters;
  end if;
  return new;
end;
$$;

create or replace function public.admin_set_order_delivery_fee(
  p_order_id uuid,
  p_delivery_fee_piasters bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can set order delivery fees';
  end if;
  if p_delivery_fee_piasters is null or p_delivery_fee_piasters < 0 then
    raise exception 'Delivery fee must be zero or more';
  end if;

  update public.orders
  set delivery_fee_piasters = p_delivery_fee_piasters,
      amount_due_piasters = restaurant_due_piasters + p_delivery_fee_piasters,
      updated_at = now()
  where id = p_order_id
    and status = 'pending'::public.order_status;
  if not found then
    raise exception 'Only an order awaiting management review can have its delivery fee set';
  end if;
end;
$$;

create or replace function public.admin_cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can cancel orders';
  end if;

  update public.orders
  set status = 'cancelled'::public.order_status,
      updated_at = now()
  where id = p_order_id
    and status = 'pending'::public.order_status;
  if not found then
    raise exception 'Only an order awaiting management review can be cancelled';
  end if;
end;
$$;

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
  v_delivery_fee_piasters bigint;
  v_target_courier_id bigint;
  v_is_on_shift boolean;
  v_break_until timestamptz;
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can assign orders';
  end if;

  select o.status, o.delivery_fee_piasters
    into v_status, v_delivery_fee_piasters
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
  if v_delivery_fee_piasters is null then
    raise exception 'Set the delivery fee before assigning this order';
  end if;

  select c.id into v_target_courier_id
  from public.couriers c
  where c.id = p_courier_id
    and c.is_active
    and c.terminated_at is null
    and c.contract_end_date >= current_date
  for update;
  if not found then
    raise exception 'The selected courier is disabled, terminated, or has an expired contract';
  end if;

  select p.is_on_shift, p.break_until
    into v_is_on_shift, v_break_until
  from public.courier_presence p
  where p.courier_id = p_courier_id
  for update;
  if not coalesce(v_is_on_shift, false) then
    raise exception 'The selected courier is not on shift';
  end if;
  if v_break_until > now() then
    raise exception 'The selected courier is on break';
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

revoke all on function public.admin_set_order_delivery_fee(uuid, bigint) from public, anon;
revoke all on function public.admin_cancel_order(uuid) from public, anon;
grant execute on function public.admin_set_order_delivery_fee(uuid, bigint) to authenticated;
grant execute on function public.admin_cancel_order(uuid) to authenticated;
