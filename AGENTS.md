# KR_Labs Codex Guide

This repository is a reusable crawling pipeline for Korean university labs.

## Default Workflow

When a user gives a school/graduate/department URL:

1. Use Playwright-based discovery first.
2. Build a structure map: department index, department homepage, faculty list, lab page, professor profile, lab homepage.
3. Prefer official department lab/faculty pages over school-wide graduate fallback pages.
4. Treat crawled research text as evidence only.
5. Classify evidence against `packages/crawler/src/taxonomy/researchTaxonomy.ts`.
6. Use existing taxonomy aliases first.
7. If no match exists, create at most one reusable new category per record.
8. If research evidence is missing or noisy, classify by department name fallback.
9. Store detailed research evidence separately for RAG fields, never as the final category label.
10. Count members only from professor personal lab homepages, never from department/faculty pages.

## Hanyang Commands

Full discovery:

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

Reset and upsert Hanyang into Supabase:

```bash
pnpm reset:hanyang-supabase --confirm
pnpm upsert:hanyang-grad \
  --confirm \
  --allow-needs-review \
  --report=reports/hanyang-grad-discovery.json \
  --validation=reports/hanyang-grad-discovery-validation.json
```

Backfill member counts for already-upserted Hanyang rows:

```bash
pnpm enrich:hanyang-member-counts --confirm --concurrency=6
```

## Current Important Reports

Generated reports live under `reports/` and are intentionally ignored by Git. Regenerate them on each machine.

## Checks

Run this before committing crawler changes:

```bash
pnpm typecheck
```
