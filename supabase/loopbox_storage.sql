-- LoopBox : stockage des projets en ligne (projet Supabase « calisthenics-tracker »)
-- Déjà appliqué le 11/10/2026. À relancer seulement pour recréer l'espace (SQL Editor → coller → Run).
insert into storage.buckets (id, name, public, file_size_limit)
values ('loopbox', 'loopbox', false, 52428800)
on conflict (id) do nothing;

create policy "loopbox lire ses projets" on storage.objects
  for select to authenticated
  using (bucket_id = 'loopbox' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "loopbox ajouter ses projets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'loopbox' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "loopbox modifier ses projets" on storage.objects
  for update to authenticated
  using (bucket_id = 'loopbox' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'loopbox' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "loopbox supprimer ses projets" on storage.objects
  for delete to authenticated
  using (bucket_id = 'loopbox' and (storage.foldername(name))[1] = (select auth.uid())::text);
