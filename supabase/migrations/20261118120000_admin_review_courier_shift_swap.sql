create or replace function public.admin_review_courier_shift_swap(
  p_booking_id bigint,
  p_approve boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only management can review courier shift swap requests';
  end if;

  if p_approve then
    update public.courier_shift_bookings b
    set status = 'admin_removed',
        removed_at = now(),
        removed_by = auth.uid(),
        swap_listed_at = null
    from public.courier_shift_slots s
    where b.id = p_booking_id
      and b.slot_id = s.id
      and b.status = 'swap_listed'
      and s.starts_at > now()
      and not exists (
        select 1
        from public.courier_shifts cs
        where cs.booking_id = b.id
          and cs.ended_at is null
      );
  else
    update public.courier_shift_bookings b
    set status = 'booked',
        swap_listed_at = null
    from public.courier_shift_slots s
    where b.id = p_booking_id
      and b.slot_id = s.id
      and b.status = 'swap_listed'
      and s.starts_at > now()
      and not exists (
        select 1
        from public.courier_shifts cs
        where cs.booking_id = b.id
          and cs.ended_at is null
      );
  end if;

  if not found then
    raise exception 'The pending courier shift swap request was not found or is no longer available';
  end if;
end;
$$;

revoke all on function public.admin_review_courier_shift_swap(bigint, boolean) from public, anon;
grant execute on function public.admin_review_courier_shift_swap(bigint, boolean) to authenticated;
