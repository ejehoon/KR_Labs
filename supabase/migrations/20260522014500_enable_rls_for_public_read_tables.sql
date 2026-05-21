alter table public.universities enable row level security;
alter table public.research_sub_fields enable row level security;

drop policy if exists "Enable read access for all users" on public.universities;
create policy "Enable read access for all users"
  on public.universities
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Enable read access for all users" on public.research_sub_fields;
create policy "Enable read access for all users"
  on public.research_sub_fields
  for select
  to anon, authenticated
  using (true);
