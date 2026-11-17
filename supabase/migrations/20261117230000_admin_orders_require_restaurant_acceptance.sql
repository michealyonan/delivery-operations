alter table public.orders
  add column restaurant_accepted_at timestamptz;

drop function public.admin_create_order(bigint, text, text, text, text, jsonb);

create function public.admin_create_order(
  p_restaurant_id bigint,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_notes text,
  p_delivery_fee_piasters bigint,
  p_items jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant public.restaurants%rowtype;
  v_menu_item public.restaurant_menu_items%rowtype;
  v_order public.orders%rowtype;
  v_input jsonb;
  v_item_id bigint;
  v_quantity integer;
  v_line_total bigint;
  v_restaurant_total bigint := 0;
  v_items_text text[] := array[]::text[];
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can create orders on behalf of a restaurant';
  end if;
  if p_restaurant_id is null then
    raise exception 'Choose the restaurant for this order';
  end if;
  if p_delivery_fee_piasters is null or p_delivery_fee_piasters < 0 then
    raise exception 'Enter valid delivery fees before sending the order to the restaurant';
  end if;
  if char_length(btrim(coalesce(p_customer_name, ''))) not between 2 and 120
     or char_length(btrim(coalesce(p_customer_phone, ''))) not between 7 and 20
     or char_length(btrim(coalesce(p_customer_address, ''))) not between 3 and 500
     or char_length(coalesce(p_notes, '')) > 1000 then
    raise exception 'Review the customer name, phone, address, and order notes';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Select at least one menu item';
  end if;

  select r.* into v_restaurant
  from public.restaurants r
  where r.id = p_restaurant_id
  for share;
  if not found then
    raise exception 'Restaurant account not found';
  end if;

  for v_input in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_input -> 'itemId') is distinct from 'number'
       or (v_input ->> 'itemId') !~ '^[0-9]{1,18}$'
       or jsonb_typeof(v_input -> 'quantity') is distinct from 'number'
       or (v_input ->> 'quantity') !~ '^[0-9]{1,2}$' then
      raise exception 'Invalid menu item selection';
    end if;

    v_item_id := (v_input ->> 'itemId')::bigint;
    v_quantity := (v_input ->> 'quantity')::integer;
    if v_quantity not between 1 and 99 then
      raise exception 'Item quantity must be between 1 and 99';
    end if;

    select mi.* into v_menu_item
    from public.restaurant_menu_items mi
    where mi.id = v_item_id
      and mi.restaurant_id = p_restaurant_id
      and mi.is_available
    for share;
    if not found then
      raise exception 'A selected item is unavailable; refresh the restaurant menu and try again';
    end if;

    v_line_total := v_menu_item.price_piasters * v_quantity;
    v_restaurant_total := v_restaurant_total + v_line_total;
    v_items_text := array_append(v_items_text, format('%s × %s', v_menu_item.name, v_quantity));
  end loop;

  insert into public.orders (
    restaurant_id,
    restaurant_name,
    restaurant_address,
    customer_name,
    customer_phone,
    customer_address,
    items_text,
    notes,
    amount_due_piasters,
    delivery_fee_piasters,
    restaurant_due_piasters,
    status,
    order_source
  )
  values (
    p_restaurant_id,
    v_restaurant.name,
    v_restaurant.address,
    btrim(p_customer_name),
    btrim(p_customer_phone),
    btrim(p_customer_address),
    array_to_string(v_items_text, E'\n'),
    btrim(coalesce(p_notes, '')),
    v_restaurant_total + p_delivery_fee_piasters,
    p_delivery_fee_piasters,
    v_restaurant_total,
    'pending'::public.order_status,
    'admin'
  )
  returning * into v_order;

  for v_input in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := (v_input ->> 'itemId')::bigint;
    v_quantity := (v_input ->> 'quantity')::integer;
    select mi.* into v_menu_item
    from public.restaurant_menu_items mi
    where mi.id = v_item_id
      and mi.restaurant_id = p_restaurant_id
      and mi.is_available;

    insert into public.order_items (
      order_id, menu_item_id, item_name, unit_price_piasters, quantity, line_total_piasters
    )
    values (
      v_order.id,
      v_menu_item.id,
      v_menu_item.name,
      v_menu_item.price_piasters,
      v_quantity,
      v_menu_item.price_piasters * v_quantity
    );
  end loop;

  return v_order;
end;
$$;

revoke all on function public.admin_create_order(bigint, text, text, text, text, bigint, jsonb)
  from public, anon;
grant execute on function public.admin_create_order(bigint, text, text, text, text, bigint, jsonb)
  to authenticated;

create or replace function public.restaurant_accept_admin_order(p_order_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_candidate record;
  v_assigned_at timestamptz := now();
begin
  if public.current_user_role() is distinct from 'restaurant'::public.app_role then
    raise exception 'Only the restaurant can accept its management-created orders';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
    and o.restaurant_id = public.current_restaurant_id()
  for update;
  if not found then
    raise exception 'Order not found for this restaurant';
  end if;
  if v_order.order_source <> 'admin' then
    raise exception 'Only management-created orders can be accepted here';
  end if;
  if v_order.status <> 'pending'::public.order_status
     or v_order.restaurant_accepted_at is not null then
    raise exception 'This order is no longer waiting for restaurant acceptance';
  end if;
  if v_order.delivery_fee_piasters is null then
    raise exception 'Management must set delivery fees before the restaurant accepts this order';
  end if;

  update public.orders
  set restaurant_accepted_at = v_assigned_at,
      updated_at = v_assigned_at
  where id = v_order.id;

  if v_order.restaurant_latitude is null or v_order.restaurant_longitude is null then
    return null;
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
        assigned_at = v_assigned_at,
        accepted_at = null,
        updated_at = v_assigned_at
    where id = v_order.id;
    return v_candidate.id;
  end loop;

  return null;
end;
$$;

revoke all on function public.restaurant_accept_admin_order(uuid) from public, anon;
grant execute on function public.restaurant_accept_admin_order(uuid) to authenticated;
