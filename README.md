# KR_Labs

KR_Labs is a TypeScript crawling pipeline MVP for collecting public Korean university lab, professor, department, publication-candidate, and crawl quality data.

This repository currently implements the PRD's crawler foundation plus a reusable school-by-school discovery loop:

- Supabase schema migration
- DB admin/upsert helpers
- school-specific crawler config for `snu`, `yonsei`, `korea`, `kaist`
- Playwright page extraction and link discovery
- rule-based entity extraction
- public lab member-count extraction for lab-size filtering
- crawl job, page, error, and review item logging
- validation report generation
- Hanyang graduate-school pipeline with department homepage supplementation, taxonomy-first classification, Supabase upsert, RAG evidence fields, and Playwright member-count enrichment

The public recommendation UI reads Supabase directly. RAG-specific storage fields are present for detailed research evidence, but a full RAG answer engine is still out of scope for this phase.

## Setup

```bash
pnpm install
pnpm exec playwright install chromium
cp .env.example .env
```

Fill `.env`:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CRAWLER_HEADLESS=true
CRAWLER_MAX_PAGES=50
CRAWLER_CONCURRENCY=2
CRAWLER_DELAY_MS=1000
CRAWLER_USER_AGENT=KR-Labs-Crawler/0.1 contact@example.com
```

Apply migrations in `supabase/migrations/` to your Supabase project. The current app expects both crawler tables and ranking-compatible `universities`, `professors`, and `research_sub_fields` tables.

## Commands

```bash
pnpm seed:universities
pnpm crawl:dry-run --school=snu --max-pages=3
pnpm crawl:school --school=snu --mode=discover
pnpm crawl:validate --school=snu
pnpm crawl:update-labs --school=snu
```

`crawl:update-labs` is currently a Task 7 scaffold. The discover and validation pipeline is implemented first, per the PRD sequence.

## Hanyang Graduate Pipeline

The most complete reusable pipeline today is Hanyang:

```bash
pnpm discover:hanyang-grad \
  --max-research-enrichment-labs=9999 \
  --max-member-enrichment-labs=9999 \
  --homepage-enrichment=verified
```

The crawler starts from:

```text
http://www.grad.hanyang.ac.kr/department/departmentintro.php
```

It then discovers graduate departments, supplements from department homepages, follows professor/lab pages with Playwright, extracts research evidence, classifies against the central taxonomy, and counts members only from professor personal lab homepages.

Validate and upsert:

```bash
pnpm validate:hanyang-grad \
  --report=reports/hanyang-grad-discovery.json \
  --validation=reports/hanyang-grad-discovery-validation.json

pnpm reset:hanyang-supabase --confirm
pnpm upsert:hanyang-grad \
  --confirm \
  --allow-needs-review \
  --report=reports/hanyang-grad-discovery.json \
  --validation=reports/hanyang-grad-discovery-validation.json
```

If Hanyang rows are already in Supabase and only member counts need to be refreshed:

```bash
pnpm enrich:hanyang-member-counts --confirm --concurrency=6
```

The member-count process deliberately ignores department pages, faculty lists, professor profile pages, graduate `lab_03.php` fallback pages, alumni/former sections, and obvious non-lab sources. It accepts only current-member evidence from personal lab homepages.

## Reusable School Skill

New school work should follow:

- [AGENTS.md](./AGENTS.md) for the Codex execution checklist.
- [docs/school-crawling-playbook.md](./docs/school-crawling-playbook.md) for school onboarding.
- [docs/crawling-classification-pipeline.md](./docs/crawling-classification-pipeline.md) for taxonomy-first classification.
- [docs/taxonomy-evolution.md](./docs/taxonomy-evolution.md) for alias/category expansion rules.
- [docs/crawler-recipes.json](./docs/crawler-recipes.json) for accumulated school-specific fixes.

## Validation Output

Validation writes:

```text
reports/{schoolSlug}-{jobId}.json
reports/{schoolSlug}-{jobId}.md
```

The report includes page counts, failure counts, entity counts, member-count coverage, taxonomy coverage, source priority, fallback counts, and sample rows.

## Development

```bash
pnpm typecheck
pnpm crawl:school --help
pnpm crawl:validate --help
```

If Supabase credentials are missing, DB-backed commands fail with a clear environment-variable error before crawling begins.
