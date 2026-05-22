alter table public.professors
  add column if not exists research_detail_text text,
  add column if not exists research_detail_topics text[] default '{}',
  add column if not exists research_detail_source_url text,
  add column if not exists research_detail_updated_at timestamptz;
