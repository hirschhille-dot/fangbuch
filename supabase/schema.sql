-- Fangbuch: Tabellen und Zugriffsregeln für Supabase
-- In Supabase: SQL Editor → New query → alles einfügen → Run

create table if not exists public.spots (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id         text not null,
  lat        double precision,
  lon        double precision,
  country    text default 'DE',
  water      text,
  zone       text,
  depth      real,
  struct     text,
  notes      text,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.sessions (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id           text not null,
  date         date,
  start_time   text,
  end_time     text,
  spots        text[] default '{}',
  country      text default 'DE',
  live         boolean default false,
  attempts     jsonb default '[]'::jsonb,
  note         text,
  weather      jsonb,
  extra_misses integer default 0,
  lat          double precision,
  lon          double precision,
  updated_at   timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.catches (
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id             text not null,
  session        text,
  date           date,
  time           text,
  spot           text,
  country        text default 'DE',
  lat            double precision,
  lon            double precision,
  result         text,
  species        text,
  cm             real,
  lure           text,
  size           real,
  color          text,
  weight         real,
  rig            text,
  setup          text,
  retrieve       text,
  tempo          text,
  bite           text,
  water_temp     real,
  air_temp       real,
  pressure       real,
  pressure_trend text,
  humidity       real,
  wind_speed     real,
  wind_dir       real,
  wind_gust      real,
  cloud_cover    real,
  precip         real,
  weather_code   integer,
  weather_status text,
  weather_src    text,
  sunset         text,
  light          text,
  moon           text,
  moon_ill       real,
  release        text,
  capture        text,
  notes          text,
  raw            text,
  updated_at     timestamptz not null default now(),
  primary key (user_id, id)
);

-- Nur der angemeldete Besitzer darf seine eigenen Zeilen sehen und ändern
alter table public.spots    enable row level security;
alter table public.sessions enable row level security;
alter table public.catches  enable row level security;

drop policy if exists "eigene spots"    on public.spots;
drop policy if exists "eigene sessions" on public.sessions;
drop policy if exists "eigene faenge"   on public.catches;

create policy "eigene spots"    on public.spots    for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "eigene sessions" on public.sessions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "eigene faenge"   on public.catches  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Änderungszeit automatisch setzen
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists t_spots on public.spots;       create trigger t_spots    before update on public.spots    for each row execute function public.touch_updated_at();
drop trigger if exists t_sessions on public.sessions; create trigger t_sessions before update on public.sessions for each row execute function public.touch_updated_at();
drop trigger if exists t_catches on public.catches;   create trigger t_catches  before update on public.catches  for each row execute function public.touch_updated_at();
