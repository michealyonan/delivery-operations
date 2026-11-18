create extension if not exists pg_cron with schema pg_catalog;

create table public.courier_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  image_path text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 days',
  check (char_length(btrim(title)) between 1 and 120),
  check (char_length(body) <= 2000),
  check (body <> '' or image_path is not null),
  check (expires_at > created_at)
);

create table public.courier_notification_recipients (
  notification_id uuid not null references public.courier_notifications (id) on delete cascade,
  courier_id bigint not null references public.couriers (id) on delete cascade,
  read_at timestamptz,
  primary key (notification_id, courier_id)
);

create index courier_notifications_expiry_idx
  on public.courier_notifications (expires_at);
create index courier_notification_recipients_courier_idx
  on public.courier_notification_recipients (courier_id, notification_id);

alter table public.courier_notifications enable row level security;
alter table public.courier_notification_recipients enable row level security;

create policy "Admins and recipients can read courier notifications"
on public.courier_notifications for select to authenticated
using (
  public.is_admin()
  or (
    expires_at > now()
    and exists (
    select 1
    from public.courier_notification_recipients r
    where r.notification_id = id
      and r.courier_id = public.current_courier_id()
    )
  )
);

create policy "Admins and couriers can read notification recipients"
on public.courier_notification_recipients for select to authenticated
using (public.is_admin() or courier_id = public.current_courier_id());

create policy "Couriers can mark their notifications as read"
on public.courier_notification_recipients for update to authenticated
using (courier_id = public.current_courier_id())
with check (courier_id = public.current_courier_id());

revoke all on public.courier_notifications,
  public.courier_notification_recipients from anon, authenticated;
grant select on public.courier_notifications,
  public.courier_notification_recipients to authenticated;
grant update (read_at) on public.courier_notification_recipients to authenticated;

create or replace function public.admin_send_courier_notification(
  p_title text,
  p_body text,
  p_image_path text default null,
  p_courier_ids bigint[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_courier_ids bigint[];
  v_notification_id uuid;
  v_requested_count integer;
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can send courier notifications';
  end if;
  if char_length(v_title) not between 1 and 120 then
    raise exception 'Notification title must be between 1 and 120 characters';
  end if;
  if char_length(v_body) > 2000 or (v_body = '' and p_image_path is null) then
    raise exception 'Add a message or image, and keep the message under 2000 characters';
  end if;
  if p_image_path is not null then
    if coalesce(array_length(storage.foldername(p_image_path), 1), 0) <> 1
       or (storage.foldername(p_image_path))[1] <> 'notifications'
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'courier-notification-images'
           and o.name = p_image_path
       ) then
      raise exception 'The notification image was not uploaded correctly';
    end if;
  end if;

  if p_courier_ids is null then
    select array_agg(c.id order by c.id)
    into v_courier_ids
    from public.couriers c
    where c.is_active
      and c.terminated_at is null
      and c.contract_end_date >= current_date;
  else
    select count(distinct requested.id)::integer
    into v_requested_count
    from unnest(p_courier_ids) as requested(id);
    if coalesce(v_requested_count, 0) = 0 then
      raise exception 'Select at least one courier or choose all couriers';
    end if;
    if exists (
      select 1
      from (
        select distinct requested.id
        from unnest(p_courier_ids) as requested(id)
      ) requested
      left join public.couriers c on c.id = requested.id
      where c.id is null
        or not c.is_active
        or c.terminated_at is not null
        or c.contract_end_date < current_date
    ) then
      raise exception 'One or more selected couriers cannot receive notifications';
    end if;
    select array_agg(distinct requested.id order by requested.id)
    into v_courier_ids
    from unnest(p_courier_ids) as requested(id);
  end if;

  if coalesce(cardinality(v_courier_ids), 0) = 0 then
    raise exception 'There are no active couriers to receive this notification';
  end if;

  insert into public.courier_notifications (title, body, image_path, created_by)
  values (v_title, v_body, p_image_path, auth.uid())
  returning id into v_notification_id;

  insert into public.courier_notification_recipients (notification_id, courier_id)
  select v_notification_id, unnest(v_courier_ids);

  return jsonb_build_object(
    'notification_id', v_notification_id,
    'recipient_count', cardinality(v_courier_ids)
  );
end;
$$;

create or replace function public.purge_expired_courier_notifications()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_count bigint;
begin
  delete from storage.objects
  where bucket_id = 'courier-notification-images'
    and name in (
      select n.image_path
      from public.courier_notifications n
      where n.expires_at <= now()
        and n.image_path is not null
    );

  delete from public.courier_notifications
  where expires_at <= now();
  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

revoke all on function public.admin_send_courier_notification(text, text, text, bigint[])
  from public, anon;
grant execute on function public.admin_send_courier_notification(text, text, text, bigint[])
  to authenticated;
revoke all on function public.purge_expired_courier_notifications()
  from public, anon, authenticated;
grant execute on function public.purge_expired_courier_notifications() to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'courier-notification-images',
  'courier-notification-images',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy "Management can upload notification images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'courier-notification-images'
  and public.is_admin()
  and (storage.foldername(name))[1] = 'notifications'
);

create policy "Management and intended couriers can read notification images"
on storage.objects for select to authenticated
using (
  bucket_id = 'courier-notification-images'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.courier_notifications n
      join public.courier_notification_recipients r on r.notification_id = n.id
      where n.image_path = name
        and n.expires_at > now()
        and r.courier_id = public.current_courier_id()
    )
  )
);

create policy "Management can remove notification images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'courier-notification-images'
  and public.is_admin()
);

do $$
declare
  v_job_id bigint;
begin
  select j.jobid into v_job_id
  from cron.job j
  where j.jobname = 'purge-expired-courier-notifications';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'purge-expired-courier-notifications',
    '0 * * * *',
    'select public.purge_expired_courier_notifications();'
  );
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'courier_notifications'
  ) then
    alter publication supabase_realtime add table public.courier_notifications;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'courier_notification_recipients'
  ) then
    alter publication supabase_realtime add table public.courier_notification_recipients;
  end if;
end;
$$;
