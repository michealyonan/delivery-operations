alter table public.orders
  add column order_source text not null default 'restaurant'
    check (order_source in ('restaurant', 'admin'));

create or replace function public.prevent_order_source_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.order_source is distinct from old.order_source then
    raise exception 'Order source cannot be changed after creation';
  end if;
  return new;
end;
$$;

create trigger orders_source_immutable
before update of order_source on public.orders
for each row execute function public.prevent_order_source_change();

create or replace function public.admin_create_order(
  p_restaurant_id bigint,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_notes text,
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
  v_order_id uuid;
  v_items_text text[] := array[]::text[];
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can create orders on behalf of a restaurant';
  end if;
  if p_restaurant_id is null then
    raise exception 'Choose the restaurant for this order';
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
    v_items_text := array_append(
      v_items_text,
      format('%s × %s', v_menu_item.name, v_quantity)
    );
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
    v_restaurant_total + v_restaurant.delivery_fee_piasters,
    v_restaurant.delivery_fee_piasters,
    v_restaurant_total,
    'pending'::public.order_status,
    'admin'
  )
  returning * into v_order;
  v_order_id := v_order.id;

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
      v_order_id,
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

revoke all on function public.admin_create_order(bigint, text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.admin_create_order(bigint, text, text, text, text, jsonb)
  to authenticated;
