create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.universities (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_ko text not null,
  name_en text,
  homepage_url text not null,
  country text default 'KR',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  university_id uuid references public.universities(id) on delete cascade,
  name_ko text,
  name_en text,
  college_name text,
  homepage_url text,
  source_url text,
  crawl_confidence numeric default 0,
  status text default 'active' check (status in ('active', 'stale', 'inactive', 'needs_review')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.professors (
  id uuid primary key default gen_random_uuid(),
  university_id uuid references public.universities(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  name_ko text,
  name_en text,
  title text,
  email text,
  profile_url text,
  lab_url text,
  research_interests text[] default '{}',
  source_url text,
  crawl_confidence numeric default 0,
  status text default 'active' check (status in ('active', 'stale', 'inactive', 'needs_review')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.labs (
  id uuid primary key default gen_random_uuid(),
  university_id uuid references public.universities(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  professor_id uuid references public.professors(id) on delete set null,
  name_ko text,
  name_en text,
  homepage_url text,
  description text,
  research_keywords text[] default '{}',
  normalized_keywords text[] default '{}',
  source_url text,
  last_crawled_at timestamptz,
  last_changed_at timestamptz,
  content_hash text,
  crawl_confidence numeric default 0,
  status text default 'active' check (status in ('active', 'stale', 'inactive', 'needs_review')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.publications (
  id uuid primary key default gen_random_uuid(),
  university_id uuid references public.universities(id) on delete cascade,
  lab_id uuid references public.labs(id) on delete set null,
  professor_id uuid references public.professors(id) on delete set null,
  title text not null,
  authors text[] default '{}',
  venue text,
  year int,
  doi text,
  url text,
  abstract text,
  source text,
  source_url text,
  crawl_confidence numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.crawl_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('discover_school', 'update_labs', 'validate', 'backfill')),
  school_slug text,
  status text not null check (status in ('pending', 'running', 'success', 'failed', 'partial_success')),
  started_at timestamptz default now(),
  finished_at timestamptz,
  metrics jsonb default '{}',
  error_count int default 0,
  created_by text default 'system'
);

create table if not exists public.crawl_pages (
  id uuid primary key default gen_random_uuid(),
  crawl_job_id uuid references public.crawl_jobs(id) on delete cascade,
  url text not null,
  final_url text,
  domain text,
  page_type text check (page_type in ('university', 'department', 'faculty', 'professor', 'lab', 'publication', 'unknown')),
  http_status int,
  title text,
  extracted_text text,
  content_hash text,
  metadata jsonb default '{}',
  status text default 'success' check (status in ('success', 'failed', 'skipped', 'needs_review')),
  crawled_at timestamptz default now()
);

create table if not exists public.crawl_errors (
  id uuid primary key default gen_random_uuid(),
  crawl_job_id uuid references public.crawl_jobs(id) on delete cascade,
  url text,
  error_type text,
  message text,
  stack text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists public.review_items (
  id uuid primary key default gen_random_uuid(),
  entity_type text check (entity_type in ('department', 'professor', 'lab', 'publication')),
  entity_id uuid,
  reason text,
  suggested_action text,
  status text default 'open' check (status in ('open', 'resolved', 'ignored')),
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create unique index if not exists departments_university_homepage_url_key
  on public.departments (university_id, homepage_url)
  where homepage_url is not null;

create unique index if not exists departments_university_names_key
  on public.departments (university_id, coalesce(name_ko, ''), coalesce(name_en, ''))
  where name_ko is not null or name_en is not null;

create unique index if not exists professors_university_email_key
  on public.professors (university_id, lower(email))
  where email is not null;

create unique index if not exists professors_university_profile_url_key
  on public.professors (university_id, profile_url)
  where profile_url is not null;

create unique index if not exists professors_university_department_names_key
  on public.professors (university_id, department_id, coalesce(name_ko, ''), coalesce(name_en, ''))
  where name_ko is not null or name_en is not null;

create unique index if not exists labs_university_homepage_url_key
  on public.labs (university_id, homepage_url)
  where homepage_url is not null;

create unique index if not exists labs_university_professor_key
  on public.labs (university_id, professor_id)
  where professor_id is not null;

create unique index if not exists publications_doi_key
  on public.publications (lower(doi))
  where doi is not null;

create unique index if not exists publications_professor_title_year_key
  on public.publications (professor_id, lower(title), year)
  where professor_id is not null;

create index if not exists crawl_jobs_school_started_idx on public.crawl_jobs (school_slug, started_at desc);
create index if not exists crawl_pages_job_idx on public.crawl_pages (crawl_job_id);
create index if not exists crawl_errors_job_idx on public.crawl_errors (crawl_job_id);
create index if not exists review_items_status_idx on public.review_items (status, entity_type);

drop trigger if exists set_universities_updated_at on public.universities;
create trigger set_universities_updated_at before update on public.universities
for each row execute function public.set_updated_at();

drop trigger if exists set_departments_updated_at on public.departments;
create trigger set_departments_updated_at before update on public.departments
for each row execute function public.set_updated_at();

drop trigger if exists set_professors_updated_at on public.professors;
create trigger set_professors_updated_at before update on public.professors
for each row execute function public.set_updated_at();

drop trigger if exists set_labs_updated_at on public.labs;
create trigger set_labs_updated_at before update on public.labs
for each row execute function public.set_updated_at();

drop trigger if exists set_publications_updated_at on public.publications;
create trigger set_publications_updated_at before update on public.publications
for each row execute function public.set_updated_at();
