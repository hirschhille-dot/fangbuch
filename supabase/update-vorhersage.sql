-- Fangbuch-Update: Felder für die Vorhersage (Köderart, Ködertyp, Farbklasse, Trübung)
-- In Supabase: SQL Editor → New query → alles einfügen → Run. Mehrfaches Ausführen schadet nicht.
alter table public.catches add column if not exists lure_type   text;
alter table public.catches add column if not exists lure_action text;
alter table public.catches add column if not exists color_class text;
alter table public.catches add column if not exists clarity     text;
notify pgrst, 'reload schema';
