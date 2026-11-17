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
      updated_at = now()
  where courier_id = p_courier_id
  returning break_until into v_break_until;

  return v_break_until;
end;
$$;

revoke all on function public.admin_start_courier_break(bigint, integer) from public, anon;
grant execute on function public.admin_start_courier_break(bigint, integer) to authenticated;
