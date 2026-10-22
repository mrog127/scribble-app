-- Photos in notes: a public Storage bucket, each user writing only to their own folder
insert into storage.buckets (id, name, public)
values ('note-images', 'note-images', true)
on conflict (id) do nothing;

create policy "note images: upload to own folder"
on storage.objects for insert to authenticated
with check (bucket_id = 'note-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "note images: delete own"
on storage.objects for delete to authenticated
using (bucket_id = 'note-images' and (storage.foldername(name))[1] = auth.uid()::text);
