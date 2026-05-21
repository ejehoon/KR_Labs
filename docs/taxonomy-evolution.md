# KR_Labs Taxonomy Evolution

KR_Labs taxonomy is intentionally centralized and reviewed. Crawlers should treat crawled research text as evidence, classify every professor/lab against the shared taxonomy first, then emit unmatched suggestions instead of silently inventing one-off labels per school.

## Workflow

1. Crawl or enrich a school report.
2. Re-run classification against the central taxonomy.
3. Accept existing categories when confidence is at least `0.7`.
4. Review the generated taxonomy gap report for lower-confidence or unmatched evidence.
5. Add reusable categories or aliases only when they can apply across schools.
6. Reclassify the report and copy it to the frontend public data.

For Sogang:

```bash
pnpm reclassify:sogang-grad
pnpm validate:sogang-grad
```

Outputs:

- `reports/sogang-grad-discovery.json`: enriched report with refreshed classification.
- `apps/web/public/data/sogang-grad-discovery.json`: frontend copy.
- `reports/sogang-grad-discovery-taxonomy-gaps.md`: unmatched suggestions to review.

## Rules

- Prefer specific fields over broad labels. For example, use `물리/계산화학` for `양자화학` instead of `물리학`.
- Keep general English labels only when Korean students commonly use them, such as `AI`, `LLM`, and `AI for Science`.
- Do not add a category from a single noisy profile string. Add it when it is a stable research area or a reusable alias.
- If a professor/lab belongs outside CS, classify it into the correct non-CS domain instead of forcing it into `기타`.
- Lab homepage pages such as `Research`, `Introduction`, `People`, `Members`, and `Publications` should enrich the evidence, but the final label must still come from the shared taxonomy.
- Raw profile text must not be displayed or stored as the final research category. Store it as evidence/review metadata, then store only taxonomy labels/ids as category fields.
