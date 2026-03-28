-- منظومة التفتيش التربوي - Supabase schema
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('inspector', 'teacher')),
  full_name text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.inspector_settings (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  card_id text,
  region text,
  province text,
  district text,
  level text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  inspector_user_id uuid not null references public.profiles(user_id) on delete cascade,
  teacher_user_id uuid unique references public.profiles(user_id) on delete set null,
  email text not null,
  full_name text not null,
  school text not null,
  grade text not null,
  subject text,
  color text,
  status text not null default 'invited' check (status in ('invited','active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists teachers_inspector_idx on public.teachers(inspector_user_id);
create unique index if not exists teachers_inspector_email_idx on public.teachers(inspector_user_id, lower(email));

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  inspector_user_id uuid not null references public.profiles(user_id) on delete cascade,
  teacher_row_id uuid not null references public.teachers(id) on delete cascade,
  teacher_user_id uuid references public.profiles(user_id) on delete set null,
  teacher_name text not null,
  school text not null,
  type text not null,
  title text not null,
  description text not null,
  subject text,
  unit text,
  notes text,
  preferred_date date,
  status text not null default 'pending' check (status in ('pending','inprogress','closed','rejected')),
  inspector_note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tickets_inspector_idx on public.tickets(inspector_user_id);
create index if not exists tickets_teacher_idx on public.tickets(teacher_row_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  inspector_user_id uuid not null references public.profiles(user_id) on delete cascade,
  teacher_row_id uuid not null references public.teachers(id) on delete cascade,
  teacher_user_id uuid references public.profiles(user_id) on delete set null,
  teacher_name text not null,
  school text not null,
  grade text not null,
  title text not null,
  semester text,
  subject text,
  summary text,
  file_name text,
  file_size bigint default 0,
  file_path text,
  status text not null default 'pending_review' check (status in ('pending_review','approved','rejected')),
  inspector_note text default '',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reports_inspector_idx on public.reports(inspector_user_id);
create index if not exists reports_teacher_idx on public.reports(teacher_row_id);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  inspector_user_id uuid not null references public.profiles(user_id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  teacher_row_id uuid not null references public.teachers(id) on delete cascade,
  teacher_user_id uuid references public.profiles(user_id) on delete set null,
  date date not null,
  status text not null default 'scheduled' check (status in ('scheduled','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists visits_inspector_idx on public.visits(inspector_user_id);
create index if not exists visits_teacher_idx on public.visits(teacher_row_id);

alter table public.profiles enable row level security;
alter table public.inspector_settings enable row level security;
alter table public.teachers enable row level security;
alter table public.tickets enable row level security;
alter table public.reports enable row level security;
alter table public.visits enable row level security;

create or replace function public.is_inspector(uid uuid) returns boolean language sql stable as $$
  select exists(select 1 from public.profiles where user_id = uid and role = 'inspector');
$$;

-- profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- inspector settings
drop policy if exists "inspector_settings_own_all" on public.inspector_settings;
create policy "inspector_settings_own_all" on public.inspector_settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- teachers
drop policy if exists "teachers_inspector_select" on public.teachers;
create policy "teachers_inspector_select" on public.teachers for select to authenticated using (inspector_user_id = auth.uid() or teacher_user_id = auth.uid());
drop policy if exists "teachers_inspector_insert" on public.teachers;
create policy "teachers_inspector_insert" on public.teachers for insert to authenticated with check (inspector_user_id = auth.uid() or teacher_user_id = auth.uid());
drop policy if exists "teachers_update_actor" on public.teachers;
create policy "teachers_update_actor" on public.teachers for update to authenticated using (inspector_user_id = auth.uid() or teacher_user_id = auth.uid()) with check (inspector_user_id = auth.uid() or teacher_user_id = auth.uid());
drop policy if exists "teachers_inspector_delete" on public.teachers;
create policy "teachers_inspector_delete" on public.teachers for delete to authenticated using (inspector_user_id = auth.uid());

-- tickets
drop policy if exists "tickets_actor_select" on public.tickets;
create policy "tickets_actor_select" on public.tickets for select to authenticated using (inspector_user_id = auth.uid() or teacher_user_id = auth.uid());
drop policy if exists "tickets_teacher_insert" on public.tickets;
create policy "tickets_teacher_insert" on public.tickets for insert to authenticated with check (teacher_user_id = auth.uid() or inspector_user_id = auth.uid());
drop policy if exists "tickets_actor_update" on public.tickets;
create policy "tickets_actor_update" on public.tickets for update to authenticated using (inspector_user_id = auth.uid() or teacher_user_id = auth.uid()) with check (inspector_user_id = auth.uid() or teacher_user_id = auth.uid());
drop policy if exists "tickets_inspector_delete" on public.tickets;
create policy "tickets_inspector_delete" on public.tickets for delete to authenticated using (inspector_user_id = auth.uid());

-- reports
drop policy if exists "reports_actor_select" on public.reports;
create policy "reports_actor_select" on public.reports for select to authenticated using (inspector_user_id = auth.uid() or teacher_user_id = auth.uid());
drop policy if exists "reports_teacher_insert" on public.reports;
create policy "reports_teacher_insert" on public.reports for insert to authenticated with check (teacher_user_id = auth.uid() or inspector_user_id = auth.uid());
drop policy if exists "reports_actor_update" on public.reports;
create policy "reports_actor_update" on public.reports for update to authenticated using (inspector_user_id = auth.uid() or teacher_user_id = auth.uid()) with check (inspector_user_id = auth.uid() or teacher_user_id = auth.uid());
drop policy if exists "reports_inspector_delete" on public.reports;
create policy "reports_inspector_delete" on public.reports for delete to authenticated using (inspector_user_id = auth.uid());

-- visits
drop policy if exists "visits_actor_select" on public.visits;
create policy "visits_actor_select" on public.visits for select to authenticated using (inspector_user_id = auth.uid() or teacher_user_id = auth.uid());
drop policy if exists "visits_actor_insert" on public.visits;
create policy "visits_actor_insert" on public.visits for insert to authenticated with check (inspector_user_id = auth.uid() or teacher_user_id = auth.uid());
drop policy if exists "visits_actor_update" on public.visits;
create policy "visits_actor_update" on public.visits for update to authenticated using (inspector_user_id = auth.uid() or teacher_user_id = auth.uid()) with check (inspector_user_id = auth.uid() or teacher_user_id = auth.uid());
drop policy if exists "visits_inspector_delete" on public.visits;
create policy "visits_inspector_delete" on public.visits for delete to authenticated using (inspector_user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

-- Storage policies تعتمد على المسار: inspectorUserId/teacherRowId/file
drop policy if exists "reports_storage_select" on storage.objects;
create policy "reports_storage_select" on storage.objects for select to authenticated using (bucket_id = 'reports');
drop policy if exists "reports_storage_insert" on storage.objects;
create policy "reports_storage_insert" on storage.objects for insert to authenticated with check (bucket_id = 'reports');
drop policy if exists "reports_storage_update" on storage.objects;
create policy "reports_storage_update" on storage.objects for update to authenticated using (bucket_id = 'reports') with check (bucket_id = 'reports');
drop policy if exists "reports_storage_delete" on storage.objects;
create policy "reports_storage_delete" on storage.objects for delete to authenticated using (bucket_id = 'reports');
