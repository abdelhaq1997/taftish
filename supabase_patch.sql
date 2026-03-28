alter table public.inspectors add column if not exists share_code text;
update public.inspectors set share_code = upper(coalesce(nullif(card_id,''), substr(md5(id::text),1,8))) where share_code is null;
create unique index if not exists inspectors_share_code_idx on public.inspectors (share_code);

-- منظومة التفتيش التربوي — Supabase patch
-- شغّل هذا بعد الـ SQL الأولي الذي أرسلته لك سابقاً.

alter table public.teachers add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;
alter table public.teachers add column if not exists inspector_id uuid references public.inspectors(id) on delete cascade;

alter table public.tickets add column if not exists inspector_id uuid references public.inspectors(id) on delete cascade;
alter table public.reports add column if not exists inspector_id uuid references public.inspectors(id) on delete cascade;
alter table public.reports add column if not exists summary text;
alter table public.reports add column if not exists file_size bigint default 0;
alter table public.visits add column if not exists inspector_id uuid references public.inspectors(id) on delete cascade;

update public.teachers set inspector_id = owner_id where inspector_id is null and owner_id is not null;
update public.tickets  set inspector_id = owner_id where inspector_id is null and owner_id is not null;
update public.reports  set inspector_id = owner_id where inspector_id is null and owner_id is not null;
update public.visits   set inspector_id = owner_id where inspector_id is null and owner_id is not null;

-- Storage bucket اختياري لرفع ملفات التقارير
insert into storage.buckets (id, name, public)
select 'reports', 'reports', true
where not exists (select 1 from storage.buckets where id = 'reports');


create or replace function public.find_inspector_by_share_code(p_code text)
returns table (id uuid, full_name text, district text, share_code text)
language sql
security definer
set search_path = public
as $$
  select i.id, i.full_name, i.district, i.share_code
  from public.inspectors i
  where upper(i.share_code) = upper(trim(p_code))
  limit 1;
$$;

grant execute on function public.find_inspector_by_share_code(text) to anon, authenticated;

-- حذف السياسات القديمة إن كانت موجودة
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    select policyname, schemaname, tablename
    from pg_policies
    where schemaname='public'
      and tablename in ('inspectors','teachers','tickets','reports','visits')
  LOOP
    EXECUTE format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

-- Inspectors
create policy "inspectors_select_self"
on public.inspectors for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = id);

create policy "inspectors_insert_self"
on public.inspectors for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = id);

create policy "inspectors_update_self"
on public.inspectors for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = id);

-- Teachers: inspector يرى ويعدل أساتذته، والأستاذ يرى سجله فقط
create policy "teachers_select_inspector_or_self"
on public.teachers for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (
      (select auth.uid()) = inspector_id
      or (select auth.uid()) = owner_id
      or (select auth.uid()) = auth_user_id
    )
  );

create policy "teachers_insert_inspector_or_self"
on public.teachers for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and (
      (select auth.uid()) = inspector_id
      or (select auth.uid()) = owner_id
      or (select auth.uid()) = auth_user_id
    )
  );

create policy "teachers_update_inspector_or_self"
on public.teachers for update
  to authenticated
  using (
    (select auth.uid()) is not null
    and (
      (select auth.uid()) = inspector_id
      or (select auth.uid()) = owner_id
      or (select auth.uid()) = auth_user_id
    )
  )
  with check (
    (select auth.uid()) is not null
    and (
      (select auth.uid()) = inspector_id
      or (select auth.uid()) = owner_id
      or (select auth.uid()) = auth_user_id
    )
  );

create policy "teachers_delete_inspector"
on public.teachers for delete
  to authenticated
  using (
    (select auth.uid()) is not null
    and ((select auth.uid()) = inspector_id or (select auth.uid()) = owner_id)
  );

-- Tickets
create policy "tickets_select_inspector_or_teacher"
on public.tickets for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (
      (select auth.uid()) = inspector_id
      or (select auth.uid()) = owner_id
      or teacher_id in (select id from public.teachers where auth_user_id = (select auth.uid()))
    )
  );

create policy "tickets_insert_teacher_or_inspector"
on public.tickets for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and (
      (select auth.uid()) = inspector_id
      or (select auth.uid()) = owner_id
      or teacher_id in (select id from public.teachers where auth_user_id = (select auth.uid()))
    )
  );

create policy "tickets_update_inspector"
on public.tickets for update
  to authenticated
  using (
    (select auth.uid()) is not null
    and ((select auth.uid()) = inspector_id or (select auth.uid()) = owner_id)
  )
  with check (
    (select auth.uid()) is not null
    and ((select auth.uid()) = inspector_id or (select auth.uid()) = owner_id)
  );

create policy "tickets_delete_inspector"
on public.tickets for delete
  to authenticated
  using (
    (select auth.uid()) is not null
    and ((select auth.uid()) = inspector_id or (select auth.uid()) = owner_id)
  );

-- Reports
create policy "reports_select_inspector_or_teacher"
on public.reports for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (
      (select auth.uid()) = inspector_id
      or (select auth.uid()) = owner_id
      or teacher_id in (select id from public.teachers where auth_user_id = (select auth.uid()))
    )
  );

create policy "reports_insert_teacher_or_inspector"
on public.reports for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and (
      (select auth.uid()) = inspector_id
      or (select auth.uid()) = owner_id
      or teacher_id in (select id from public.teachers where auth_user_id = (select auth.uid()))
    )
  );

create policy "reports_update_inspector"
on public.reports for update
  to authenticated
  using (
    (select auth.uid()) is not null
    and ((select auth.uid()) = inspector_id or (select auth.uid()) = owner_id)
  )
  with check (
    (select auth.uid()) is not null
    and ((select auth.uid()) = inspector_id or (select auth.uid()) = owner_id)
  );

create policy "reports_delete_inspector"
on public.reports for delete
  to authenticated
  using (
    (select auth.uid()) is not null
    and ((select auth.uid()) = inspector_id or (select auth.uid()) = owner_id)
  );

-- Visits
create policy "visits_select_inspector_or_teacher"
on public.visits for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (
      (select auth.uid()) = inspector_id
      or (select auth.uid()) = owner_id
      or teacher_id in (select id from public.teachers where auth_user_id = (select auth.uid()))
    )
  );

create policy "visits_insert_inspector"
on public.visits for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and ((select auth.uid()) = inspector_id or (select auth.uid()) = owner_id)
  );

create policy "visits_update_inspector"
on public.visits for update
  to authenticated
  using (
    (select auth.uid()) is not null
    and ((select auth.uid()) = inspector_id or (select auth.uid()) = owner_id)
  )
  with check (
    (select auth.uid()) is not null
    and ((select auth.uid()) = inspector_id or (select auth.uid()) = owner_id)
  );

create policy "visits_delete_inspector"
on public.visits for delete
  to authenticated
  using (
    (select auth.uid()) is not null
    and ((select auth.uid()) = inspector_id or (select auth.uid()) = owner_id)
  );

-- Storage policies for reports bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='reports_public_read'
  ) THEN
    CREATE POLICY "reports_public_read"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'reports');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='reports_auth_insert'
  ) THEN
    CREATE POLICY "reports_auth_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'reports');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='reports_auth_update'
  ) THEN
    CREATE POLICY "reports_auth_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'reports')
    WITH CHECK (bucket_id = 'reports');
  END IF;
END $$;
