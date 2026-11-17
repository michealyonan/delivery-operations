alter table public.courier_presence
  add column break_started_by text
  check (break_started_by in ('admin', 'courier'));

update public.courier_presence
set break_started_by = 'admin'
where break_until > now();

create or replace function public.prevent_courier_from_ending_management_break()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'courier'::public.app_role then
    return new;
  end if;

  if old.break_until > now()
     and old.break_started_by is distinct from 'courier'
     and (
       new.break_until is distinct from old.break_until
       or new.break_started_by is distinct from old.break_started_by
     ) then
    raise exception 'Only management can end a management-started break';
  end if;

  if new.break_until > now()
     and new.break_started_by is distinct from 'courier' then
    raise exception 'Only management can start a management break';
  end if;

  return new;
end;
$$;

create trigger courier_break_management_guard
before update of break_until, break_started_by on public.courier_presence
for each row
execute function public.prevent_courier_from_ending_management_break();

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
      break_started_by = 'courier',
      updated_at = now()
  where courier_id = v_courier_id
  returning break_until into v_break_until;

  return v_break_until;
end;
$$;

create or replace function public.admin_start_courier_break(
  p_courier_id bigint,
  p_duration_minutes integer
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courier public.couriers%rowtype;
  v_is_on_shift boolean;
  v_break_until timestamptz;
  v_shift_close_requested_at timestamptz;
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can start a courier break';
  end if;
  if p_duration_minutes not in (5, 10, 15, 20, 30, 60) then
    raise exception 'Choose a supported break duration';
  end if;

  select c.* into v_courier
  from public.couriers c
  where c.id = p_courier_id
  for update;
  if not found
     or not v_courier.is_active
     or v_courier.terminated_at is not null
     or v_courier.contract_end_date < current_date then
    raise exception 'This courier account is inactive or its contract has expired';
  end if;

  select p.is_on_shift, p.break_until, p.shift_close_requested_at
    into v_is_on_shift, v_break_until, v_shift_close_requested_at
  from public.courier_presence p
  where p.courier_id = p_courier_id
  for update;
  if not found or not coalesce(v_is_on_shift, false) then
    raise exception 'The courier is not on shift';
  end if;
  if v_shift_close_requested_at is not null then
    raise exception 'The courier has a pending shift closure request';
  end if;
  if v_break_until > now() then
    raise exception 'A break is already active';
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
    raise exception 'Reassign or complete the active order before starting a break';
  end if;

  update public.courier_presence
  set break_until = now() + make_interval(mins => p_duration_minutes),
      break_started_by = 'admin',
      updated_at = now()
  where courier_id = p_courier_id
  returning break_until into v_break_until;

  return v_break_until;
end;
$$;

create or replace function public.end_courier_break()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courier_id bigint := public.current_courier_id();
  v_break_until timestamptz;
  v_break_started_by text;
begin
  if public.current_user_role() is distinct from 'courier'::public.app_role
     or v_courier_id is null then
    raise exception 'Only a courier can end their own break';
  end if;

  select p.break_until, p.break_started_by
    into v_break_until, v_break_started_by
  from public.courier_presence p
  where p.courier_id = v_courier_id
  for update;
  if not found or v_break_until is null or v_break_until <= now() then
    raise exception 'There is no active break to end';
  end if;
  if v_break_started_by is distinct from 'courier' then
    raise exception 'Only management can end a management-started break';
  end if;

  update public.courier_presence
  set break_until = null,
      break_started_by = null,
      updated_at = now()
  where courier_id = v_courier_id;
end;
$$;

create or replace function public.admin_end_courier_break(p_courier_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_break_until timestamptz;
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can end a courier break';
  end if;

  select p.break_until into v_break_until
  from public.courier_presence p
  where p.courier_id = p_courier_id
  for update;
  if not found or v_break_until is null or v_break_until <= now() then
    raise exception 'There is no active break to end';
  end if;

  update public.courier_presence
  set break_until = null,
      break_started_by = null,
      updated_at = now()
  where courier_id = p_courier_id;
end;
$$;

revoke all on function public.end_courier_break() from public, anon;
revoke all on function public.admin_end_courier_break(bigint) from public, anon;
grant execute on function public.end_courier_break() to authenticated;
grant execute on function public.admin_end_courier_break(bigint) to authenticated;
