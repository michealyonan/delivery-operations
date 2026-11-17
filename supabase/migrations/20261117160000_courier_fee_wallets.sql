alter table public.orders
  add column if not exists delivery_fee_remitted_piasters bigint not null default 0
    check (
      delivery_fee_remitted_piasters >= 0
      and delivery_fee_remitted_piasters <= coalesce(delivery_fee_piasters, 0)
    );

create table public.courier_fee_remittances (
  id bigint generated always as identity primary key,
  courier_id bigint not null references public.couriers (id),
  amount_piasters bigint not null check (amount_piasters > 0),
  received_by uuid not null references public.profiles (id),
  received_at timestamptz not null default now()
);

create index courier_fee_remittances_courier_received_idx
  on public.courier_fee_remittances (courier_id, received_at desc);

alter table public.courier_fee_remittances enable row level security;

create policy "Couriers and management can read fee remittances"
on public.courier_fee_remittances for select to authenticated
using (
  public.is_admin()
  or courier_id = public.current_courier_id()
);

grant select on public.courier_fee_remittances to authenticated;
revoke insert, update, delete on public.courier_fee_remittances from authenticated;

create or replace function public.admin_record_courier_fee_remittance(
  p_courier_id bigint,
  p_amount_piasters bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_id bigint;
  v_remaining bigint;
  v_outstanding bigint;
  v_order record;
  v_allocation bigint;
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can record a courier fee remittance';
  end if;
  if p_amount_piasters is null or p_amount_piasters <= 0 then
    raise exception 'Enter a remittance amount greater than zero';
  end if;

  perform 1
  from public.couriers c
  where c.id = p_courier_id
  for update;
  if not found then
    raise exception 'Courier not found';
  end if;

  select coalesce(
    sum(coalesce(o.delivery_fee_piasters, 0) - o.delivery_fee_remitted_piasters),
    0
  )
  into v_outstanding
  from public.orders o
  where o.courier_id = p_courier_id
    and o.status = 'delivered'::public.order_status;
  if p_amount_piasters > v_outstanding then
    raise exception 'Remittance exceeds the outstanding delivery fees';
  end if;

  insert into public.courier_fee_remittances (
    courier_id, amount_piasters, received_by, received_at
  )
  values (p_courier_id, p_amount_piasters, auth.uid(), now())
  returning id into v_receipt_id;

  v_remaining := p_amount_piasters;
  for v_order in
    select
      o.id,
      coalesce(o.delivery_fee_piasters, 0) as fee_piasters,
      o.delivery_fee_remitted_piasters as remitted_piasters
    from public.orders o
    where o.courier_id = p_courier_id
      and o.status = 'delivered'::public.order_status
      and coalesce(o.delivery_fee_piasters, 0) > o.delivery_fee_remitted_piasters
    order by o.delivered_at asc, o.created_at asc, o.id asc
    for update
  loop
    exit when v_remaining = 0;
    v_allocation := least(
      v_remaining,
      v_order.fee_piasters - v_order.remitted_piasters
    );
    update public.orders
    set delivery_fee_remitted_piasters =
      delivery_fee_remitted_piasters + v_allocation
    where id = v_order.id;
    v_remaining := v_remaining - v_allocation;
  end loop;

  if v_remaining <> 0 then
    raise exception 'Could not allocate the full remittance to delivered orders';
  end if;

  return v_receipt_id;
end;
$$;

revoke all on function public.admin_record_courier_fee_remittance(bigint, bigint)
  from public, anon;
grant execute on function public.admin_record_courier_fee_remittance(bigint, bigint)
  to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'courier_fee_remittances'
  ) then
    alter publication supabase_realtime add table public.courier_fee_remittances;
  end if;
end;
$$;
