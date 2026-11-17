create or replace function public.prepare_support_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender public.profiles%rowtype;
  conversation_status text;
begin
  new.sender_id := auth.uid();
  select p.* into sender
  from public.profiles p
  where p.id = new.sender_id;
  if not found or sender.role::text not in ('admin', 'support', 'restaurant', 'courier') then
    raise exception 'Support account not found';
  end if;

  select c.status into conversation_status
  from public.support_conversations c
  where c.id = new.conversation_id
  for update;
  if conversation_status is null then
    raise exception 'Support conversation not found';
  end if;
  if sender.role::text in ('courier', 'restaurant') and conversation_status = 'resolved' then
    raise exception 'تم حل المشكلة وإغلاق المحادثة ولا يمكن إرسال رسائل جديدة';
  end if;

  new.sender_name := sender.full_name;
  new.sender_role := sender.role::text;
  new.body := btrim(new.body);
  return new;
end;
$$;

create or replace function public.update_support_conversation_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_conversations c
  set last_message_body = left(new.body, 300),
      last_message_at = new.created_at,
      updated_at = new.created_at
  where c.id = new.conversation_id;
  return new;
end;
$$;

drop policy if exists "Participants and support staff can send support messages"
  on public.support_messages;

create policy "Participants and support staff can send support messages"
on public.support_messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.support_conversations c
    where c.id = support_messages.conversation_id
      and (
        (c.opened_by = auth.uid() and c.status <> 'resolved')
        or public.is_admin()
        or (public.is_support_staff() and c.assigned_to = auth.uid())
      )
  )
);

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
