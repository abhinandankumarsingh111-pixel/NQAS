-- ============================================================
--  NQAS — Teacher Accountability schema
--  Run AFTER schema.sql, in: Supabase dashboard -> SQL Editor.
--  Safe to re-run.
--
--  A teacher record here may inform an employment decision, so several
--  choices are deliberate rather than incidental. They are marked WHY.
-- ============================================================

-- ---------- append-only guard ----------
-- WHY a TRIGGER and not an RLS policy: row-level security is BYPASSED by the
-- service-role key, which this application already uses (deleteReportAction).
-- A policy-only rule would leave these tables quietly rewritable by any future
-- admin-client code path. A trigger fires for the service role too.
create or replace function public.raise_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP;
end;
$$;

-- ---------- name normalisation ----------
-- WHY: a unique index on lower(name) catches casing but NOT internal
-- whitespace, so 'SUNITA  SHARMA' and 'Sunita Sharma' were two people.
-- Normalising on write means the STORED value is clean, not just the index.
create or replace function public.normalise_name() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  if to_jsonb(new) ? 'subject' then
    new.subject := nullif(btrim(regexp_replace(coalesce(new.subject,''), '\s+', ' ', 'g')), '');
  end if;
  return new;
end;
$$;

drop trigger if exists campuses_normalise on public.campuses;
create trigger campuses_normalise before insert or update on public.campuses
  for each row execute function public.normalise_name();

drop index if exists public.campuses_name_ci_uidx;
create unique index campuses_name_ci_uidx on public.campuses (
  lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))
);

-- ---------- faculty ----------
create table if not exists public.faculty (
  id            uuid primary key default gen_random_uuid(),
  campus_id     uuid not null references public.campuses(id) on delete restrict,
  name          text not null,
  subject       text,
  employee_code text,
  active        boolean not null default true,   -- false on departure; never deleted
  created_at    timestamptz not null default now()
);

drop trigger if exists faculty_normalise on public.faculty;
create trigger faculty_normalise before insert or update on public.faculty
  for each row execute function public.normalise_name();

-- WHY subject is part of the key: two teachers at one campus may genuinely
-- share a name. Forbidding that would force a coordinator to merge two real
-- people into one personnel record — the worst possible bug in this system.
create unique index if not exists faculty_campus_name_subject_uidx on public.faculty (
  campus_id,
  lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))),
  lower(btrim(regexp_replace(coalesce(subject, ''), '\s+', ' ', 'g')))
);
create index if not exists faculty_campus_idx on public.faculty (campus_id, active);
create index if not exists faculty_name_idx   on public.faculty (lower(name));

-- Former names stay searchable: a teacher looked up years later may well be
-- under the name she had then.
create table if not exists public.faculty_previous_names (
  id              uuid primary key default gen_random_uuid(),
  faculty_id      uuid not null references public.faculty(id) on delete restrict,
  previous_name   text not null,
  changed_on      date not null default current_date,
  changed_by      uuid references auth.users(id) on delete set null,
  changed_by_name text,
  created_at      timestamptz not null default now()
);
create index if not exists faculty_prev_faculty_idx on public.faculty_previous_names (faculty_id);
create index if not exists faculty_prev_search_idx  on public.faculty_previous_names (lower(previous_name));

-- Career history across campuses. faculty.campus_id is the CURRENT posting;
-- reports.campus_id is never rewritten, so each verification stays attached to
-- the campus where it actually happened.
create table if not exists public.faculty_postings (
  id         uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.faculty(id) on delete restrict,
  campus_id  uuid not null references public.campuses(id) on delete restrict,
  from_date  date not null default current_date,
  to_date    date,
  created_at timestamptz not null default now()
);
create index if not exists faculty_postings_faculty_idx on public.faculty_postings (faculty_id, from_date);

create table if not exists public.faculty_audit (
  id         uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.faculty(id) on delete restrict,
  action     text not null check (action in
               ('created','renamed','subject_changed','merged','transferred',
                'deactivated','reactivated','report_reassigned')),
  detail     jsonb,
  actor_id   uuid references auth.users(id) on delete set null,
  actor_name text,
  created_at timestamptz not null default now()
);
create index if not exists faculty_audit_faculty_idx on public.faculty_audit (faculty_id, created_at desc);

drop trigger if exists faculty_prev_immutable on public.faculty_previous_names;
create trigger faculty_prev_immutable before update or delete on public.faculty_previous_names
  for each row execute function public.raise_immutable();

drop trigger if exists faculty_audit_immutable on public.faculty_audit;
create trigger faculty_audit_immutable before update or delete on public.faculty_audit
  for each row execute function public.raise_immutable();

-- ---------- reports: faculty link, soft delete, sampling, derived metrics ----------
alter table public.reports
  add column if not exists faculty_id             uuid references public.faculty(id) on delete restrict,
  add column if not exists sampling_method        text,
  add column if not exists deleted_at             timestamptz,
  add column if not exists deleted_by             uuid references auth.users(id) on delete set null,
  add column if not exists median_days            numeric,
  add column if not exists cq_flag_count          integer,
  add column if not exists teacher_critical_count integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reports_sampling_method_ck') then
    alter table public.reports add constraint reports_sampling_method_ck
      check (sampling_method is null or sampling_method in ('random','spot','teacher_provided'));
  end if;
end $$;

create index if not exists reports_faculty_idx on public.reports (faculty_id, date desc);
create index if not exists reports_live_idx on public.reports (campus_id, date desc) where deleted_at is null;

-- ---------- remarks ----------
-- One table serves both the teacher record and report comments: a comment on a
-- verification is simply a remark that points at a report.
create table if not exists public.remarks (
  id             uuid primary key default gen_random_uuid(),
  campus_id      uuid not null references public.campuses(id) on delete restrict,
  target         text not null check (target in ('faculty','coordinator')),
  faculty_id     uuid references public.faculty(id) on delete restrict,
  coordinator_id uuid references auth.users(id) on delete set null,
  subject_name   text not null,          -- snapshot of who it is about
  report_id      uuid references public.reports(id) on delete restrict,
  kind           text not null check (kind in ('complaint','appreciation','observation')),
  body           text not null check (length(btrim(body)) > 0),
  author_id      uuid references auth.users(id) on delete set null,
  -- WHY snapshot the author: if a principal's account is later removed,
  -- "filed by an unknown user" is worthless in a termination conversation.
  author_name    text not null,
  author_role    text not null,
  occurred_on    date not null default current_date,
  supersedes_id  uuid references public.remarks(id),   -- corrections, never edits
  created_at     timestamptz not null default now(),

  constraint remarks_target_ck check (
    (target = 'faculty'     and faculty_id is not null and coordinator_id is null) or
    (target = 'coordinator' and coordinator_id is not null and faculty_id is null)
  )
);
create index if not exists remarks_faculty_idx     on public.remarks (faculty_id, occurred_on desc);
create index if not exists remarks_coordinator_idx on public.remarks (coordinator_id, created_at desc);
create index if not exists remarks_report_idx      on public.remarks (report_id);

-- Separate table so `remarks` needs no UPDATE path at all.
create table if not exists public.remark_acknowledgements (
  id                uuid primary key default gen_random_uuid(),
  remark_id         uuid not null references public.remarks(id) on delete restrict,
  discussed_on      date not null default current_date,
  discussed_by      uuid references auth.users(id) on delete set null,
  discussed_by_name text not null,
  created_at        timestamptz not null default now()
);
create unique index if not exists remark_ack_once_idx on public.remark_acknowledgements (remark_id);

drop trigger if exists remarks_immutable on public.remarks;
create trigger remarks_immutable before update or delete on public.remarks
  for each row execute function public.raise_immutable();

drop trigger if exists remark_ack_immutable on public.remark_acknowledgements;
create trigger remark_ack_immutable before update or delete on public.remark_acknowledgements
  for each row execute function public.raise_immutable();

-- ---------- reports may never be hard-deleted ----------
-- A verification is half of a teacher's accountability record. If it can be
-- erased, the record has an eraser, and a record with an eraser is worth
-- little in a dispute. The application soft-deletes; this makes it structural.
create or replace function public.reports_no_hard_delete() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'reports are soft-deleted (set deleted_at); hard delete is not permitted';
end;
$$;

drop trigger if exists reports_no_hard_delete on public.reports;
create trigger reports_no_hard_delete before delete on public.reports
  for each row execute function public.reports_no_hard_delete();

-- ---------- ROW LEVEL SECURITY ----------
alter table public.faculty                 enable row level security;
alter table public.faculty_previous_names  enable row level security;
alter table public.faculty_postings        enable row level security;
alter table public.faculty_audit           enable row level security;
alter table public.remarks                 enable row level security;
alter table public.remark_acknowledgements enable row level security;

-- Soft-deleted reports vanish from every read path at the policy level, rather
-- than relying on each query remembering `.is("deleted_at", null)`.
drop policy if exists "reports_read" on public.reports;
create policy "reports_read" on public.reports for select
  using (
    deleted_at is null
    and (public.my_role() in ('owner','management') or campus_id = public.my_campus())
  );

drop policy if exists "faculty_read" on public.faculty;
create policy "faculty_read" on public.faculty for select
  using (public.my_role() in ('owner','management') or campus_id = public.my_campus());

drop policy if exists "faculty_insert" on public.faculty;
create policy "faculty_insert" on public.faculty for insert
  with check (public.my_role() in ('owner','management') or campus_id = public.my_campus());

-- Coordinators may ADD a teacher (they would otherwise be stuck mid-
-- verification) but never amend one.
drop policy if exists "faculty_update" on public.faculty;
create policy "faculty_update" on public.faculty for update
  using (public.my_role() in ('owner','management')
         or (public.my_role() = 'principal' and campus_id = public.my_campus()))
  with check (public.my_role() in ('owner','management')
         or (public.my_role() = 'principal' and campus_id = public.my_campus()));
-- No delete policy anywhere: faculty are deactivated, never destroyed.

drop policy if exists "faculty_prev_read" on public.faculty_previous_names;
create policy "faculty_prev_read" on public.faculty_previous_names for select
  using (exists (select 1 from public.faculty f where f.id = faculty_id
                 and (public.my_role() in ('owner','management') or f.campus_id = public.my_campus())));

drop policy if exists "faculty_prev_insert" on public.faculty_previous_names;
create policy "faculty_prev_insert" on public.faculty_previous_names for insert
  with check (public.my_role() in ('owner','management','principal'));

drop policy if exists "faculty_postings_read" on public.faculty_postings;
create policy "faculty_postings_read" on public.faculty_postings for select
  using (exists (select 1 from public.faculty f where f.id = faculty_id
                 and (public.my_role() in ('owner','management') or f.campus_id = public.my_campus())));

drop policy if exists "faculty_postings_write" on public.faculty_postings;
create policy "faculty_postings_write" on public.faculty_postings for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "faculty_audit_read" on public.faculty_audit;
create policy "faculty_audit_read" on public.faculty_audit for select
  using (exists (select 1 from public.faculty f where f.id = faculty_id
                 and (public.my_role() in ('owner','management') or f.campus_id = public.my_campus())));

drop policy if exists "faculty_audit_insert" on public.faculty_audit;
create policy "faculty_audit_insert" on public.faculty_audit for insert
  with check (auth.role() = 'authenticated');

-- Remarks about a teacher: leadership only, never the coordinator who verified
-- them. Remarks to a coordinator: leadership, plus the coordinator concerned —
-- otherwise it is not feedback.
drop policy if exists "remarks_read" on public.remarks;
create policy "remarks_read" on public.remarks for select
  using (
    public.my_role() in ('owner','management')
    or (public.my_role() = 'principal' and campus_id = public.my_campus())
    or (target = 'coordinator' and coordinator_id = auth.uid())
  );

drop policy if exists "remarks_insert" on public.remarks;
create policy "remarks_insert" on public.remarks for insert
  with check (
    author_id = auth.uid()
    and (public.my_role() in ('owner','management')
         or (public.my_role() = 'principal' and campus_id = public.my_campus()))
  );
-- No update or delete policy. With the trigger above, remarks are permanent
-- for every role including service_role.

drop policy if exists "remark_ack_read" on public.remark_acknowledgements;
create policy "remark_ack_read" on public.remark_acknowledgements for select
  using (exists (select 1 from public.remarks r where r.id = remark_id));

drop policy if exists "remark_ack_insert" on public.remark_acknowledgements;
create policy "remark_ack_insert" on public.remark_acknowledgements for insert
  with check (
    discussed_by = auth.uid()
    and exists (select 1 from public.remarks r where r.id = remark_id
                and (public.my_role() in ('owner','management')
                     or (public.my_role() = 'principal' and r.campus_id = public.my_campus())))
  );
