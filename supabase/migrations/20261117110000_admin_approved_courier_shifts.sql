alter table public.courier_presence
  add column if not exists shift_close_requested_at timestamptz;

create table public.courier_shifts (
  id bigint generated always as identity primary key,
  courier_id bigint not null references public.couriers (id) on delete cascade,
  started_at timestamptz,
  close_requested_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  status text not null default 'open'
    check (status in ('open', 'close_requested', 'closed')),
  closed_by uuid references public.profiles (id) on delete set null,
  check ((status = 'closed') = (ended_at is not null))
);

insert into public.courier_shifts (courier_id, started_at)
select p.courier_id, null
from public.courier_presence p
where p.is_on_shift;

create unique index courier_shifts_one_open_per_courier_idx
  on public.courier_shifts (courier_id)
  where ended_at is null;

create index courier_shifts_courier_started_idx
  on public.courier_shifts (courier_id, started_at desc);

alter table public.courier_shifts enable row level security;

create policy "Users can view their courier shift records"
on public.courier_shifts for select to authenticated
using (public.is_admin() or courier_id = public.current_courier_id());

grant select on public.courier_shifts to authenticated;
revoke insert, update, delete on public.courier_shifts from authenticated;
revoke insert, update on public.courier_presence from authenticated;
drop policy if exists "Couriers can start their own shift" on public.courier_presence;
drop policy if exists "Couriers can update their own shift" on public.courier_presence;

create or replace function public.record_courier_shift_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.is_on_shift then
    insert into public.courier_shifts (courier_id, started_at)
    values (new.courier_id, now());
  elsif tg_op = 'UPDATE' and new.is_on_shift and not old.is_on_shift then
    insert into public.courier_shifts (courier_id, started_at)
    values (new.courier_id, now());
  elsif tg_op = 'UPDATE' and old.is_on_shift and not new.is_on_shift then
    update public.courier_shifts
    set status = 'closed',
        ended_at = now(),
        closed_by = auth.uid()
    where courier_id = new.courier_id
      and ended_at is null;
  end if;
  return new;
end;
$$;

create trigger courier_presence_shift_history
after insert or update of is_on_shift on public.courier_presence
for each row execute function public.record_courier_shift_change();

create or replace function public.set_courier_shift(p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courier public.couriers%rowtype;
  v_courier_id bigint := public.current_courier_id();
  v_is_on_shift boolean;
  v_close_requested_at timestamptz;
begin
  if public.current_user_role() is distinct from 'courier'::public.app_role or v_courier_id is null then
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

  select p.is_on_shift, p.shift_close_requested_at
    into v_is_on_shift, v_close_requested_at
  from public.courier_presence p
  where p.courier_id = v_courier_id
  for update;

  if p_active then
    if coalesce(v_is_on_shift, false) then
      raise exception 'The courier is already on shift';
    end if;
    insert into public.courier_presence (
      courier_id, is_on_shift, break_until, shift_close_requested_at, updated_at
    )
    values (v_courier_id, true, null, null, now())
    on conflict (courier_id) do update
      set is_on_shift = true,
          break_until = null,
          shift_close_requested_at = null,
          updated_at = now();
  else
    if not coalesce(v_is_on_shift, false) then
      raise exception 'The courier is not on shift';
    end if;
    if v_close_requested_at is not null then
      raise exception 'A shift closure request is already waiting for management approval';
    end if;

    update public.courier_presence
    set shift_close_requested_at = now(),
        updated_at = now()
    where courier_id = v_courier_id;

    update public.courier_shifts
    set status = 'close_requested',
        close_requested_at = now()
    where courier_id = v_courier_id
      and ended_at is null
      and status = 'open';
    if not found then
      raise exception 'No open shift record was found';
    end if;
  end if;
end;
$$;

create or replace function public.admin_approve_courier_shift_close(p_courier_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_on_shift boolean;
  v_close_requested_at timestamptz;
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can approve shift closure';
  end if;

  select p.is_on_shift, p.shift_close_requested_at
    into v_is_on_shift, v_close_requested_at
  from public.courier_presence p
  where p.courier_id = p_courier_id
  for update;
  if not found or not coalesce(v_is_on_shift, false) or v_close_requested_at is null then
    raise exception 'No pending shift closure request was found';
  end if;

  if exists (
    select 1
    from public.orders o
    where o.courier_id = p_courier_id
      and o.status in (
        'assigned'::public.order_status,
        'accepted'::public.order_status,
        'picked_up'::public.order_status
      )
  ) then
    raise exception 'Complete or transfer the courier''s active orders before approving shift closure';
  end if;

  update public.courier_presence
  set is_on_shift = false,
      break_until = null,
      shift_close_requested_at = null,
      updated_at = now()
  where courier_id = p_courier_id;
end;
$$;

revoke all on function public.set_courier_shift(boolean) from public, anon;
revoke all on function public.admin_approve_courier_shift_close(bigint) from public, anon;
grant execute on function public.set_courier_shift(boolean) to authenticated;
grant execute on function public.admin_approve_courier_shift_close(bigint) to authenticated;
