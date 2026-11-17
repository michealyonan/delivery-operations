create table public.order_returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id),
  courier_id bigint not null references public.couriers (id),
  restaurant_id bigint not null references public.restaurants (id),
  status text not null default 'in_transit'
    check (status in ('in_transit', 'returned_by_courier', 'closed')),
  reason text not null default 'رفض العميل الاستلام',
  started_at timestamptz not null default now(),
  returned_at timestamptz,
  photo_path text,
  courier_received_restaurant_refund boolean,
  restaurant_confirmed_at timestamptz,
  restaurant_confirmed_by uuid references public.profiles (id),
  check (
    (
      status = 'in_transit'
      and returned_at is null
      and photo_path is null
      and courier_received_restaurant_refund is null
      and restaurant_confirmed_at is null
      and restaurant_confirmed_by is null
    )
    or (
      status = 'returned_by_courier'
      and returned_at is not null
      and photo_path is not null
      and courier_received_restaurant_refund is not null
      and restaurant_confirmed_at is null
      and restaurant_confirmed_by is null
    )
    or (
      status = 'closed'
      and returned_at is not null
      and photo_path is not null
      and courier_received_restaurant_refund is not null
      and restaurant_confirmed_at is not null
      and restaurant_confirmed_by is not null
    )
  )
);

create index order_returns_status_started_idx
  on public.order_returns (status, started_at desc);
create index order_returns_courier_started_idx
  on public.order_returns (courier_id, started_at desc);

alter table public.order_returns enable row level security;

create policy "Participants can read order return operations"
on public.order_returns for select to authenticated
using (
  public.is_admin()
  or courier_id in (
    select c.id from public.couriers c where c.user_id = auth.uid()
  )
  or restaurant_id in (
    select r.id from public.restaurants r where r.user_id = auth.uid()
  )
);

grant select on public.order_returns to authenticated;
revoke insert, update, delete on public.order_returns from authenticated;

create or replace function public.start_order_return(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courier_id bigint;
  v_order public.orders%rowtype;
  v_return_id uuid;
begin
  if public.current_user_role() is distinct from 'courier'::public.app_role then
    raise exception 'Only the assigned courier can start an order return';
  end if;

  select c.id into v_courier_id
  from public.couriers c
  where c.user_id = auth.uid();
  if not found then
    raise exception 'Courier account not found';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
    and o.courier_id = v_courier_id
  for update;
  if not found or v_order.status <> 'picked_up'::public.order_status then
    raise exception 'Only the assigned courier can return an order that is out for delivery';
  end if;
  if exists (
    select 1 from public.order_returns r where r.order_id = p_order_id
  ) then
    raise exception 'A return operation already exists for this order';
  end if;

  insert into public.order_returns (order_id, courier_id, restaurant_id)
  values (v_order.id, v_courier_id, v_order.restaurant_id)
  returning id into v_return_id;

  update public.orders
  set status = 'cancelled'::public.order_status,
      updated_at = now()
  where id = v_order.id;

  return v_return_id;
end;
$$;

create or replace function public.complete_order_return(
  p_return_id uuid,
  p_photo_path text,
  p_courier_received_restaurant_refund boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courier_id bigint;
  v_return public.order_returns%rowtype;
  v_folders text[];
begin
  if public.current_user_role() is distinct from 'courier'::public.app_role then
    raise exception 'Only the assigned courier can complete an order return';
  end if;
  if p_courier_received_restaurant_refund is null then
    raise exception 'Record whether the restaurant refunded the courier';
  end if;

  select c.id into v_courier_id
  from public.couriers c
  where c.user_id = auth.uid();
  if not found then
    raise exception 'Courier account not found';
  end if;

  select r.* into v_return
  from public.order_returns r
  where r.id = p_return_id
    and r.courier_id = v_courier_id
  for update;
  if not found or v_return.status <> 'in_transit' then
    raise exception 'This return operation is not active for the courier';
  end if;

  v_folders := storage.foldername(coalesce(p_photo_path, ''));
  if p_photo_path is null
    or coalesce(array_length(v_folders, 1), 0) <> 2
    or v_folders[1] <> v_courier_id::text
    or v_folders[2] <> v_return.order_id::text
  then
    raise exception 'The return photo does not belong to this courier and order';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'courier-return-photos'
      and o.name = p_photo_path
  ) then
    raise exception 'Upload the return photo before completing the return';
  end if;

  update public.order_returns
  set status = 'returned_by_courier',
      returned_at = now(),
      photo_path = p_photo_path,
      courier_received_restaurant_refund = p_courier_received_restaurant_refund
  where id = p_return_id;
end;
$$;

create or replace function public.confirm_order_return(p_return_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'restaurant'::public.app_role then
    raise exception 'Only the restaurant can confirm receipt of a returned order';
  end if;

  update public.order_returns
  set status = 'closed',
      restaurant_confirmed_at = now(),
      restaurant_confirmed_by = auth.uid()
  where id = p_return_id
    and restaurant_id = public.current_restaurant_id()
    and status = 'returned_by_courier';
  if not found then
    raise exception 'This returned order is not awaiting confirmation for the restaurant';
  end if;
end;
$$;

revoke all on function public.start_order_return(uuid) from public, anon;
revoke all on function public.complete_order_return(uuid, text, boolean) from public, anon;
revoke all on function public.confirm_order_return(uuid) from public, anon;
grant execute on function public.start_order_return(uuid) to authenticated;
grant execute on function public.complete_order_return(uuid, text, boolean) to authenticated;
grant execute on function public.confirm_order_return(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'courier-return-photos',
  'courier-return-photos',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy "Assigned couriers can upload return photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'courier-return-photos'
  and exists (
    select 1
    from public.couriers c
    join public.order_returns r on r.courier_id = c.id
    where c.user_id = auth.uid()
      and r.status = 'in_transit'
      and r.order_id::text = (storage.foldername(name))[2]
      and c.id::text = (storage.foldername(name))[1]
  )
);

create policy "Participants can read return photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'courier-return-photos'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.order_returns r
      join public.couriers c on c.id = r.courier_id
      where r.order_id::text = (storage.foldername(name))[2]
        and c.id::text = (storage.foldername(name))[1]
        and (
          c.user_id = auth.uid()
          or r.restaurant_id = public.current_restaurant_id()
        )
    )
  )
);

create policy "Management or active courier can remove return photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'courier-return-photos'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.couriers c
      join public.order_returns r on r.courier_id = c.id
      where c.user_id = auth.uid()
        and r.status = 'in_transit'
        and r.order_id::text = (storage.foldername(name))[2]
        and c.id::text = (storage.foldername(name))[1]
    )
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_returns'
  ) then
    alter publication supabase_realtime add table public.order_returns;
  end if;
end;
$$;
