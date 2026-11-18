create or replace function public.admin_update_courier_profile(
  p_courier_id bigint,
  p_full_name text,
  p_email text,
  p_phone text,
  p_national_id text,
  p_address text,
  p_id_card_path text default null,
  p_selfie_path text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_existing_id_card_path text;
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can edit courier profiles';
  end if;
  if char_length(btrim(coalesce(p_full_name, ''))) < 4
     or position(' ' in btrim(p_full_name)) = 0
     or lower(btrim(coalesce(p_email, ''))) !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
     or btrim(coalesce(p_phone, '')) !~ '^[+0-9][0-9 +()-]{7,16}$'
     or btrim(coalesce(p_national_id, '')) !~ '^[0-9]{14}$'
     or char_length(btrim(coalesce(p_address, ''))) < 3 then
    raise exception 'Review the courier name, email, phone, national ID, and address';
  end if;

  select c.user_id into v_user_id
  from public.couriers c
  where c.id = p_courier_id
    and c.terminated_at is null
  for update;
  if not found then
    raise exception 'Courier account not found or permanently terminated';
  end if;

  update public.profiles
  set full_name = btrim(p_full_name),
      email = lower(btrim(p_email)),
      phone = btrim(p_phone)
  where id = v_user_id;

  update public.couriers
  set full_name = btrim(p_full_name),
      email = lower(btrim(p_email)),
      phone = btrim(p_phone)
  where id = p_courier_id;

  select d.id_card_path into v_existing_id_card_path
  from public.courier_private_details d
  where d.courier_id = p_courier_id
  for update;
  if p_id_card_path is null and v_existing_id_card_path is null then
    raise exception 'Upload a courier ID card to complete the profile';
  end if;

  insert into public.courier_private_details (
    courier_id,
    national_id,
    address,
    id_card_path
  )
  values (
    p_courier_id,
    btrim(p_national_id),
    btrim(p_address),
    coalesce(p_id_card_path, v_existing_id_card_path)
  )
  on conflict (courier_id) do update
  set national_id = excluded.national_id,
      address = excluded.address,
      id_card_path = coalesce(p_id_card_path, public.courier_private_details.id_card_path);

  if p_selfie_path is not null then
    update public.profiles
    set profile_photo_path = p_selfie_path
    where id = v_user_id;
  end if;
end;
$$;

revoke all on function public.admin_update_courier_profile(bigint, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_update_courier_profile(bigint, text, text, text, text, text, text, text) to authenticated;
