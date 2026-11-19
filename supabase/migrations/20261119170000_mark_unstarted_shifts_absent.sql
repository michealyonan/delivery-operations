alter table public.courier_shift_bookings
  drop constraint if exists courier_shift_bookings_status_check;

alter table public.courier_shift_bookings
  add constraint courier_shift_bookings_status_check
  check (status in ('booked', 'swap_listed', 'completed', 'admin_removed', 'cancelled', 'absent'));

create or replace function public.mark_absent_courier_shifts()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_absent_count bigint;
begin
  update public.courier_shift_bookings b
  set status = 'absent'
  from public.courier_shift_slots s
  where b.slot_id = s.id
    and b.status in ('booked', 'swap_listed')
    and not s.is_cancelled
    and s.ends_at <= now()
    and not exists (
      select 1
      from public.courier_shifts cs
      where cs.booking_id = b.id
        and cs.started_at is not null
    );

  get diagnostics v_absent_count = row_count;
  return v_absent_count;
end;
$$;

revoke all on function public.mark_absent_courier_shifts() from public, anon, authenticated;
grant execute on function public.mark_absent_courier_shifts() to service_role;

do $$
declare
  v_job_id bigint;
begin
  select j.jobid into v_job_id
  from cron.job j
  where j.jobname = 'mark-absent-courier-shifts';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'mark-absent-courier-shifts',
    '* * * * *',
    'select public.mark_absent_courier_shifts();'
  );
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_publication p
    where p.pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables pt
    where pt.pubname = 'supabase_realtime'
      and pt.schemaname = 'public'
      and pt.tablename = 'courier_shift_bookings'
  ) then
    alter publication supabase_realtime add table public.courier_shift_bookings;
  end if;
end;
$$;
