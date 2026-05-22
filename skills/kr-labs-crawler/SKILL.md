---
name: kr-labs-crawler
description: Use this skill when crawling Korean university labs for KR_Labs, especially when the user provides a school, graduate-school, department, faculty, or lab URL and wants reusable Playwright discovery, professor/lab extraction, taxonomy-first classification, Supabase upsert, validation reports, or member-count enrichment.
---

# KR_Labs Crawler Skill

Use this skill to run and extend the KR_Labs school-by-school crawling pipeline.

## Core Rules

- Use Playwright to inspect structure before extracting records.
- Start from official school/graduate/department pages.
- Prefer official department faculty/lab pages over school-wide fallback pages.
- Treat crawled research text as evidence, not as the final category.
- Classify against `packages/crawler/src/taxonomy/researchTaxonomy.ts`.
- Prefer existing taxonomy aliases first.
- If no existing category fits, add at most one reusable new category per professor/lab record.
- If research evidence is missing or noisy, classify by department-name fallback.
- Store detailed research evidence separately for RAG fields.
- Count members only from professor personal lab homepages.
- Never count members from department pages, faculty lists, professor profile pages, graduate fallback pages, or alumni/former sections.

## First Checks In A New Clone

Run:

```bash
pnpm install
pnpm exec playwright install chromium
pnpm typecheck
```

Require `.env`:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CRAWLER_HEADLESS=true
CRAWLER_USER_AGENT=KR-Labs-Crawler/0.1 contact@example.com
```

## Hanyang Full Pipeline

Discovery:

```bash
pnpm discover:hanyang-grad \
  --max-research-enrichment-labs=9999 \
  --max-member-enrichment-labs=9999 \
  --homepage-enrichment=verified
```

Validate:

```bash
pnpm validate:hanyang-grad \
  --report=reports/hanyang-grad-discovery.json \
  --validation=reports/hanyang-grad-discovery-validation.json
```

Reset and upsert:

```bash
pnpm reset:hanyang-supabase --confirm
pnpm upsert:hanyang-grad \
  --confirm \
  --allow-needs-review \
  --report=reports/hanyang-grad-discovery.json \
  --validation=reports/hanyang-grad-discovery-validation.json
```

Refresh member counts for existing Hanyang rows:

```bash
pnpm enrich:hanyang-member-counts --confirm --concurrency=6
```

## New School Workflow

When the user gives a new school URL:

1. Open the URL with Playwright and identify page type.
2. Find department/program links and official department homepages.
3. For each department, find faculty/professor/lab pages.
4. Extract professor name, email, lab homepage, research text, and source URL separately.
5. Follow lab homepage Research pages for evidence.
6. Follow lab homepage Members/People/Students/Team/구성원/멤버/학생/연구원 pages for current member count.
7. Exclude Alumni/Former/Past/졸업/동문.
8. Classify evidence against the central taxonomy.
9. Add aliases or one reusable new category when needed.
10. Generate validation/report output before Supabase writes.

## Repository References

Load these files when needed:

- `AGENTS.md`: project-level Codex workflow
- `README.md`: setup and common commands
- `docs/school-crawling-playbook.md`: school onboarding process
- `docs/crawling-classification-pipeline.md`: classification/storage rules
- `docs/taxonomy-evolution.md`: alias and category rules
- `docs/crawler-recipes.json`: accumulated school-specific fixes

## Validation Standard

Before finishing a crawler change:

```bash
pnpm typecheck
```

For DB changes, also run the relevant dry-run command first, then the `--confirm` command only when the user asks to update Supabase.
