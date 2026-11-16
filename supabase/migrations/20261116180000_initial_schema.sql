create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'restaurant', 'courier');
create type public.order_status as enum (
  'pending',
  'assigned',
  'accepted',
  'picked_up',
  'delivered',
  'cancelled'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  full_name text not null,
  email text not null unique,
  phone text,
  created_at timestamptz not null default now()
);

create table public.couriers (
  id bigint generated always as identity primary key,
  courier_code text generated always as ('CR-' || lpad(id::text, 6, '0')) stored unique,
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  full_name text not null,
  phone text not null,
  email text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.courier_private_details (
  courier_id bigint primary key references public.couriers (id) on delete cascade,
  national_id text not null unique check (national_id ~ '^[0-9]{14}$'),
  address text not null,
  id_card_path text not null,
  created_at timestamptz not null default now()
);

create table public.courier_presence (
  courier_id bigint primary key references public.couriers (id) on delete cascade,
  is_on_shift boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.courier_locations (
  courier_id bigint primary key references public.couriers (id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  recorded_at timestamptz not null
);

create table public.restaurants (
  id bigint generated always as identity primary key,
  restaurant_code text generated always as ('RS-' || lpad(id::text, 6, '0')) stored unique,
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  name text not null,
  email text not null unique,
  phone text not null,
  address text not null,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  order_code text generated always as ('ORD-' || lpad(order_number::text, 6, '0')) stored unique,
  restaurant_id bigint not null references public.restaurants (id),
  restaurant_name text not null,
  restaurant_address text not null,
  restaurant_latitude double precision,
  restaurant_longitude double precision,
  courier_id bigint references public.couriers (id),
  customer_name text not null,
  customer_phone text not null,
  customer_address text not null,
  items_text text not null check (length(trim(items_text)) > 0),
  notes text not null default '',
  amount_due_piasters bigint not null check (amount_due_piasters >= 0),
  restaurant_due_piasters bigint not null check (restaurant_due_piasters >= 0),
  status public.order_status not null default 'pending',
  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  accepted_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((restaurant_latitude is null) = (restaurant_longitude is null))
);

create index orders_restaurant_created_idx on public.orders (restaurant_id, created_at desc);
create index orders_courier_created_idx on public.orders (courier_id, created_at desc);
create index orders_status_created_idx on public.orders (status, created_at desc);

create table public.order_cash (
  order_id uuid primary key references public.orders (id) on delete cascade,
  courier_id bigint not null references public.couriers (id),
  collected_piasters bigint not null check (collected_piasters >= 0),
  paid_to_restaurant_piasters bigint not null check (paid_to_restaurant_piasters >= 0),
  recorded_at timestamptz not null default now()
);

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'admin'::public.app_role, false)
$$;

create or replace function public.current_courier_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.couriers c
  where c.user_id = auth.uid()
    and c.is_active
  limit 1
$$;

create or replace function public.current_restaurant_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public.restaurants r
  where r.user_id = auth.uid()
  limit 1
$$;

create or replace function public.set_order_restaurant_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  restaurant public.restaurants%rowtype;
begin
  if auth.uid() is not null and public.current_user_role() = 'restaurant'::public.app_role then
    new.restaurant_id := public.current_restaurant_id();
  end if;

  select r.* into restaurant
  from public.restaurants r
  where r.id = new.restaurant_id;

  if not found then
    raise exception 'Restaurant account not found';
  end if;

  new.restaurant_name := restaurant.name;
  new.restaurant_address := restaurant.address;
  new.restaurant_latitude := restaurant.latitude;
  new.restaurant_longitude := restaurant.longitude;
  return new;
end;
$$;

create trigger orders_restaurant_snapshot_before_insert
before insert on public.orders
for each row execute function public.set_order_restaurant_snapshot();

create or replace function public.accept_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() <> 'courier'::public.app_role then
    raise exception 'Only a courier can accept an order';
  end if;

  update public.orders o
  set status = 'accepted'::public.order_status,
      accepted_at = now(),
      updated_at = now()
  where o.id = p_order_id
    and o.courier_id = public.current_courier_id()
    and o.status = 'assigned'::public.order_status;

  if not found then
    raise exception 'Order is not assigned to this courier or is no longer available';
  end if;
end;
$$;

create or replace function public.advance_order_status(p_order_id uuid, p_next_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.order_status;
  next_status public.order_status;
begin
  if public.current_user_role() <> 'courier'::public.app_role then
    raise exception 'Only a courier can update delivery status';
  end if;
  if p_next_status not in ('picked_up', 'delivered') then
    raise exception 'Unsupported delivery status';
  end if;
  next_status := p_next_status::public.order_status;

  select o.status into current_status
  from public.orders o
  where o.id = p_order_id
    and o.courier_id = public.current_courier_id()
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
end;
$$;

create or replace function public.record_order_cash(
  p_order_id uuid,
  p_collected_piasters bigint,
  p_paid_piasters bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courier_id bigint := public.current_courier_id();
begin
  if public.current_user_role() <> 'courier'::public.app_role then
    raise exception 'Only a courier can record order cash';
  end if;
  if p_collected_piasters < 0 or p_paid_piasters < 0 then
    raise exception 'Cash amounts cannot be negative';
  end if;
  if not exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and o.courier_id = v_courier_id
      and o.status = 'delivered'::public.order_status
  ) then
    raise exception 'Only the courier assigned to a delivered order can record cash';
  end if;

  insert into public.order_cash (
    order_id, courier_id, collected_piasters, paid_to_restaurant_piasters, recorded_at
  )
  values (
    p_order_id, v_courier_id, p_collected_piasters, p_paid_piasters, now()
  )
  on conflict (order_id) do update
  set collected_piasters = excluded.collected_piasters,
      paid_to_restaurant_piasters = excluded.paid_to_restaurant_piasters,
      recorded_at = excluded.recorded_at
  where public.order_cash.courier_id = v_courier_id;

  if not found then
    raise exception 'Cash entry belongs to another courier';
  end if;
end;
$$;

create or replace function public.get_order_courier_contact(p_order_id uuid)
returns table (full_name text, phone text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() <> 'restaurant'::public.app_role then
    raise exception 'Only a restaurant can view courier contact details';
  end if;

  return query
  select c.full_name, c.phone
  from public.orders o
  join public.couriers c on c.id = o.courier_id
  where o.id = p_order_id
    and o.restaurant_id = public.current_restaurant_id()
    and o.status in (
      'accepted'::public.order_status,
      'picked_up'::public.order_status,
      'delivered'::public.order_status
    );
end;
$$;

create or replace function public.update_restaurant_location(p_latitude double precision, p_longitude double precision)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() <> 'restaurant'::public.app_role then
    raise exception 'Only a restaurant can update its location';
  end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Invalid coordinates';
  end if;
  update public.restaurants
  set latitude = p_latitude, longitude = p_longitude
  where id = public.current_restaurant_id();
  if not found then
    raise exception 'Restaurant account not found';
  end if;
end;
$$;

alter table public.profiles enable row level security;
alter table public.couriers enable row level security;
alter table public.courier_private_details enable row level security;
alter table public.courier_presence enable row level security;
alter table public.courier_locations enable row level security;
alter table public.restaurants enable row level security;
alter table public.orders enable row level security;
alter table public.order_cash enable row level security;

create policy "Profiles are visible to their owner and management"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

create policy "Couriers are visible to their owner and management"
on public.couriers for select to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "Private courier identity is management only"
on public.courier_private_details for select to authenticated
using (public.is_admin());

create policy "Courier presence is visible to owner and management"
on public.courier_presence for select to authenticated
using (
  courier_id = public.current_courier_id()
  or public.is_admin()
);

create policy "Couriers can start their own shift"
on public.courier_presence for insert to authenticated
with check (courier_id = public.current_courier_id());

create policy "Couriers can update their own shift"
on public.courier_presence for update to authenticated
using (courier_id = public.current_courier_id())
with check (courier_id = public.current_courier_id());

create policy "Management can view courier locations"
on public.courier_locations for select to authenticated
using (public.is_admin());

create policy "Couriers can share their location while on shift"
on public.courier_locations for insert to authenticated
with check (
  courier_id = public.current_courier_id()
  and exists (
    select 1 from public.courier_presence p
    where p.courier_id = public.courier_locations.courier_id and p.is_on_shift
  )
);

create policy "Couriers can update their latest location while on shift"
on public.courier_locations for update to authenticated
using (courier_id = public.current_courier_id())
with check (
  courier_id = public.current_courier_id()
  and exists (
    select 1 from public.courier_presence p
    where p.courier_id = public.courier_locations.courier_id and p.is_on_shift
  )
);

create policy "Restaurants are visible to their owner and management"
on public.restaurants for select to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "Management and order participants can read orders"
on public.orders for select to authenticated
using (
  public.is_admin()
  or restaurant_id = public.current_restaurant_id()
  or courier_id = public.current_courier_id()
);

create policy "Restaurants can submit their own orders"
on public.orders for insert to authenticated
with check (
  restaurant_id = public.current_restaurant_id()
  and status = 'pending'::public.order_status
);

create policy "Management can dispatch and cancel orders"
on public.orders for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Management and assigned couriers can read cash entries"
on public.order_cash for select to authenticated
using (
  public.is_admin()
  or courier_id = public.current_courier_id()
);

grant select on public.profiles to authenticated;
grant select on public.couriers to authenticated;
grant select on public.courier_private_details to authenticated;
grant select, insert, update on public.courier_presence to authenticated;
grant select, insert, update on public.courier_locations to authenticated;
grant select on public.restaurants to authenticated;
grant select, insert, update on public.orders to authenticated;
grant select on public.order_cash to authenticated;

revoke all on function public.current_user_role() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.current_courier_id() from public, anon;
revoke all on function public.current_restaurant_id() from public, anon;
revoke all on function public.accept_order(uuid) from public, anon;
revoke all on function public.advance_order_status(uuid, text) from public, anon;
revoke all on function public.record_order_cash(uuid, bigint, bigint) from public, anon;
revoke all on function public.get_order_courier_contact(uuid) from public, anon;
revoke all on function public.update_restaurant_location(double precision, double precision) from public, anon;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_courier_id() to authenticated;
grant execute on function public.current_restaurant_id() to authenticated;
grant execute on function public.accept_order(uuid) to authenticated;
grant execute on function public.advance_order_status(uuid, text) to authenticated;
grant execute on function public.record_order_cash(uuid, bigint, bigint) to authenticated;
grant execute on function public.get_order_courier_contact(uuid) to authenticated;
grant execute on function public.update_restaurant_location(double precision, double precision) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'courier-id-cards',
  'courier-id-cards',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy "Management can upload private courier identity images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'courier-id-cards'
  and public.is_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Management can read private courier identity images"
on storage.objects for select to authenticated
using (bucket_id = 'courier-id-cards' and public.is_admin());

create policy "Management can remove private courier identity images"
on storage.objects for delete to authenticated
using (bucket_id = 'courier-id-cards' and public.is_admin());

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'courier_locations'
  ) then
    alter publication supabase_realtime add table public.courier_locations;
  end if;
end;
$$;
