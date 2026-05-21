alter table public.labs
  add column if not exists current_member_count int check (current_member_count is null or current_member_count >= 0),
  add column if not exists member_count_breakdown jsonb default '{}',
  add column if not exists member_count_source_url text,
  add column if not exists member_count_crawled_at timestamptz;

create index if not exists labs_current_member_count_idx
  on public.labs (current_member_count)
  where current_member_count is not null;
