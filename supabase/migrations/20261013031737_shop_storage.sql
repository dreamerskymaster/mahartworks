-- Private bucket for her signature image (used on certificates). Only admins can read or write it; the
-- admin page shows it through a short-lived signed URL. 1 MB, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-private', 'shop-private', false, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy shop_private_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'shop-private' and (select shop.is_admin()));
create policy shop_private_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-private' and (select shop.is_admin()));
create policy shop_private_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'shop-private' and (select shop.is_admin()))
  with check (bucket_id = 'shop-private' and (select shop.is_admin()));
create policy shop_private_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shop-private' and (select shop.is_admin()));
