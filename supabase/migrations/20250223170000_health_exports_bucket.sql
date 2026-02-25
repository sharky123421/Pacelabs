-- Storage bucket for large Apple Health exports (upload via web, process in Edge Function).
-- Users upload to health-exports/{user_id}/ then trigger process from app.
-- If the insert fails (some projects restrict storage.buckets), create the bucket in Dashboard:
-- Storage → New bucket → id/name: health-exports, private, file size limit 500MB, MIME: zip, xml.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'health-exports',
  'health-exports',
  false,
  524288000,
  array['application/zip', 'application/xml', 'text/xml']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Users can upload/read/delete only in their own folder: health-exports/{user_id}/
drop policy if exists "Users can upload own health exports" on storage.objects;
create policy "Users can upload own health exports"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'health-exports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can read own health exports" on storage.objects;
create policy "Users can read own health exports"
on storage.objects for select
to authenticated
using (
  bucket_id = 'health-exports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own health exports" on storage.objects;
create policy "Users can delete own health exports"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'health-exports'
  and (storage.foldername(name))[1] = auth.uid()::text
);
