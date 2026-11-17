alter table public.couriers
  add column if not exists contract_start_date date,
  add column if not exists contract_end_date date,
  add column if not exists terminated_at timestamptz;

update public.couriers
set contract_start_date = created_at::date,
    contract_end_date = (created_at::date + interval '1 year')::date
where contract_start_date is null or contract_end_date is null;

alter table public.couriers
  alter column contract_start_date set default current_date,
  alter column contract_start_date set not null,
  alter column contract_end_date set default (current_date + interval '1 year')::date,
  alter column contract_end_date set not null;

alter table public.courier_presence
  add column if not exists break_until timestamptz;

alter table public.restaurants
  add column if not exists delivery_fee_piasters bigint not null default 0
    check (delivery_fee_piasters >= 0);

alter table public.orders
  add column if not exists delivery_fee_piasters bigint not null default 0
    check (delivery_fee_piasters >= 0);

update public.orders
set delivery_fee_piasters = greatest(amount_due_piasters - restaurant_due_piasters, 0)
where delivery_fee_piasters = 0;

create table if not exists public.restaurant_menu_items (
  id bigint generated always as identity primary key,
  restaurant_id bigint not null references public.restaurants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  price_piasters bigint not null check (price_piasters > 0),
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists restaurant_menu_items_restaurant_idx
  on public.restaurant_menu_items (restaurant_id, is_available, name);

alter table public.restaurant_menu_items enable row level security;

create policy "Restaurants and management can read menu items"
on public.restaurant_menu_items for select to authenticated
using (
  restaurant_id = public.current_restaurant_id()
  or public.is_admin()
);

grant select on public.restaurant_menu_items to authenticated;
revoke insert, update, delete on public.restaurant_menu_items from anon, authenticated;

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  menu_item_id bigint references public.restaurant_menu_items (id) on delete set null,
  item_name text not null check (char_length(btrim(item_name)) between 1 and 120),
  unit_price_piasters bigint not null check (unit_price_piasters > 0),
  quantity integer not null check (quantity between 1 and 99),
  line_total_piasters bigint not null check (line_total_piasters > 0),
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items (order_id, id);

alter table public.order_items enable row level security;

create policy "Order participants can read item snapshots"
on public.order_items for select to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and (
        public.is_admin()
        or o.restaurant_id = public.current_restaurant_id()
        or o.courier_id = public.current_courier_id()
      )
  )
);

grant select on public.order_items to authenticated;
revoke insert, update, delete on public.order_items from anon, authenticated;

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
    new.delivery_fee_piasters := v_restaurant.delivery_fee_piasters;
    new.amount_due_piasters := new.restaurant_due_piasters + v_restaurant.delivery_fee_piasters;
  end if;
  return new;
end;
$$;

create table if not exists public.delivery_settings (
  singleton boolean primary key default true check (singleton),
  break_requests_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

insert into public.delivery_settings (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.delivery_settings enable row level security;

create policy "Authenticated users can read delivery settings"
on public.delivery_settings for select to authenticated
using (true);

grant select on public.delivery_settings to authenticated;
revoke insert, update, delete on public.delivery_settings from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'delivery_settings'
  ) then
    alter publication supabase_realtime add table public.delivery_settings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'courier_presence'
  ) then
    alter publication supabase_realtime add table public.courier_presence;
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
  v_target_courier_id bigint;
  v_is_on_shift boolean;
  v_break_until timestamptz;
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
  v_courier public.couriers%rowtype;
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can change courier accounts';
  end if;

  select c.* into v_courier
  from public.couriers c
  where c.id = p_courier_id
  for update;
  if not found then
    raise exception 'Courier account not found';
  end if;
  if v_courier.terminated_at is not null then
    raise exception 'A permanently terminated courier cannot be reactivated';
  end if;
  if p_is_active and v_courier.contract_end_date < current_date then
    raise exception 'Renew the expired contract before reactivating this courier';
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
        break_until = null,
        updated_at = now()
    where courier_id = p_courier_id;
  end if;
end;
$$;

create or replace function public.set_courier_shift(p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courier public.couriers%rowtype;
  v_courier_id bigint;
begin
  select c.id into v_courier_id
  from public.couriers c
  where c.user_id = auth.uid();
  if public.current_user_role() is distinct from 'courier'::public.app_role
     or v_courier_id is null then
    raise exception 'Only a courier can change their shift';
  end if;

  select c.* into v_courier
  from public.couriers c
  where c.id = v_courier_id
  for update;
  if not found then
    raise exception 'Courier account not found';
  end if;
  if p_active and (
    not v_courier.is_active
    or v_courier.terminated_at is not null
    or v_courier.contract_end_date < current_date
  ) then
    raise exception 'This courier account is inactive or its contract has expired';
  end if;

  insert into public.courier_presence (courier_id, is_on_shift, break_until, updated_at)
  values (v_courier_id, p_active, null, now())
  on conflict (courier_id) do update
  set is_on_shift = excluded.is_on_shift,
      break_until = case when excluded.is_on_shift then public.courier_presence.break_until else null end,
      updated_at = now();
end;
$$;

create or replace function public.request_courier_break(p_duration_minutes integer)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courier_id bigint := public.current_courier_id();
  v_courier public.couriers%rowtype;
  v_is_on_shift boolean;
  v_break_until timestamptz;
  v_breaks_enabled boolean;
begin
  if public.current_user_role() is distinct from 'courier'::public.app_role
     or v_courier_id is null then
    raise exception 'Only a courier can request a break';
  end if;
  if p_duration_minutes not in (5, 10, 15, 20, 30, 60) then
    raise exception 'Choose a supported break duration';
  end if;

  select c.* into v_courier
  from public.couriers c
  where c.id = v_courier_id
  for update;
  if not found
     or not v_courier.is_active
     or v_courier.terminated_at is not null
     or v_courier.contract_end_date < current_date then
    raise exception 'This courier account is inactive or its contract has expired';
  end if;

  select s.break_requests_enabled into v_breaks_enabled
  from public.delivery_settings s
  where s.singleton;
  if not coalesce(v_breaks_enabled, false) then
    raise exception 'Break requests are currently disabled by management';
  end if;

  select p.is_on_shift, p.break_until
    into v_is_on_shift, v_break_until
  from public.courier_presence p
  where p.courier_id = v_courier_id
  for update;
  if not coalesce(v_is_on_shift, false) then
    raise exception 'Start your shift before requesting a break';
  end if;
  if v_break_until > now() then
    raise exception 'A break is already active';
  end if;

  update public.courier_presence
  set break_until = now() + make_interval(mins => p_duration_minutes),
      updated_at = now()
  where courier_id = v_courier_id
  returning break_until into v_break_until;

  return v_break_until;
end;
$$;

create or replace function public.admin_set_break_requests_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can change break availability';
  end if;

  update public.delivery_settings
  set break_requests_enabled = p_enabled,
      updated_at = now(),
      updated_by = auth.uid()
  where singleton;
end;
$$;

create or replace function public.admin_set_restaurant_delivery_fee(
  p_restaurant_id bigint,
  p_delivery_fee_piasters bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can change restaurant delivery fees';
  end if;
  if p_delivery_fee_piasters is null or p_delivery_fee_piasters < 0 then
    raise exception 'Delivery fee must be zero or greater';
  end if;

  update public.restaurants
  set delivery_fee_piasters = p_delivery_fee_piasters
  where id = p_restaurant_id;
  if not found then
    raise exception 'Restaurant account not found';
  end if;
end;
$$;

create or replace function public.save_restaurant_menu_item(
  p_item_id bigint,
  p_name text,
  p_price_piasters bigint,
  p_is_available boolean
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant_id bigint := public.current_restaurant_id();
  v_item_id bigint;
begin
  if public.current_user_role() is distinct from 'restaurant'::public.app_role
     or v_restaurant_id is null then
    raise exception 'Only a restaurant can manage its menu';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120
     or p_price_piasters is null
     or p_price_piasters <= 0
     or p_is_available is null then
    raise exception 'Enter a valid item name, price, and availability';
  end if;

  if p_item_id is null then
    insert into public.restaurant_menu_items (
      restaurant_id, name, price_piasters, is_available
    )
    values (v_restaurant_id, btrim(p_name), p_price_piasters, p_is_available)
    returning id into v_item_id;
  else
    update public.restaurant_menu_items
    set name = btrim(p_name),
        price_piasters = p_price_piasters,
        is_available = p_is_available,
        updated_at = now()
    where id = p_item_id
      and restaurant_id = v_restaurant_id
    returning id into v_item_id;
    if not found then
      raise exception 'Menu item not found';
    end if;
  end if;
  return v_item_id;
end;
$$;

create or replace function public.submit_restaurant_order(
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
  v_restaurant_id bigint := public.current_restaurant_id();
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
  if public.current_user_role() is distinct from 'restaurant'::public.app_role
     or v_restaurant_id is null then
    raise exception 'Only a restaurant can submit orders';
  end if;
  if char_length(btrim(coalesce(p_customer_name, ''))) < 2
     or char_length(btrim(coalesce(p_customer_phone, ''))) < 7
     or char_length(btrim(coalesce(p_customer_address, ''))) < 3 then
    raise exception 'Enter the customer name, phone, and full address';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Select at least one menu item';
  end if;
  if jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Select at least one menu item';
  end if;

  select r.* into v_restaurant
  from public.restaurants r
  where r.id = v_restaurant_id
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
      and mi.restaurant_id = v_restaurant_id
      and mi.is_available
    for share;
    if not found then
      raise exception 'A selected item is unavailable; refresh the menu and try again';
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
    status
  )
  values (
    v_restaurant_id,
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
    'pending'::public.order_status
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
      and mi.restaurant_id = v_restaurant_id;

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

create or replace function public.admin_renew_courier_contract(p_courier_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can renew courier contracts';
  end if;

  update public.couriers
  set contract_start_date = current_date,
      contract_end_date = (current_date + interval '1 year')::date
  where id = p_courier_id
    and terminated_at is null;
  if not found then
    raise exception 'Courier account not found or permanently terminated';
  end if;
end;
$$;

create or replace function public.admin_update_courier_profile(
  p_courier_id bigint,
  p_full_name text,
  p_email text,
  p_phone text,
  p_national_id text,
  p_address text,
  p_id_card_path text default null,
  p_selfie_path text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can edit courier profiles';
  end if;
  if char_length(btrim(coalesce(p_full_name, ''))) < 4
     or position(' ' in btrim(p_full_name)) = 0
     or lower(btrim(coalesce(p_email, ''))) !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
     or btrim(coalesce(p_phone, '')) !~ '^[+0-9][0-9 +()-]{7,16}$'
     or btrim(coalesce(p_national_id, '')) !~ '^[0-9]{14}$'
     or char_length(btrim(coalesce(p_address, ''))) < 3 then
    raise exception 'Review the courier name, email, phone, national ID, and address';
  end if;

  select c.user_id into v_user_id
  from public.couriers c
  where c.id = p_courier_id
    and c.terminated_at is null
  for update;
  if not found then
    raise exception 'Courier account not found or permanently terminated';
  end if;

  update public.profiles
  set full_name = btrim(p_full_name),
      email = lower(btrim(p_email)),
      phone = btrim(p_phone)
  where id = v_user_id;

  update public.couriers
  set full_name = btrim(p_full_name),
      email = lower(btrim(p_email)),
      phone = btrim(p_phone)
  where id = p_courier_id;

  update public.courier_private_details
  set national_id = btrim(p_national_id),
      address = btrim(p_address),
      id_card_path = coalesce(p_id_card_path, id_card_path)
  where courier_id = p_courier_id;
  if not found then
    raise exception 'Courier identity details were not found';
  end if;

  if p_selfie_path is not null then
    update public.profiles
    set profile_photo_path = p_selfie_path
    where id = v_user_id;
  end if;
end;
$$;

create or replace function public.admin_terminate_courier(p_courier_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can permanently terminate couriers';
  end if;

  perform 1
  from public.couriers c
  where c.id = p_courier_id
    and c.terminated_at is null
  for update;
  if not found then
    raise exception 'Courier account not found or already terminated';
  end if;

  if exists (
    select 1 from public.orders o
    where o.courier_id = p_courier_id
      and o.status in (
        'assigned'::public.order_status,
        'accepted'::public.order_status,
        'picked_up'::public.order_status
      )
  ) then
    raise exception 'Transfer or complete this courier''s unfinished orders before termination';
  end if;

  update public.couriers
  set is_active = false,
      terminated_at = now()
  where id = p_courier_id;

  update public.courier_presence
  set is_on_shift = false,
      break_until = null,
      updated_at = now()
  where courier_id = p_courier_id;
end;
$$;

revoke all on function public.admin_assign_order(uuid, bigint) from public, anon;
revoke all on function public.admin_set_courier_active(bigint, boolean) from public, anon;
revoke all on function public.set_courier_shift(boolean) from public, anon;
revoke all on function public.request_courier_break(integer) from public, anon;
revoke all on function public.admin_set_break_requests_enabled(boolean) from public, anon;
revoke all on function public.admin_set_restaurant_delivery_fee(bigint, bigint) from public, anon;
revoke all on function public.save_restaurant_menu_item(bigint, text, bigint, boolean) from public, anon;
revoke all on function public.submit_restaurant_order(text, text, text, text, jsonb) from public, anon;
revoke all on function public.admin_renew_courier_contract(bigint) from public, anon;
revoke all on function public.admin_update_courier_profile(bigint, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.admin_terminate_courier(bigint) from public, anon;

grant execute on function public.admin_assign_order(uuid, bigint) to authenticated;
grant execute on function public.admin_set_courier_active(bigint, boolean) to authenticated;
grant execute on function public.set_courier_shift(boolean) to authenticated;
grant execute on function public.request_courier_break(integer) to authenticated;
grant execute on function public.admin_set_break_requests_enabled(boolean) to authenticated;
grant execute on function public.admin_set_restaurant_delivery_fee(bigint, bigint) to authenticated;
grant execute on function public.save_restaurant_menu_item(bigint, text, bigint, boolean) to authenticated;
grant execute on function public.submit_restaurant_order(text, text, text, text, jsonb) to authenticated;
grant execute on function public.admin_renew_courier_contract(bigint) to authenticated;
grant execute on function public.admin_update_courier_profile(bigint, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.admin_terminate_courier(bigint) to authenticated;
