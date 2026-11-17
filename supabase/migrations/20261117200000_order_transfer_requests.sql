create table public.order_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  from_courier_id bigint not null references public.couriers (id),
  from_courier_name text not null,
  from_courier_code text not null,
  from_courier_phone text not null,
  to_courier_id bigint references public.couriers (id),
  to_courier_name text,
  to_courier_code text,
  reason text not null check (
    reason in (
      'vehicle_issue',
      'health_issue',
      'restaurant_delay',
      'customer_unavailable',
      'order_issue',
      'other'
    )
  ),
  reason_details text not null default '' check (char_length(reason_details) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requires_handoff boolean not null default false,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id),
  check (
    (status = 'pending' and to_courier_id is null and resolved_at is null and resolved_by is null)
    or (
      status = 'approved'
      and to_courier_id is not null
      and to_courier_name is not null
      and to_courier_code is not null
      and resolved_at is not null
      and resolved_by is not null
    )
    or (
      status = 'rejected'
      and to_courier_id is null
      and resolved_at is not null
    )
  )
);

create unique index order_transfer_requests_one_pending_per_order_idx
  on public.order_transfer_requests (order_id)
  where status = 'pending';
create index order_transfer_requests_status_requested_idx
  on public.order_transfer_requests (status, requested_at desc);
create index order_transfer_requests_courier_requested_idx
  on public.order_transfer_requests (from_courier_id, requested_at desc);

alter table public.order_transfer_requests enable row level security;

create policy "Transfer participants and management can read requests"
on public.order_transfer_requests for select to authenticated
using (
  public.is_admin()
  or coalesce(public.current_user_role()::text, '') = 'support'
  or from_courier_id = public.current_courier_id()
  or to_courier_id = public.current_courier_id()
);

grant select on public.order_transfer_requests to authenticated;
revoke insert, update, delete on public.order_transfer_requests from authenticated;

create or replace function public.request_order_transfer(
  p_order_id uuid,
  p_reason text,
  p_reason_details text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courier_id bigint := public.current_courier_id();
  v_courier_name text;
  v_courier_code text;
  v_courier_phone text;
  v_order_status public.order_status;
  v_order_courier_id bigint;
  v_request_id uuid;
  v_details text := btrim(coalesce(p_reason_details, ''));
begin
  if public.current_user_role() is distinct from 'courier'::public.app_role then
    raise exception 'Only the assigned courier can request an order transfer';
  end if;
  if v_courier_id is null then
    raise exception 'Courier account not found';
  end if;
  if p_reason is null or p_reason not in (
    'vehicle_issue',
    'health_issue',
    'restaurant_delay',
    'customer_unavailable',
    'order_issue',
    'other'
  ) then
    raise exception 'Choose a valid transfer reason';
  end if;
  if char_length(v_details) > 500 then
    raise exception 'Transfer details must be 500 characters or fewer';
  end if;
  if p_reason = 'other' and v_details = '' then
    raise exception 'Details are required for the other reason';
  end if;

  select c.full_name, c.courier_code, c.phone
    into v_courier_name, v_courier_code, v_courier_phone
  from public.couriers c
  where c.id = v_courier_id
    and c.user_id = auth.uid()
  for update;
  if not found then
    raise exception 'Courier account not found';
  end if;

  select o.status, o.courier_id
    into v_order_status, v_order_courier_id
  from public.orders o
  where o.id = p_order_id
  for update;
  if not found
    or v_order_courier_id <> v_courier_id
    or v_order_status not in (
      'accepted'::public.order_status,
      'picked_up'::public.order_status
    )
  then
    raise exception 'Only the assigned courier can request transfer of an accepted active order';
  end if;

  if exists (
    select 1
    from public.order_transfer_requests r
    where r.order_id = p_order_id
      and r.status = 'pending'
  ) then
    raise exception 'A transfer request is already pending for this order';
  end if;

  insert into public.order_transfer_requests (
    order_id,
    from_courier_id,
    from_courier_name,
    from_courier_code,
    from_courier_phone,
    reason,
    reason_details
  )
  values (
    p_order_id,
    v_courier_id,
    v_courier_name,
    v_courier_code,
    v_courier_phone,
    p_reason,
    v_details
  )
  returning id into v_request_id;
  return v_request_id;
end;
$$;

create or replace function public.admin_decide_order_transfer(
  p_request_id uuid,
  p_approve boolean
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_request public.order_transfer_requests%rowtype;
  v_order public.orders%rowtype;
  v_candidate record;
begin
  if p_approve is null then
    raise exception 'Choose whether to approve or reject the transfer request';
  end if;
  if coalesce(public.current_user_role()::text, '') not in ('admin', 'support') then
    raise exception 'Only management or support can decide order transfers';
  end if;

  select r.order_id into v_order_id
  from public.order_transfer_requests r
  where r.id = p_request_id;
  if not found then
    raise exception 'Transfer request not found';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = v_order_id
  for update;
  if not found then
    raise exception 'Order not found';
  end if;

  select r.* into v_request
  from public.order_transfer_requests r
  where r.id = p_request_id
  for update;
  if not found or v_request.status <> 'pending' then
    raise exception 'Transfer request is no longer pending';
  end if;
  if v_order.courier_id <> v_request.from_courier_id
    or v_order.status not in (
      'accepted'::public.order_status,
      'picked_up'::public.order_status
    )
  then
    raise exception 'Order is no longer available for transfer';
  end if;

  if not p_approve then
    update public.order_transfer_requests
    set status = 'rejected',
        resolved_at = now(),
        resolved_by = auth.uid()
    where id = p_request_id;
    return null;
  end if;

  if v_order.restaurant_latitude is null or v_order.restaurant_longitude is null then
    raise exception 'Restaurant location is required to find the nearest courier';
  end if;

  for v_candidate in
    select c.id, c.full_name, c.courier_code
    from public.couriers c
    join public.courier_presence p on p.courier_id = c.id
    join public.courier_locations l on l.courier_id = c.id
    where c.id <> v_request.from_courier_id
      and c.is_active
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

    update public.order_transfer_requests
    set status = 'approved',
        to_courier_id = v_candidate.id,
        to_courier_name = v_candidate.full_name,
        to_courier_code = v_candidate.courier_code,
        requires_handoff = v_order.status = 'picked_up'::public.order_status,
        resolved_at = now(),
        resolved_by = auth.uid()
    where id = p_request_id;

    update public.orders
    set courier_id = v_candidate.id,
        status = 'assigned'::public.order_status,
        assigned_at = now(),
        accepted_at = null,
        updated_at = now()
    where id = v_order.id;

    return v_candidate.id;
  end loop;

  raise exception 'No available courier with a recent location can receive this transfer';
end;
$$;

create or replace function public.close_stale_order_transfer_requests()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.courier_id is distinct from new.courier_id
    or new.status not in (
      'accepted'::public.order_status,
      'picked_up'::public.order_status
    )
  then
    update public.order_transfer_requests
    set status = 'rejected',
        resolved_at = now()
    where order_id = new.id
      and status = 'pending';
  end if;
  return new;
end;
$$;

create trigger orders_close_stale_transfer_requests
after update of status, courier_id on public.orders
for each row execute function public.close_stale_order_transfer_requests();

revoke all on function public.request_order_transfer(uuid, text, text) from public, anon;
revoke all on function public.admin_decide_order_transfer(uuid, boolean) from public, anon;
grant execute on function public.request_order_transfer(uuid, text, text) to authenticated;
grant execute on function public.admin_decide_order_transfer(uuid, boolean) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_transfer_requests'
  ) then
    alter publication supabase_realtime add table public.order_transfer_requests;
  end if;
end;
$$;
