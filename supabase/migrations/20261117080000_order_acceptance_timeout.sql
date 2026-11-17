create extension if not exists pg_cron with schema pg_catalog;

alter table public.orders
  add column if not exists assignment_expired_at timestamptz,
  add column if not exists last_unaccepted_courier_id bigint
    references public.couriers (id) on delete set null;

create index if not exists orders_unaccepted_assignment_deadline_idx
  on public.orders (assigned_at)
  where status = 'assigned'::public.order_status and accepted_at is null;

create or replace function public.expire_unaccepted_orders()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired_count bigint;
begin
  with expired_orders as (
    update public.orders o
    set status = 'pending'::public.order_status,
        last_unaccepted_courier_id = o.courier_id,
        courier_id = null,
        assigned_at = null,
        accepted_at = null,
        assignment_expired_at = now(),
        updated_at = now()
    where o.status = 'assigned'::public.order_status
      and o.courier_id is not null
      and o.accepted_at is null
      and o.assigned_at <= now() - interval '120 seconds'
    returning o.id
  )
  select count(*) into v_expired_count from expired_orders;

  return v_expired_count;
end;
$$;

revoke all on function public.expire_unaccepted_orders() from public, anon, authenticated;
grant execute on function public.expire_unaccepted_orders() to service_role;

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
      assignment_expired_at = null,
      last_unaccepted_courier_id = null,
      updated_at = now()
  where o.id = p_order_id
    and o.courier_id = public.current_courier_id()
    and o.status = 'assigned'::public.order_status
    and o.assigned_at > now() - interval '120 seconds';

  if not found then
    raise exception 'Order acceptance window has expired or the order is no longer available';
  end if;
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  select j.jobid into v_job_id
  from cron.job j
  where j.jobname = 'delivery-order-assignment-timeouts';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'delivery-order-assignment-timeouts',
    '* * * * *',
    'select public.expire_unaccepted_orders();'
  );
end;
$$;
