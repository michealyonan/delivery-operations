alter type public.app_role add value if not exists 'support';

create or replace function public.is_support_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role()::text = 'support', false)
$$;

create table public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid not null references public.profiles (id) on delete cascade,
  requester_role text not null check (requester_role in ('restaurant', 'courier')),
  requester_name text not null,
  subject text not null check (char_length(btrim(subject)) between 3 and 120),
  related_order_id uuid references public.orders (id) on delete set null,
  related_order_code text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  assigned_to uuid references public.profiles (id) on delete set null,
  assigned_name text,
  last_message_body text not null default '',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_conversations_inbox_idx
  on public.support_conversations (status, last_message_at desc);
create index support_conversations_owner_idx
  on public.support_conversations (opened_by, last_message_at desc);

create table public.support_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.support_conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  sender_name text not null,
  sender_role text not null check (sender_role in ('admin', 'support', 'restaurant', 'courier')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index support_messages_conversation_idx
  on public.support_messages (conversation_id, created_at);

create or replace function public.prepare_support_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender public.profiles%rowtype;
begin
  new.sender_id := auth.uid();
  select p.* into sender
  from public.profiles p
  where p.id = new.sender_id;
  if not found or sender.role::text not in ('admin', 'support', 'restaurant', 'courier') then
    raise exception 'Support account not found';
  end if;
  new.sender_name := sender.full_name;
  new.sender_role := sender.role::text;
  new.body := btrim(new.body);
  return new;
end;
$$;

create trigger support_messages_prepare_before_insert
before insert on public.support_messages
for each row execute function public.prepare_support_message();

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
      updated_at = new.created_at,
      status = case
        when new.sender_role in ('courier', 'restaurant') and c.status = 'resolved'
          then 'open'
        else c.status
      end,
      assigned_to = case
        when new.sender_role in ('courier', 'restaurant') and c.status = 'resolved'
          then null
        else c.assigned_to
      end,
      assigned_name = case
        when new.sender_role in ('courier', 'restaurant') and c.status = 'resolved'
          then null
        else c.assigned_name
      end
  where c.id = new.conversation_id;
  return new;
end;
$$;

create trigger support_messages_update_activity_after_insert
after insert on public.support_messages
for each row execute function public.update_support_conversation_activity();

create or replace function public.create_support_conversation(
  p_subject text,
  p_body text,
  p_related_order_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_role text;
  requester_name text;
  related_order_code text;
  conversation_id uuid;
begin
  requester_role := coalesce(public.current_user_role()::text, '');
  if requester_role not in ('courier', 'restaurant') then
    raise exception 'Support conversations can only be opened by couriers and restaurants';
  end if;
  if char_length(btrim(coalesce(p_subject, ''))) not between 3 and 120 then
    raise exception 'Subject must be between 3 and 120 characters';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then
    raise exception 'Message must be between 1 and 4000 characters';
  end if;

  select p.full_name into requester_name
  from public.profiles p
  where p.id = auth.uid();
  if requester_name is null then
    raise exception 'User profile not found';
  end if;

  if p_related_order_id is not null then
    select o.order_code into related_order_code
    from public.orders o
    where o.id = p_related_order_id
      and (
        (requester_role = 'restaurant' and o.restaurant_id = public.current_restaurant_id())
        or (requester_role = 'courier' and o.courier_id = public.current_courier_id())
      );
    if not found then
      raise exception 'The selected order is not available to this account';
    end if;
  end if;

  insert into public.support_conversations (
    opened_by,
    requester_role,
    requester_name,
    subject,
    related_order_id,
    related_order_code
  )
  values (
    auth.uid(),
    requester_role,
    requester_name,
    btrim(p_subject),
    p_related_order_id,
    related_order_code
  )
  returning id into conversation_id;

  insert into public.support_messages (conversation_id, sender_id, sender_name, sender_role, body)
  values (conversation_id, auth.uid(), requester_name, requester_role, btrim(p_body));

  return conversation_id;
end;
$$;

create or replace function public.claim_support_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_name text;
begin
  if coalesce(public.current_user_role()::text, '') not in ('admin', 'support') then
    raise exception 'Only support staff can claim conversations';
  end if;

  select p.full_name into staff_name
  from public.profiles p
  where p.id = auth.uid();
  if staff_name is null then
    raise exception 'Support profile not found';
  end if;

  update public.support_conversations c
  set assigned_to = auth.uid(),
      assigned_name = staff_name,
      status = case when c.status = 'open' then 'in_progress' else c.status end,
      updated_at = now()
  where c.id = p_conversation_id
    and c.status <> 'resolved'
    and (public.is_admin() or c.assigned_to is null or c.assigned_to = auth.uid());
  if not found then
    raise exception 'Conversation is already assigned, resolved, or unavailable';
  end if;
end;
$$;

create or replace function public.set_support_conversation_status(
  p_conversation_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.current_user_role()::text, '') not in ('admin', 'support') then
    raise exception 'Only support staff can update conversation status';
  end if;
  if p_status not in ('open', 'in_progress', 'resolved') then
    raise exception 'Unsupported conversation status';
  end if;

  update public.support_conversations c
  set status = p_status,
      updated_at = now()
  where c.id = p_conversation_id
    and (public.is_admin() or c.assigned_to = auth.uid());
  if not found then
    raise exception 'Conversation is assigned to another support agent or unavailable';
  end if;
end;
$$;

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;

create policy "Participants and support staff can read support conversations"
on public.support_conversations for select to authenticated
using (
  opened_by = auth.uid()
  or public.is_admin()
  or public.is_support_staff()
);

create policy "Participants and support staff can read support messages"
on public.support_messages for select to authenticated
using (
  exists (
    select 1
    from public.support_conversations c
    where c.id = support_messages.conversation_id
      and (c.opened_by = auth.uid() or public.is_admin() or public.is_support_staff())
  )
);

create policy "Participants and support staff can send support messages"
on public.support_messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.support_conversations c
    where c.id = support_messages.conversation_id
      and (
        c.opened_by = auth.uid()
        or public.is_admin()
        or (public.is_support_staff() and c.assigned_to = auth.uid())
      )
  )
);

grant select on public.support_conversations to authenticated;
grant select, insert on public.support_messages to authenticated;
grant usage, select on sequence public.support_messages_id_seq to authenticated;

create policy "Support staff can read orders for troubleshooting"
on public.orders for select to authenticated
using (
  public.is_support_staff()
  and exists (
    select 1
    from public.support_conversations c
    where c.related_order_id = orders.id
  )
);

revoke all on function public.is_support_staff() from public, anon;
revoke all on function public.create_support_conversation(text, text, uuid) from public, anon;
revoke all on function public.claim_support_conversation(uuid) from public, anon;
revoke all on function public.set_support_conversation_status(uuid, text) from public, anon;

grant execute on function public.is_support_staff() to authenticated;
grant execute on function public.create_support_conversation(text, text, uuid) to authenticated;
grant execute on function public.claim_support_conversation(uuid) to authenticated;
grant execute on function public.set_support_conversation_status(uuid, text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_conversations'
  ) then
    alter publication supabase_realtime add table public.support_conversations;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_messages'
  ) then
    alter publication supabase_realtime add table public.support_messages;
  end if;
end;
$$;
