
-- منظومة التفتيش التربوي — Supabase advanced patch
-- شغّل هذا بعد schema الأساسي والـ patch السابق.

create extension if not exists pgcrypto;

alter table public.inspectors add column if not exists share_code text;
create unique index if not exists inspectors_share_code_idx on public.inspectors (upper(share_code));

alter table public.teachers add column if not exists academic_year text default '2025-2026';
alter table public.teachers add column if not exists status text default 'active';
alter table public.teachers add column if not exists invite_code text;
alter table public.teachers add column if not exists invite_status text default 'none';
create unique index if not exists teachers_invite_code_idx on public.teachers (upper(invite_code)) where invite_code is not null;

alter table public.tickets add column if not exists academic_year text default '2025-2026';
alter table public.reports add column if not exists academic_year text default '2025-2026';
alter table public.visits add column if not exists academic_year text default '2025-2026';

update public.inspectors set share_code = coalesce(share_code, card_id, upper(substr(md5(id::text),1,8)));
update public.teachers set academic_year = coalesce(academic_year, '2025-2026');
update public.teachers set status = coalesce(status, case when auth_user_id is null then 'invited' else 'active' end);
update public.teachers set invite_status = coalesce(invite_status, case when invite_code is null then 'none' when auth_user_id is null then 'pending' else 'accepted' end);
update public.tickets set academic_year = coalesce(academic_year, '2025-2026');
update public.reports set academic_year = coalesce(academic_year, '2025-2026');
update public.visits set academic_year = coalesce(academic_year, '2025-2026');

insert into storage.buckets (id, name, public)
select 'reports', 'reports', true
where not exists (select 1 from storage.buckets where id = 'reports');

create or replace function public.find_inspector_by_share_code(p_code text)
returns table (id uuid, full_name text, district text, province text, region text, level text, share_code text)
language sql
security definer
set search_path = public
as $$
  select i.id, i.full_name, i.district, i.province, i.region, i.level, i.share_code
  from public.inspectors i
  where upper(i.share_code) = upper(trim(p_code))
  limit 1;
$$;

grant execute on function public.find_inspector_by_share_code(text) to anon, authenticated;

create or replace function public.find_teacher_invite(p_code text)
returns table (
  teacher_id uuid,
  inspector_id uuid,
  full_name text,
  email text,
  school text,
  grade text,
  subject text,
  academic_year text,
  invite_code text,
  invite_status text,
  status text,
  color text
)
language sql
security definer
set search_path = public
as $$
  select t.id as teacher_id,
         t.inspector_id,
         t.full_name,
         t.email,
         t.school,
         t.grade,
         t.subject,
         t.academic_year,
         t.invite_code,
         t.invite_status,
         t.status,
         t.color
  from public.teachers t
  where upper(t.invite_code) = upper(trim(p_code))
    and coalesce(t.invite_status,'pending') in ('pending','sent')
  limit 1;
$$;

grant execute on function public.find_teacher_invite(text) to anon, authenticated;

-- storage policies
DO $$
BEGIN
  IF EXISTS (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='reports_storage_select_auth') THEN
    drop policy "reports_storage_select_auth" on storage.objects;
  END IF;
  IF EXISTS (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='reports_storage_insert_auth') THEN
    drop policy "reports_storage_insert_auth" on storage.objects;
  END IF;
  IF EXISTS (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='reports_storage_update_auth') THEN
    drop policy "reports_storage_update_auth" on storage.objects;
  END IF;
  IF EXISTS (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='reports_storage_delete_auth') THEN
    drop policy "reports_storage_delete_auth" on storage.objects;
  END IF;
END $$;

create policy "reports_storage_select_auth"
on storage.objects for select
to authenticated
using (bucket_id = 'reports');

create policy "reports_storage_insert_auth"
on storage.objects for insert
to authenticated
with check (bucket_id = 'reports');

create policy "reports_storage_update_auth"
on storage.objects for update
to authenticated
using (bucket_id = 'reports')
with check (bucket_id = 'reports');

create policy "reports_storage_delete_auth"
on storage.objects for delete
to authenticated
using (bucket_id = 'reports');
