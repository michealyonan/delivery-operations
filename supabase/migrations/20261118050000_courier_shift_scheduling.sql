create table public.courier_shift_slots (
  id bigint generated always as identity primary key,
  shift_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references public.profiles (id) on delete set null,
  is_cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (shift_date, starts_at, ends_at)
);

create index courier_shift_slots_date_idx
  on public.courier_shift_slots (shift_date, starts_at)
  where not is_cancelled;

create table public.courier_shift_day_blocks (
  courier_id bigint not null references public.couriers (id) on delete cascade,
  shift_date date not null,
  reason text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (courier_id, shift_date)
);

create table public.courier_shift_bookings (
  id bigint generated always as identity primary key,
  slot_id bigint not null references public.courier_shift_slots (id) on delete restrict,
  courier_id bigint not null references public.couriers (id) on delete cascade,
  status text not null default 'booked'
    check (status in ('booked', 'swap_listed', 'completed', 'admin_removed', 'cancelled')),
  booked_at timestamptz not null default now(),
  swap_listed_at timestamptz,
  removed_at timestamptz,
  removed_by uuid references public.profiles (id) on delete set null
);

create unique index courier_shift_bookings_one_per_slot_idx
  on public.courier_shift_bookings (slot_id, courier_id)
  where status in ('booked', 'swap_listed', 'completed');
create index courier_shift_bookings_courier_idx
  on public.courier_shift_bookings (courier_id, booked_at desc);
create index courier_shift_bookings_slot_idx
  on public.courier_shift_bookings (slot_id, status);

alter table public.courier_shifts
  add column booking_id bigint references public.courier_shift_bookings (id) on delete set null;

create index courier_shifts_booking_idx on public.courier_shifts (booking_id);

create table public.courier_break_periods (
  id bigint generated always as identity primary key,
  courier_id bigint not null references public.couriers (id) on delete cascade,
  shift_id bigint references public.courier_shifts (id) on delete set null,
  started_at timestamptz not null default now(),
  scheduled_end_at timestamptz not null,
  ended_at timestamptz,
  started_by text not null check (started_by in ('admin', 'courier')),
  created_at timestamptz not null default now(),
  check (scheduled_end_at > started_at),
  check (ended_at is null or ended_at >= started_at)
);

create index courier_break_periods_courier_idx
  on public.courier_break_periods (courier_id, started_at desc);

create table public.courier_push_tokens (
  expo_push_token text primary key,
  courier_id bigint not null references public.couriers (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

alter table public.courier_shift_slots enable row level security;
alter table public.courier_shift_day_blocks enable row level security;
alter table public.courier_shift_bookings enable row level security;
alter table public.courier_break_periods enable row level security;
alter table public.courier_push_tokens enable row level security;

create policy "Management and couriers can read available shift slots"
on public.courier_shift_slots for select to authenticated
using (public.is_admin() or not is_cancelled);

create policy "Management and couriers can read shift bookings"
on public.courier_shift_bookings for select to authenticated
using (public.is_admin() or courier_id = public.current_courier_id());

create policy "Management and couriers can read shift day blocks"
on public.courier_shift_day_blocks for select to authenticated
using (public.is_admin() or courier_id = public.current_courier_id());

create policy "Management and couriers can read break periods"
on public.courier_break_periods for select to authenticated
using (public.is_admin() or courier_id = public.current_courier_id());

create policy "Couriers can register their own push tokens"
on public.courier_push_tokens for insert to authenticated
with check (courier_id = public.current_courier_id());

create policy "Couriers can update their own push tokens"
on public.courier_push_tokens for update to authenticated
using (courier_id = public.current_courier_id())
with check (courier_id = public.current_courier_id());

create policy "Couriers can remove their own push tokens"
on public.courier_push_tokens for delete to authenticated
using (courier_id = public.current_courier_id());

grant select on public.courier_shift_slots, public.courier_shift_day_blocks,
  public.courier_shift_bookings, public.courier_break_periods to authenticated;
grant insert, update, delete on public.courier_push_tokens to authenticated;
revoke insert, update, delete on public.courier_shift_slots,
  public.courier_shift_day_blocks, public.courier_shift_bookings,
  public.courier_break_periods from authenticated;

create or replace function public.admin_publish_courier_shift_slots(p_slots jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot jsonb;
  v_date date;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_inserted integer := 0;
  v_count integer;
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can publish shift slots';
  end if;
  if jsonb_typeof(p_slots) is distinct from 'array' then
    raise exception 'Shift slots must be provided as a list';
  end if;
  v_count := jsonb_array_length(p_slots);
  if v_count < 1 or v_count > 100 then
    raise exception 'Publish between 1 and 100 shift slots at a time';
  end if;

  for v_slot in select value from jsonb_array_elements(p_slots)
  loop
    v_date := (v_slot->>'shift_date')::date;
    v_starts_at := (v_slot->>'starts_at')::timestamptz;
    v_ends_at := (v_slot->>'ends_at')::timestamptz;
    if v_starts_at <= now() or v_ends_at <= v_starts_at
       or v_ends_at - v_starts_at > interval '24 hours' then
      raise exception 'Shift slot dates or times are invalid';
    end if;
    if v_date < current_date or v_date > current_date + 90 then
      raise exception 'Shift slots must be within the next 90 days';
    end if;

    insert into public.courier_shift_slots (shift_date, starts_at, ends_at, created_by)
    values (v_date, v_starts_at, v_ends_at, auth.uid())
    on conflict (shift_date, starts_at, ends_at) do nothing;
    if found then
      v_inserted := v_inserted + 1;
    end if;
  end loop;
  return v_inserted;
end;
$$;

create or replace function public.courier_book_shift(p_slot_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courier_id bigint := public.current_courier_id();
  v_courier public.couriers%rowtype;
  v_slot public.courier_shift_slots%rowtype;
  v_booking_id bigint;
begin
  if public.current_user_role() is distinct from 'courier'::public.app_role
     or v_courier_id is null then
    raise exception 'Only a courier can book a shift';
  end if;

  select c.* into v_courier
  from public.couriers c
  where c.id = v_courier_id
  for update;
  if not found or not v_courier.is_active or v_courier.terminated_at is not null
     or v_courier.contract_end_date < current_date then
    raise exception 'This courier account cannot book shifts';
  end if;

  select s.* into v_slot
  from public.courier_shift_slots s
  where s.id = p_slot_id and not s.is_cancelled
  for update;
  if not found or v_slot.starts_at <= now()
     or v_slot.starts_at > now() + interval '7 days' then
    raise exception 'You can only book available shifts in the next 7 days';
  end if;
  if exists (
    select 1 from public.courier_shift_day_blocks b
    where b.courier_id = v_courier_id and b.shift_date = v_slot.shift_date
  ) then
    raise exception 'This courier is blocked from working on that date';
  end if;
  if exists (
    select 1
    from public.courier_shift_bookings b
    join public.courier_shift_slots s on s.id = b.slot_id
    where b.courier_id = v_courier_id
      and b.status in ('booked', 'swap_listed', 'completed')
      and (s.shift_date = v_slot.shift_date
        or (s.starts_at < v_slot.ends_at and s.ends_at > v_slot.starts_at))
  ) then
    raise exception 'This courier already has a shift booked on that date';
  end if;

  insert into public.courier_shift_bookings (slot_id, courier_id)
  values (v_slot.id, v_courier_id)
  returning id into v_booking_id;
  return v_booking_id;
end;
$$;

create or replace function public.courier_offer_shift_swap(p_booking_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'courier'::public.app_role then
    raise exception 'Only a courier can offer a shift for exchange';
  end if;
  update public.courier_shift_bookings b
  set status = 'swap_listed', swap_listed_at = now()
  from public.courier_shift_slots s
  where b.id = p_booking_id
    and b.slot_id = s.id
    and b.courier_id = public.current_courier_id()
    and b.status = 'booked'
    and s.starts_at > now();
  if not found then
    raise exception 'This shift cannot be offered for exchange';
  end if;
end;
$$;

create or replace function public.admin_remove_courier_shift(p_booking_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can remove a courier shift';
  end if;
  update public.courier_shift_bookings b
  set status = 'admin_removed', removed_at = now(), removed_by = auth.uid()
  from public.courier_shift_slots s
  where b.id = p_booking_id
    and b.slot_id = s.id
    and b.status in ('booked', 'swap_listed')
    and s.starts_at > now()
    and not exists (
      select 1 from public.courier_shifts cs
      where cs.booking_id = b.id and cs.ended_at is null
    );
  if not found then
    raise exception 'This shift has started or is no longer available to remove';
  end if;
end;
$$;

create or replace function public.admin_block_courier_shift_date(
  p_courier_id bigint,
  p_shift_date date,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can block a courier shift date';
  end if;
  if p_shift_date < current_date then
    raise exception 'A past date cannot be blocked';
  end if;
  if exists (
    select 1 from public.courier_shifts cs
    where cs.courier_id = p_courier_id
      and cs.ended_at is null
      and exists (
        select 1
        from public.courier_shift_bookings b
        join public.courier_shift_slots s on s.id = b.slot_id
        where b.id = cs.booking_id and s.shift_date = p_shift_date
      )
  ) then
    raise exception 'The courier is already working on that date';
  end if;

  insert into public.courier_shift_day_blocks (courier_id, shift_date, reason, created_by)
  values (p_courier_id, p_shift_date, coalesce(btrim(p_reason), ''), auth.uid())
  on conflict (courier_id, shift_date) do update
    set reason = excluded.reason, created_by = excluded.created_by, created_at = now();

  update public.courier_shift_bookings b
  set status = 'admin_removed', removed_at = now(), removed_by = auth.uid()
  from public.courier_shift_slots s
  where b.slot_id = s.id
    and b.courier_id = p_courier_id
    and s.shift_date = p_shift_date
    and s.starts_at > now()
    and b.status in ('booked', 'swap_listed');
end;
$$;

create or replace function public.admin_unblock_courier_shift_date(
  p_courier_id bigint,
  p_shift_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can unblock a courier shift date';
  end if;
  delete from public.courier_shift_day_blocks
  where courier_id = p_courier_id and shift_date = p_shift_date;
end;
$$;

create or replace function public.record_courier_shift_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking_id bigint;
  v_shift_id bigint;
begin
  if tg_op = 'INSERT' and new.is_on_shift then
    select b.id into v_booking_id
    from public.courier_shift_bookings b
    join public.courier_shift_slots s on s.id = b.slot_id
    where b.courier_id = new.courier_id
      and b.status in ('booked', 'swap_listed')
      and now() >= s.starts_at - interval '30 minutes'
      and now() < s.ends_at
    order by s.starts_at
    limit 1;
    insert into public.courier_shifts (courier_id, started_at, booking_id)
    values (new.courier_id, now(), v_booking_id);
    if v_booking_id is not null then
      update public.courier_shift_bookings
      set status = 'booked', swap_listed_at = null
      where id = v_booking_id;
    end if;
  elsif tg_op = 'UPDATE' and new.is_on_shift and not old.is_on_shift then
    select b.id into v_booking_id
    from public.courier_shift_bookings b
    join public.courier_shift_slots s on s.id = b.slot_id
    where b.courier_id = new.courier_id
      and b.status in ('booked', 'swap_listed')
      and now() >= s.starts_at - interval '30 minutes'
      and now() < s.ends_at
    order by s.starts_at
    limit 1;
    if v_booking_id is null then
      raise exception 'A valid booked shift is required to start work';
    end if;
    insert into public.courier_shifts (courier_id, started_at, booking_id)
    values (new.courier_id, now(), v_booking_id);
    update public.courier_shift_bookings
    set status = 'booked', swap_listed_at = null
    where id = v_booking_id;
  elsif tg_op = 'UPDATE' and old.is_on_shift and not new.is_on_shift then
    update public.courier_shifts
    set status = 'closed',
        ended_at = now(),
        closed_by = auth.uid()
    where courier_id = new.courier_id and ended_at is null
    returning booking_id into v_booking_id;
    if v_booking_id is not null then
      update public.courier_shift_bookings
      set status = 'completed'
      where id = v_booking_id and status in ('booked', 'swap_listed');
    end if;
  end if;
  return new;
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
  v_courier_id bigint := public.current_courier_id();
  v_is_on_shift boolean;
  v_close_requested_at timestamptz;
  v_booking_id bigint;
begin
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

  select p.is_on_shift, p.shift_close_requested_at
    into v_is_on_shift, v_close_requested_at
  from public.courier_presence p
  where p.courier_id = v_courier_id
  for update;

  if p_active then
    if coalesce(v_is_on_shift, false) then
      raise exception 'The courier is already on shift';
    end if;
    select b.id into v_booking_id
    from public.courier_shift_bookings b
    join public.courier_shift_slots s on s.id = b.slot_id
    where b.courier_id = v_courier_id
      and b.status in ('booked', 'swap_listed')
      and now() >= s.starts_at - interval '30 minutes'
      and now() < s.ends_at
      and not exists (
        select 1 from public.courier_shift_day_blocks d
        where d.courier_id = b.courier_id and d.shift_date = s.shift_date
      )
    order by s.starts_at
    limit 1
    for update of b;
    if v_booking_id is null then
      raise exception 'You can start a shift only 30 minutes before its booked start time';
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
    set shift_close_requested_at = now(), updated_at = now()
    where courier_id = v_courier_id;
    update public.courier_shifts
    set status = 'close_requested', close_requested_at = now()
    where courier_id = v_courier_id and ended_at is null and status = 'open';
    if not found then
      raise exception 'No open shift record was found';
    end if;
  end if;
end;
$$;

create or replace function public.record_courier_break_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift_id bigint;
begin
  if new.break_until is not null and new.break_until is distinct from old.break_until then
    select id into v_shift_id
    from public.courier_shifts
    where courier_id = new.courier_id and ended_at is null
    order by started_at desc
    limit 1;
    insert into public.courier_break_periods (
      courier_id, shift_id, scheduled_end_at, started_by
    )
    values (
      new.courier_id, v_shift_id, new.break_until,
      coalesce(new.break_started_by, 'courier')
    );
  elsif new.break_until is null and old.break_until is not null then
    update public.courier_break_periods
    set ended_at = greatest(started_at, now())
    where courier_id = new.courier_id and ended_at is null;
  end if;
  return new;
end;
$$;

create trigger courier_presence_break_history
after update of break_until on public.courier_presence
for each row execute function public.record_courier_break_change();

revoke all on function public.admin_publish_courier_shift_slots(jsonb) from public, anon;
revoke all on function public.courier_book_shift(bigint) from public, anon;
revoke all on function public.courier_offer_shift_swap(bigint) from public, anon;
revoke all on function public.admin_remove_courier_shift(bigint) from public, anon;
revoke all on function public.admin_block_courier_shift_date(bigint, date, text) from public, anon;
revoke all on function public.admin_unblock_courier_shift_date(bigint, date) from public, anon;
revoke all on function public.set_courier_shift(boolean) from public, anon;
grant execute on function public.admin_publish_courier_shift_slots(jsonb) to authenticated;
grant execute on function public.courier_book_shift(bigint) to authenticated;
grant execute on function public.courier_offer_shift_swap(bigint) to authenticated;
grant execute on function public.admin_remove_courier_shift(bigint) to authenticated;
grant execute on function public.admin_block_courier_shift_date(bigint, date, text) to authenticated;
grant execute on function public.admin_unblock_courier_shift_date(bigint, date) to authenticated;
grant execute on function public.set_courier_shift(boolean) to authenticated;
