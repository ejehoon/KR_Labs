drop table if exists public.bookmarks;
drop table if exists public.professor_sub_fields;
drop table if exists public.professor_research_fields;

alter table if exists public.research_sub_fields
  drop constraint if exists research_sub_fields_field_id_fkey;

alter table if exists public.research_sub_fields
  drop column if exists field_id;

drop table if exists public.research_fields;
drop table if exists public.research_categories;
