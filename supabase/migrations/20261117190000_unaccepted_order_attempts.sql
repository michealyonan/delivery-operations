create table public.order_assignment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  courier_id bigint not null references public.couriers (id),
  order_code text not null,
  assigned_at timestamptz not null,
  status text not null check (status in ('awaiting', 'not_accepted', 'accepted')),
  accepted_at timestamptz,
  resolved_at timestamptz,
  unique (order_id, assigned_at),
  check (
    (status = 'awaiting' and accepted_at is null and resolved_at is null)
    or (status = 'not_accepted' and accepted_at is null and resolved_at is not null)
    or (status = 'accepted' and accepted_at is not null and resolved_at is not null)
  )
);

create index order_assignment_attempts_courier_assigned_idx
  on public.order_assignment_attempts (courier_id, assigned_at desc);
create index order_assignment_attempts_status_assigned_idx
  on public.order_assignment_attempts (status, assigned_at desc);

alter table public.order_assignment_attempts enable row level security;

create policy "Management and assigned couriers can read assignment attempts"
on public.order_assignment_attempts for select to authenticated
using (
  public.is_admin()
  or courier_id = public.current_courier_id()
);

grant select on public.order_assignment_attempts to authenticated;
revoke insert, update, delete on public.order_assignment_attempts from authenticated;

insert into public.order_assignment_attempts (
  order_id,
  courier_id,
  order_code,
  assigned_at,
  status,
  accepted_at,
  resolved_at
)
select
  o.id,
  o.courier_id,
  o.order_code,
  o.assigned_at,
  'awaiting',
  null,
  null
from public.orders o
where o.status = 'assigned'::public.order_status
  and o.courier_id is not null
  and o.assigned_at is not null
on conflict (order_id, assigned_at) do nothing;

insert into public.order_assignment_attempts (
  order_id,
  courier_id,
  order_code,
  assigned_at,
  status,
  accepted_at,
  resolved_at
)
select
  o.id,
  o.last_unaccepted_courier_id,
  o.order_code,
  o.assignment_expired_at - interval '120 seconds',
  'not_accepted',
  null,
  o.assignment_expired_at
from public.orders o
where o.status = 'pending'::public.order_status
  and o.last_unaccepted_courier_id is not null
  and o.assignment_expired_at is not null
on conflict (order_id, assigned_at) do nothing;

create or replace function public.reset_expired_order_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'assigned'::public.order_status
    and (
      old.status is distinct from new.status
      or old.courier_id is distinct from new.courier_id
      or old.assigned_at is distinct from new.assigned_at
    )
  then
    new.assignment_expired_at := null;
    new.last_unaccepted_courier_id := null;
  end if;
  return new;
end;
$$;

create trigger orders_reset_expired_assignment
before update of status, courier_id, assigned_at
on public.orders
for each row execute function public.reset_expired_order_assignment();

create or replace function public.track_order_assignment_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'assigned'::public.order_status
      and new.courier_id is not null
      and new.assigned_at is not null
    then
      insert into public.order_assignment_attempts (
        order_id, courier_id, order_code, assigned_at, status
      )
      values (
        new.id, new.courier_id, new.order_code, new.assigned_at, 'awaiting'
      )
      on conflict (order_id, assigned_at) do nothing;
    end if;
    return new;
  end if;

  if old.status = 'assigned'::public.order_status then
    if new.status = 'accepted'::public.order_status
      and new.courier_id = old.courier_id
    then
      update public.order_assignment_attempts
      set status = 'accepted',
          accepted_at = coalesce(new.accepted_at, now()),
          resolved_at = coalesce(new.accepted_at, now())
      where order_id = old.id
        and courier_id = old.courier_id
        and assigned_at = old.assigned_at
        and status = 'awaiting';
    elsif new.status <> 'assigned'::public.order_status
      or new.courier_id is distinct from old.courier_id
      or new.assigned_at is distinct from old.assigned_at
    then
      update public.order_assignment_attempts
      set status = 'not_accepted',
          resolved_at = coalesce(new.assignment_expired_at, new.updated_at, now())
      where order_id = old.id
        and courier_id = old.courier_id
        and assigned_at = old.assigned_at
        and status = 'awaiting';
    end if;
  end if;

  if new.status = 'assigned'::public.order_status
    and new.courier_id is not null
    and new.assigned_at is not null
    and (
      old.status <> 'assigned'::public.order_status
      or old.courier_id is distinct from new.courier_id
      or old.assigned_at is distinct from new.assigned_at
    )
  then
    insert into public.order_assignment_attempts (
      order_id, courier_id, order_code, assigned_at, status
    )
    values (
      new.id, new.courier_id, new.order_code, new.assigned_at, 'awaiting'
    )
    on conflict (order_id, assigned_at) do nothing;
  end if;

  return new;
end;
$$;

create trigger orders_track_assignment_attempt
after insert or update of status, courier_id, assigned_at, accepted_at
on public.orders
for each row execute function public.track_order_assignment_attempt();

create policy "Couriers can read orders from their unaccepted assignments"
on public.orders for select to authenticated
using (
  exists (
    select 1
    from public.order_assignment_attempts a
    where a.order_id = public.orders.id
      and a.courier_id = public.current_courier_id()
      and a.status = 'not_accepted'
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_assignment_attempts'
  ) then
    alter publication supabase_realtime add table public.order_assignment_attempts;
  end if;
end;
$$;
