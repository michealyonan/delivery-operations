create or replace function public.admin_reject_courier_shift_close(p_courier_id bigint)
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
    raise exception 'Only management can reject shift closure';
  end if;

  select p.is_on_shift, p.shift_close_requested_at
    into v_is_on_shift, v_close_requested_at
  from public.courier_presence p
  where p.courier_id = p_courier_id
  for update;
  if not found or not coalesce(v_is_on_shift, false) or v_close_requested_at is null then
    raise exception 'No pending shift closure request was found';
  end if;

  update public.courier_shifts
  set status = 'open',
      close_requested_at = null
  where courier_id = p_courier_id
    and ended_at is null
    and status = 'close_requested';
  if not found then
    raise exception 'No open shift record was found';
  end if;

  update public.courier_presence
  set shift_close_requested_at = null,
      updated_at = now()
  where courier_id = p_courier_id;
end;
$$;

revoke all on function public.admin_reject_courier_shift_close(bigint) from public, anon;
grant execute on function public.admin_reject_courier_shift_close(bigint) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'courier_presence'
  ) then
    alter publication supabase_realtime add table public.courier_presence;
  end if;
end;
$$;
