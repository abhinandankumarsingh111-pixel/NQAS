-- ============================================================
--  NQAS — Database schema for Supabase (Postgres)
--  Run this ONCE in: Supabase dashboard -> SQL Editor -> New query -> paste -> Run
-- ============================================================

-- ---------- TABLES ----------

create table if not exists public.campuses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  role        text not null check (role in ('owner','management','coordinator')),
  campus_id   uuid references public.campuses(id) on delete set null,
  login_id    text,
  created_at  timestamptz not null default now()
);

create table if not exists public.reports (
  id                uuid primary key default gen_random_uuid(),
  campus_id         uuid references public.campuses(id) on delete set null,
  coordinator_id    uuid references auth.users(id) on delete set null,
  coordinator_name  text,
  teacher           text,
  class             text,
  subject           text,
  date              date,
  sample_size       int,
  engine            text,
  students          jsonb,
  recs              jsonb,
  final_observation text,
  principal_summary text,
  created_at        timestamptz not null default now()
);

create index if not exists reports_campus_idx on public.reports (campus_id);
create index if not exists reports_created_idx on public.reports (created_at desc);

-- ---------- HELPER FUNCTIONS (SECURITY DEFINER avoids RLS recursion) ----------

create or replace function public.my_role() returns text
language sql security definer stable set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.my_campus() returns uuid
language sql security definer stable set search_path = public as $$
  select campus_id from public.profiles where id = auth.uid()
$$;

-- ---------- NEW-USER TRIGGER: auto-create a profile from signup metadata ----------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, role, campus_id, login_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'User'),
    coalesce(new.raw_user_meta_data->>'role', 'coordinator'),
    nullif(new.raw_user_meta_data->>'campus_id','')::uuid,
    new.raw_user_meta_data->>'login_id'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- ROW LEVEL SECURITY ----------

alter table public.profiles  enable row level security;
alter table public.campuses  enable row level security;
alter table public.reports   enable row level security;

-- profiles: you can read your own; owner/management can read all
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles for select
  using (id = auth.uid() or public.my_role() in ('owner','management'));

-- campuses: any signed-in user can read; only owner can modify
drop policy if exists "campuses_read" on public.campuses;
create policy "campuses_read" on public.campuses for select
  using (auth.role() = 'authenticated');

drop policy if exists "campuses_write" on public.campuses;
create policy "campuses_write" on public.campuses for all
  using (public.my_role() = 'owner')
  with check (public.my_role() = 'owner');

-- reports: owner/management read all; coordinator reads only own campus
drop policy if exists "reports_read" on public.reports;
create policy "reports_read" on public.reports for select
  using (public.my_role() in ('owner','management') or campus_id = public.my_campus());

-- reports: a coordinator may insert only for their own campus
drop policy if exists "reports_insert" on public.reports;
create policy "reports_insert" on public.reports for insert
  with check (public.my_role() = 'coordinator' and campus_id = public.my_campus());

-- ---------- SEED: the four campuses (edit freely) ----------
insert into public.campuses (name) values
  ('KVIGS Rourkela'), ('KVTS Angul'), ('KVNGS JDP'), ('KV Vizag')
on conflict (name) do nothing;
