# KR_Labs

KR_Labs is a TypeScript crawling pipeline MVP for collecting public Korean university lab, professor, department, publication-candidate, and crawl quality data.

This repository currently implements the PRD's first crawler foundation tasks:

- Supabase schema migration
- DB admin/upsert helpers
- school-specific crawler config for `snu`, `yonsei`, `korea`, `kaist`
- Playwright page extraction and link discovery
- rule-based entity extraction
- public lab member-count extraction for lab-size filtering
- crawl job, page, error, and review item logging
- validation report generation

The public recommendation UI and LLM/RAG features are intentionally out of scope for this phase.

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

Apply the SQL migration in `supabase/migrations/20260519000000_init_crawling_schema.sql` to your Supabase project.

## Commands

```bash
pnpm seed:universities
pnpm crawl:dry-run --school=snu --max-pages=3
pnpm crawl:school --school=snu --mode=discover
pnpm crawl:validate --school=snu
pnpm crawl:update-labs --school=snu
```

`crawl:update-labs` is currently a Task 7 scaffold. The discover and validation pipeline is implemented first, per the PRD sequence.

## Validation Output

Validation writes:

```text
reports/{schoolSlug}-{jobId}.json
reports/{schoolSlug}-{jobId}.md
```

The report includes page counts, failure counts, entity counts, low-confidence counts, open review items, recent crawl errors, duplicate candidates, and sample rows.

## Development

```bash
pnpm typecheck
pnpm crawl:school --help
pnpm crawl:validate --help
```

If Supabase credentials are missing, DB-backed commands fail with a clear environment-variable error before crawling begins.
