alter table public.review_items
  drop constraint if exists review_items_entity_type_check;

alter table public.review_items
  add constraint review_items_entity_type_check
  check (entity_type in ('department', 'professor', 'lab', 'publication', 'taxonomy_category'));

alter table public.review_items
  add column if not exists review_key text,
  add column if not exists priority int default 2 check (priority between 0 and 3),
  add column if not exists confidence numeric,
  add column if not exists source_url text;

create unique index if not exists review_items_open_review_key_idx
  on public.review_items (review_key)
  where review_key is not null and status = 'open';

create index if not exists review_items_reason_idx
  on public.review_items (reason);
