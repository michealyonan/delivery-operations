create policy "Couriers can view their own latest location"
on public.courier_locations for select to authenticated
using (courier_id = public.current_courier_id());
