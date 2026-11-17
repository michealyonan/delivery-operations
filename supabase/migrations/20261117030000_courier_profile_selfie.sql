alter table public.profiles
  add column if not exists profile_photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'courier-profile-photos',
  'courier-profile-photos',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy "Management can upload private courier profile photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'courier-profile-photos'
  and public.is_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Courier and management can read profile photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'courier-profile-photos'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'courier'::public.app_role
        and p.profile_photo_path = storage.objects.name
    )
  )
);

create policy "Management can remove private courier profile photos"
on storage.objects for delete to authenticated
using (bucket_id = 'courier-profile-photos' and public.is_admin());
