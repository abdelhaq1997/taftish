-- قاعدة البيانات + RLS + التهيئة التلقائية للملف الشخصي

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text unique,
  role text not null check (role in ('teacher', 'inspector')),
  som text,
  academy text,
  directorate text,
  district text,
  school_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_requests (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null check (request_type in ('visit','accompaniment','administrative','complaint','report')),
  subject text not null,
  message text not null,
  preferred_date date,
  status text not null default 'pending' check (status in ('pending','in_progress','closed','rejected')),
  inspector_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inspection_visits (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  inspector_id uuid not null references public.profiles(id) on delete cascade,
  visit_type text not null check (visit_type in ('classroom','guidance','followup','evaluation')),
  visit_date date not null,
  level text,
  subject text,
  lesson_title text,
  status text not null default 'scheduled' check (status in ('scheduled','completed','report_written','follow_up_required')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visit_reports (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null unique references public.inspection_visits(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  inspector_id uuid not null references public.profiles(id) on delete cascade,
  official_number text,
  planning_score int check (planning_score between 0 and 100),
  class_management_score int check (class_management_score between 0 and 100),
  didactics_score int check (didactics_score between 0 and 100),
  assessment_score int check (assessment_score between 0 and 100),
  strengths text,
  observations text,
  recommendations text,
  followup_actions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.performance_scores (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  period_label text not null,
  reports_commitment int not null default 0 check (reports_commitment between 0 and 100),
  responsiveness int not null default 0 check (responsiveness between 0 and 100),
  inspection_progress int not null default 0 check (inspection_progress between 0 and 100),
  admin_completion int not null default 0 check (admin_completion between 0 and 100),
  overall_score numeric(5,2) generated always as (
    round(((reports_commitment * 0.30 + responsiveness * 0.20 + inspection_progress * 0.35 + admin_completion * 0.15))::numeric, 2)
  ) stored,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists trg_teacher_requests_updated_at on public.teacher_requests;
create trigger trg_teacher_requests_updated_at before update on public.teacher_requests for each row execute function public.set_updated_at();

drop trigger if exists trg_inspection_visits_updated_at on public.inspection_visits;
create trigger trg_inspection_visits_updated_at before update on public.inspection_visits for each row execute function public.set_updated_at();

drop trigger if exists trg_visit_reports_updated_at on public.visit_reports;
create trigger trg_visit_reports_updated_at before update on public.visit_reports for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role, som, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'teacher'),
    new.raw_user_meta_data->>'som',
    case when coalesce(new.raw_user_meta_data->>'role', 'teacher') = 'inspector' then 'approved' else 'pending' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.teacher_requests enable row level security;
alter table public.inspection_visits enable row level security;
alter table public.visit_reports enable row level security;
alter table public.performance_scores enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists inspectors_select_all_profiles on public.profiles;
create policy inspectors_select_all_profiles on public.profiles for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'inspector' and p.status = 'approved')
);
drop policy if exists inspectors_update_profiles on public.profiles;
create policy inspectors_update_profiles on public.profiles for update to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'inspector' and p.status = 'approved')
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'inspector' and p.status = 'approved')
);

drop policy if exists teachers_manage_own_requests on public.teacher_requests;
create policy teachers_manage_own_requests on public.teacher_requests for all to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
drop policy if exists inspectors_manage_requests on public.teacher_requests;
create policy inspectors_manage_requests on public.teacher_requests for all to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'inspector' and p.status = 'approved')
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'inspector' and p.status = 'approved')
);

drop policy if exists teachers_select_own_visits on public.inspection_visits;
create policy teachers_select_own_visits on public.inspection_visits for select to authenticated using (teacher_id = auth.uid());
drop policy if exists inspectors_manage_visits on public.inspection_visits;
create policy inspectors_manage_visits on public.inspection_visits for all to authenticated using (
  inspector_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'inspector' and p.status = 'approved')
) with check (
  inspector_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'inspector' and p.status = 'approved')
);

drop policy if exists teachers_select_own_reports on public.visit_reports;
create policy teachers_select_own_reports on public.visit_reports for select to authenticated using (teacher_id = auth.uid());
drop policy if exists inspectors_manage_reports on public.visit_reports;
create policy inspectors_manage_reports on public.visit_reports for all to authenticated using (
  inspector_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'inspector' and p.status = 'approved')
) with check (
  inspector_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'inspector' and p.status = 'approved')
);

drop policy if exists teachers_select_own_scores on public.performance_scores;
create policy teachers_select_own_scores on public.performance_scores for select to authenticated using (teacher_id = auth.uid());
drop policy if exists inspectors_manage_scores on public.performance_scores;
create policy inspectors_manage_scores on public.performance_scores for all to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'inspector' and p.status = 'approved')
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'inspector' and p.status = 'approved')
);
