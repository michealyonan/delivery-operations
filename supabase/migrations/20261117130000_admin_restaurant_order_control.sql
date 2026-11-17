alter table public.restaurants
  add column if not exists accepts_orders boolean not null default true;

create or replace function public.admin_set_restaurant_ordering(
  p_restaurant_id bigint,
  p_accepts_orders boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can change restaurant order availability';
  end if;
  if p_accepts_orders is null then
    raise exception 'Order availability must be specified';
  end if;

  update public.restaurants
  set accepts_orders = p_accepts_orders
  where id = p_restaurant_id;
  if not found then
    raise exception 'Restaurant account not found';
  end if;
end;
$$;

revoke all on function public.admin_set_restaurant_ordering(bigint, boolean) from public, anon;
grant execute on function public.admin_set_restaurant_ordering(bigint, boolean) to authenticated;

create or replace function public.set_order_restaurant_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant public.restaurants%rowtype;
  v_is_restaurant boolean :=
    auth.uid() is not null
    and public.current_user_role() = 'restaurant'::public.app_role;
begin
  if v_is_restaurant then
    new.restaurant_id := public.current_restaurant_id();
  end if;

  select r.* into v_restaurant
  from public.restaurants r
  where r.id = new.restaurant_id
  for share;

  if not found then
    raise exception 'Restaurant account not found';
  end if;
  if v_is_restaurant and not v_restaurant.accepts_orders then
    raise exception 'أوقفت الإدارة استقبال الطلبات الجديدة لهذا المطعم';
  end if;

  new.restaurant_name := v_restaurant.name;
  new.restaurant_address := v_restaurant.address;
  new.restaurant_latitude := v_restaurant.latitude;
  new.restaurant_longitude := v_restaurant.longitude;

  if v_is_restaurant then
    new.delivery_fee_piasters := null;
    new.amount_due_piasters := new.restaurant_due_piasters;
  end if;
  return new;
end;
$$;

update public.restaurants
set delivery_fee_piasters = 0
where delivery_fee_piasters <> 0;

drop function if exists public.admin_set_restaurant_delivery_fee(bigint, bigint);
drop function if exists public.admin_set_order_delivery_fee(uuid, bigint);
drop function if exists public.admin_assign_order(uuid, bigint);

create or replace function public.admin_assign_order(
  p_order_id uuid,
  p_courier_id bigint,
  p_delivery_fee_piasters bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.order_status;
  v_delivery_fee_piasters bigint;
  v_restaurant_due_piasters bigint;
  v_final_delivery_fee_piasters bigint;
  v_target_courier_id bigint;
  v_is_on_shift boolean;
  v_break_until timestamptz;
  v_shift_close_requested_at timestamptz;
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can assign orders';
  end if;

  select o.status, o.delivery_fee_piasters, o.restaurant_due_piasters
    into v_status, v_delivery_fee_piasters, v_restaurant_due_piasters
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
  if p_delivery_fee_piasters is not null and p_delivery_fee_piasters < 0 then
    raise exception 'Delivery fee must be zero or more';
  end if;
  v_final_delivery_fee_piasters :=
    coalesce(p_delivery_fee_piasters, v_delivery_fee_piasters);
  if v_final_delivery_fee_piasters is null then
    raise exception 'Enter the delivery fee when assigning this order';
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

  select p.is_on_shift, p.break_until, p.shift_close_requested_at
    into v_is_on_shift, v_break_until, v_shift_close_requested_at
  from public.courier_presence p
  where p.courier_id = p_courier_id
  for update;
  if not coalesce(v_is_on_shift, false) then
    raise exception 'The selected courier is not on shift';
  end if;
  if v_shift_close_requested_at is not null then
    raise exception 'The selected courier has requested to close their shift';
  end if;
  if v_break_until > now() then
    raise exception 'The selected courier is on break';
  end if;

  update public.orders
  set courier_id = p_courier_id,
      status = 'assigned'::public.order_status,
      delivery_fee_piasters = v_final_delivery_fee_piasters,
      amount_due_piasters = v_restaurant_due_piasters + v_final_delivery_fee_piasters,
      assigned_at = now(),
      accepted_at = null,
      updated_at = now()
  where id = p_order_id;
end;
$$;

create or replace function public.admin_assign_order_to_nearest_courier(
  p_order_id uuid,
  p_delivery_fee_piasters bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_candidate record;
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'الإرسال التلقائي للطلبات متاح للإدارة فقط';
  end if;
  if p_delivery_fee_piasters is null or p_delivery_fee_piasters < 0 then
    raise exception 'رسوم التوصيل يجب أن تكون صفرًا أو أكثر';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
  for update;
  if not found then
    raise exception 'الطلب غير موجود';
  end if;
  if v_order.status <> 'pending'::public.order_status then
    raise exception 'يمكن إرسال الطلبات المنتظرة للإسناد فقط';
  end if;
  if v_order.restaurant_latitude is null or v_order.restaurant_longitude is null then
    raise exception 'حدد موقع المطعم قبل الإسناد التلقائي';
  end if;

  for v_candidate in
    select c.id
    from public.couriers c
    join public.courier_presence p on p.courier_id = c.id
    join public.courier_locations l on l.courier_id = c.id
    where c.is_active
      and c.terminated_at is null
      and c.contract_start_date <= current_date
      and c.contract_end_date >= current_date
      and p.is_on_shift
      and p.shift_close_requested_at is null
      and (p.break_until is null or p.break_until <= now())
      and l.recorded_at between now() - interval '5 minutes' and now() + interval '30 seconds'
      and not exists (
        select 1
        from public.orders active_order
        where active_order.courier_id = c.id
          and active_order.status in (
            'assigned'::public.order_status,
            'accepted'::public.order_status,
            'picked_up'::public.order_status
          )
      )
    order by 6371000 * acos(least(1.0, greatest(-1.0,
      cos(radians(v_order.restaurant_latitude)) * cos(radians(l.latitude))
        * cos(radians(l.longitude) - radians(v_order.restaurant_longitude))
        + sin(radians(v_order.restaurant_latitude)) * sin(radians(l.latitude))
    ))), c.id
    for update of c, p skip locked
  loop
    if exists (
      select 1
      from public.orders active_order
      where active_order.courier_id = v_candidate.id
        and active_order.status in (
          'assigned'::public.order_status,
          'accepted'::public.order_status,
          'picked_up'::public.order_status
        )
    ) then
      continue;
    end if;

    update public.orders
    set courier_id = v_candidate.id,
        status = 'assigned'::public.order_status,
        delivery_fee_piasters = p_delivery_fee_piasters,
        amount_due_piasters = v_order.restaurant_due_piasters + p_delivery_fee_piasters,
        assigned_at = now(),
        accepted_at = null,
        updated_at = now()
    where id = p_order_id;
    return v_candidate.id;
  end loop;

  raise exception 'لا يوجد مندوب متاح على الشيفت بلا طلب حالي ولديه موقع محدث';
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
      courier_id = null,
      updated_at = now()
  where id = p_order_id
    and status = 'pending'::public.order_status;
  if not found then
    raise exception 'Only an order awaiting management review can be cancelled';
  end if;
end;
$$;

revoke all on function public.admin_assign_order(uuid, bigint, bigint) from public, anon;
revoke all on function public.admin_assign_order_to_nearest_courier(uuid, bigint) from public, anon;
revoke all on function public.admin_cancel_order(uuid) from public, anon;
grant execute on function public.admin_assign_order(uuid, bigint, bigint) to authenticated;
grant execute on function public.admin_assign_order_to_nearest_courier(uuid, bigint) to authenticated;
grant execute on function public.admin_cancel_order(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'restaurants'
  ) then
    alter publication supabase_realtime add table public.restaurants;
  end if;
end;
$$;
