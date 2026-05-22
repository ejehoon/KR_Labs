# Crawling And Classification Pipeline

KR_Labs treats crawled research text as evidence, not as the final research category. The final category must come from the central KR_Labs taxonomy, or become a reviewed new-category candidate when the evidence does not match well enough.

## Step 1. Seed Intake

Input can be a school, college, department, faculty, or lab URL.

The crawler first records:

- seed URL
- school name
- allowed domains
- page type guess
- crawl depth and safety limits

No category is assigned at this step.

## Step 2. Site Structure Discovery

Use Playwright to identify the structure before extraction.

Detect:

- school-wide department index
- department homepage
- faculty/professor list
- lab list or lab table
- lab detail page
- hidden profile modal
- local category or track tabs such as `반도체`, `신호처리`, `통신`, `회로`

The output of this step is a structure map, not final lab records.

## Step 3. Source Priority Selection

For each department, choose the best source in this order:

1. official department lab page
2. official department faculty/profile page with lab links
3. school graduate lab index
4. generic table/card fallback

Example: Hanyang EECE uses `https://eece.hanyang.ac.kr/lab_all` before the Hanyang graduate lab index because the department page is more complete and user-verifiable.

## Step 4. Evidence Extraction

Extract fields separately.

- `labName`: display name of the lab
- `professorName`: professor or PI
- `homepageUrl`: lab/professor homepage
- `localCategory`: department-specific track such as `반도체` or `통신`
- `rawResearchText`: raw crawled research text, if present
- `cleanResearchText`: raw text after removing biography, education, career, publications, awards, and society sections
- `memberCount`: current lab member count only when a professor personal lab homepage exposes current members
- `sourceUrl`: where the evidence came from

Important: `rawResearchText` and `cleanResearchText` are evidence only. They are not the final KR_Labs category.

## Step 5. Evidence Normalization

Before classification:

- strip labels such as `연구분야:` or `Research Interests:`
- cut at section markers such as `학력`, `경력`, `Education`, `Career`, `Publications`, `주요논문`
- keep local category/track as a separate signal
- keep lab name as a weaker signal

For example:

```text
영상신호처리 ... 딥러닝 -학력 2015년 ... -경력 ...
```

becomes:

```text
영상신호처리 ... 딥러닝
```

## Step 6. Taxonomy Classification

Classify against the central KR_Labs taxonomy.

Evidence priority:

1. explicit professor/lab research area
2. department local category or track
3. lab name
4. department name fallback

Threshold rule:

- `confidence >= 0.7`: assign existing KR_Labs category
- `confidence < 0.7` and reusable concept exists in evidence: create at most one new reusable category for the record
- no stable research evidence: classify by department-name fallback

The assigned values are stored in:

- `classification.matches`
- `labs.research_keywords`
- `labs.normalized_keywords`

## Step 7. New Category Candidate Handling

When no existing category passes the threshold, the crawler should avoid creating many fine-grained one-off labels.

It should:

- prefer adding aliases to existing categories
- create at most one new reusable category per professor/lab record
- keep detailed evidence text separately for RAG
- include the source URL and evidence in validation reports

Do not:

- create multiple categories from one long raw research paragraph
- store raw crawled research text as the final category
- leave an item as `재크롤링 필요` when department-name fallback can classify it

## Step 8. Member Count Enrichment

Member count is optional and conservative.

Rules:

- Count members only from professor personal lab homepages.
- Never count members from department pages, faculty lists, professor profile pages, graduate `lab_03.php` fallback pages, or official school-wide index pages.
- Use Playwright to open member-like pages such as `Members`, `People`, `Team`, `Students`, `구성원`, `멤버`, `맴버`, `학생`, `대학원생`, and `연구원`.
- Exclude sections labeled `Alumni`, `Former`, `Past`, `졸업`, or `동문`.
- If current-member evidence is not clear, keep the count null.

## Step 9. Storage

Store final category fields separately from evidence.

Do:

- store taxonomy labels in `research_keywords`
- store taxonomy ids in `normalized_keywords`
- store raw/cleaned text as evidence/description/review metadata
- show category labels in UI
- store RAG evidence fields separately from category labels
- store `lab_member_count` only when the source is a current-member lab page

Do not:

- store raw crawled research text as the final research category
- display long profile text as `연구 분야`
- create one-off categories from a single noisy page

## Step 10. Validation Report

Every run should report:

- number of labs
- number of matched taxonomy categories
- number of new category candidates
- number of `needs_review`
- source priority used per department
- fallback URL count
- missing evidence count
- member-count known/unknown count

## Step 11. Recipe Update Loop

When a user finds an error:

1. identify the wrong source or extraction step
2. patch the generic extractor or verified school recipe
3. rerun discovery
4. rerun validation/report
5. record the fix in `docs/crawler-recipes.json`

This is how the crawler becomes denser over time without turning into one-off adapters.
