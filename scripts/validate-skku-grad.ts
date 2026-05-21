import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

type ResearchClassification = {
  matches?: Array<{ labelKo: string; evidence?: string[] }>;
  suggestions?: Array<{ suggestedLabel: string; evidence?: string[] }>;
};

type SkkuCollege = {
  id?: string;
  nameKo: string;
  nameEn?: string;
  url: string;
  adapter: string;
};

type SkkuLabCandidate = {
  collegeNameKo: string;
  departmentName: string;
  labName?: string;
  professorName?: string;
  researchText?: string;
  email?: string;
  location?: string;
  phone?: string;
  labUrl?: string;
  sourceUrl: string;
  classification?: ResearchClassification;
  currentMemberCount?: number;
  memberCount?: number;
  memberCountSourceUrl?: string;
  dblpUrl?: string;
  dblpAuthorName?: string;
  dblpResolutionMethod?: "direct_link" | "exact_author_search";
  dblpEvidence?: string;
  dblpWarnings?: string[];
  paperCount?: number;
  paperCountSource?: "dblp" | "publication_page";
  paperCountSourceUrl?: string;
};

type SkkuDiscoveryReport = {
  generatedAt: string;
  colleges: SkkuCollege[];
  labCandidates: SkkuLabCandidate[];
  skippedColleges?: Array<{ college: SkkuCollege; reason: string }>;
};

type ValidationIssue = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  count: number;
  samples: Array<Record<string, unknown>>;
};

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      args.set("help", true);
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      args.set(match[1] ?? "", match[2] ?? "");
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: pnpm validate:skku-grad [--report=reports/skku-grad-discovery.json]

Validates the local SKKU graduate lab-index discovery JSON for index coverage,
missing lab URLs, taxonomy gaps, and skipped college adapters.
`);
}

function countBy<T>(items: T[], getKey: (item: T) => string | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = getKey(item);
    if (!key) {
      continue;
    }
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function sample(rows: SkkuLabCandidate[], limit = 20) {
  return rows.slice(0, limit).map((row) => ({
    college: row.collegeNameKo,
    department: row.departmentName,
    lab: row.labName,
    professor: row.professorName,
    researchText: row.researchText,
    labUrl: row.labUrl,
    taxonomy: row.classification?.matches?.map((match) => match.labelKo) ?? [],
    dblpUrl: row.dblpUrl,
    dblpAuthorName: row.dblpAuthorName,
    dblpWarnings: row.dblpWarnings,
  }));
}

function buildIssue(
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
  rows: SkkuLabCandidate[],
  limit = 20,
): ValidationIssue | undefined {
  if (rows.length === 0) {
    return undefined;
  }
  return { severity, code, message, count: rows.length, samples: sample(rows, limit) };
}

function duplicateRows(rows: SkkuLabCandidate[], getKey: (row: SkkuLabCandidate) => string | undefined) {
  const buckets = new Map<string, SkkuLabCandidate[]>();
  for (const row of rows) {
    const key = getKey(row);
    if (!key) {
      continue;
    }
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }
  return [...buckets.entries()]
    .filter(([, bucket]) => bucket.length > 1)
    .map(([key, bucket]) => ({ key, count: bucket.length, rows: sample(bucket, 5) }));
}

function validate(report: SkkuDiscoveryReport, sourcePath: string) {
  const candidates = report.labCandidates;
  const skippedColleges = report.skippedColleges ?? [];
  const missingResearch = candidates.filter((row) => !row.researchText);
  const missingProfessor = candidates.filter((row) => !row.professorName);
  const missingLabUrl = candidates.filter((row) => !row.labUrl);
  const suspiciousLabUrl = candidates.filter((row) => hasSuspiciousLabUrl(row.labUrl));
  const noTaxonomy = candidates.filter((row) => (row.classification?.matches ?? []).length === 0);
  const dashLabName = candidates.filter((row) => !row.labName || row.labName === "-");
  const withMemberCount = candidates.filter((row) => typeof row.currentMemberCount === "number" || typeof row.memberCount === "number");
  const withDblpUrl = candidates.filter((row) => row.dblpUrl);
  const withDblpPaperCount = candidates.filter((row) => row.paperCountSource === "dblp");
  const withPublicationPagePaperCount = candidates.filter((row) => row.paperCountSource === "publication_page");
  const manualDblpRejects = candidates.filter((row) => row.dblpWarnings?.some((warning) => warning.startsWith("manual_review_rejected:")));
  const suspiciousMemberSource = candidates.filter((row) =>
    row.memberCountSourceUrl && /(?:^|[\/_-])(?:publications?|papers?|projects?|research|current[-_]?news|news|awards?|posts?|contact|articles?|policy|privacy|terms|agreement|signup|mypage|current[-_]?students|admissions?|welfare|support|schoollife\d*|activity|exchange[-_]?students|exhange[-_]?students|cscience[-_]?current|student[-_]?scg|student[-_]?sw|student[-_]?global[-_]?stu|student[-_]?(?:[a-z]+[-_])*[a-z]*stu|research[-_]?biotech|alumi|links?|group[-_]?photos?|photos?|galler(?:y|ies))(?:[\/_.-]|$|[?#])|(?:^|\/)(?:prof|professor|faculty|principal(?:[-_]?investigator)?|pi|fulltime)(?:[-_/]|$|[?#])|#role-member-pages$|bo_table=student|peopleprofe|researchfaculty|faculty|professor|교수진|전임교원|교원소개|login(?:\.php)?|give\.skku\.edu|ihappynanum\.com|samsunghospital\.com\/home\/future\/|success\.skku\.edu\/success\/index\.do|coefs\.charlotte\.edu\/(?:ttxu|hzhang3)|coefs\.uncc\.edu\/hcho17|^https?:\/\/(?:www\.)?skku\.edu\/?$|^https?:\/\/(?:www\.)?skkumed\.ac\.kr\/?$|nature\.com|samsungstf\.org|microsoft\.com\/en-us\/research\/people|researcher\/viewresearcher|viewresearcher\.do|researchgate\.net|scientific-contributions/i.test(row.memberCountSourceUrl),
  );
  const taxonomyCounts: Record<string, number> = {};

  for (const candidate of candidates) {
    for (const match of candidate.classification?.matches ?? []) {
      taxonomyCounts[match.labelKo] = (taxonomyCounts[match.labelKo] ?? 0) + 1;
    }
  }

  const skippedCollegeIssues: ValidationIssue[] = skippedColleges.map((item) => ({
    severity: "info",
    code: "skipped_college_adapter",
    message: `별도 adapter가 필요한 단과대학입니다: ${item.reason}`,
    count: 1,
    samples: [{ college: item.college.nameKo, url: item.college.url, adapter: item.college.adapter }],
  }));

  const issues = [
    buildIssue("warning", "missing_research_text", "연구실 후보에 연구분야 텍스트가 없습니다.", missingResearch),
    buildIssue("error", "missing_professor", "연구실 후보에 대표교수명이 없습니다.", missingProfessor),
    buildIssue("warning", "missing_lab_url", "연구실 홈페이지 URL이 없습니다. 다음 단계에서 홈페이지 resolver가 필요합니다.", missingLabUrl),
    buildIssue("warning", "suspicious_lab_url", "연구실 홈페이지 URL이 ResearchGate/Scholar/대학원 내부 깨진 링크처럼 보입니다.", suspiciousLabUrl),
    buildIssue("warning", "suspicious_member_source", "연구원 수 출처가 publications/professor 등 신뢰하기 어려운 페이지입니다.", suspiciousMemberSource),
    buildIssue("info", "dblp_manual_reject", "DBLP 후보였지만 교수 본인 근거가 약해 저장하지 않은 항목입니다.", manualDblpRejects),
    buildIssue("info", "dash_or_empty_lab_name", "연구실명이 비어 있거나 '-'로 표시되어 있습니다.", dashLabName),
    buildIssue("info", "no_taxonomy_match", "중앙 taxonomy에 확정 매칭되지 않은 후보입니다.", noTaxonomy),
    ...skippedCollegeIssues,
  ].filter((issue): issue is ValidationIssue => Boolean(issue));

  return {
    sourcePath,
    generatedAt: new Date().toISOString(),
    reportGeneratedAt: report.generatedAt,
    status: issues.some((issue) => issue.severity === "error") ? "failed" : issues.some((issue) => issue.severity === "warning") ? "needs_review" : "success",
    coverage: {
      colleges: report.colleges.length,
      parsedColleges: report.colleges.length - skippedColleges.length,
      skippedColleges: skippedColleges.length,
      labCandidates: candidates.length,
      withResearchText: candidates.length - missingResearch.length,
      withProfessor: candidates.length - missingProfessor.length,
      withLabUrl: candidates.length - missingLabUrl.length,
      withTaxonomyMatch: candidates.length - noTaxonomy.length,
      withMemberCount: withMemberCount.length,
      withDblpUrl: withDblpUrl.length,
      withDblpPaperCount: withDblpPaperCount.length,
      withPublicationPagePaperCount: withPublicationPagePaperCount.length,
    },
    gaps: {
      labUrlMissing: missingLabUrl.length,
      taxonomyMissing: noTaxonomy.length,
      memberCountMissing: candidates.length - withMemberCount.length,
      dblpUrlMissing: candidates.length - withDblpUrl.length,
      paperCountMissing: candidates.filter((row) => typeof row.paperCount !== "number").length,
      labNameWeak: dashLabName.length,
      externalAdaptersMissing: skippedColleges.length,
    },
    counts: {
      byCollege: countBy(candidates, (row) => row.collegeNameKo),
      byDepartment: countBy(candidates, (row) => row.departmentName),
      byTaxonomy: Object.fromEntries(Object.entries(taxonomyCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    },
    duplicates: {
      professorByDepartment: duplicateRows(candidates, (row) => `${row.departmentName}|${row.professorName ?? ""}`),
      labUrl: duplicateRows(candidates, (row) => row.labUrl),
    },
    issues,
  };
}

function hasSuspiciousLabUrl(url: string | undefined): boolean {
  const value = url ?? "";
  return /^ttp:\/\//i.test(value)
    || /researchgate\.net|scholar\.google|youtube\.com|youtu\.be|viewresearcher\.do|researcher\/viewresearcher/i.test(value)
    || /gradschool\.skku\.edu\/grad\/prepare\/(?!laboratory_01\.htm)/i.test(value)
    || /^https?:\/\/(?:www\.)?skku\.edu\/?$/i.test(value)
    || /^https?:\/\/(?:www\.)?skkumed\.ac\.kr\/?$/i.test(value)
    || /give\.skku\.edu/i.test(value)
    || /ihappynanum\.com/i.test(value)
    || /samsunghospital\.com\/home\/main\/index\.do(?:$|[?#])/i.test(value)
    || /bk21plus\.skku\.edu\/med\/main\/main\.jsp(?:$|[?#])/i.test(value)
    || /^https?:\/\/pharmacy-70years\.skku\.edu\/?$/i.test(value)
    || /skb\.skku\.edu\/sportis\/index\.do(?:$|[?#])/i.test(value)
    || /gradschool\.skku\.edu\/grad\/index\.htm(?:$|[?#])/i.test(value)
    || /^https?:\/\/bio\.skku\.edu\/?$/i.test(value)
    || /skb\.skku\.edu\/eng_pharm\/?(?:$|[?#])/i.test(value)
    || /biotech\.skku\.edu\/biotech\/research_[^/]+\.do(?:$|[?#])/i.test(value)
    || /bio\.skku\.edu\/bbs\/board\.php/i.test(value)
    || /shb\.skku\.edu\/sport\/?(?:$|[?#])/i.test(value)
    || /biomedical\.skku\.edu\/eng\/html\/research\/laboratory\.asp(?:$|[?#])/i.test(value)
    || /pharm\.skku\.edu\/graduate\/graduate\d+_laboratory\.php(?:$|[?#])/i.test(value)
    || /sport\.skku\.edu\/sports\/research\/research_[^/]+\.do(?:$|[?#])/i.test(value)
    || /coe\.skku\.edu\/coe\/index\.jsp(?:$|[?#])/i.test(value);
}

function renderMarkdown(validation: ReturnType<typeof validate>) {
  const coverageRows = Object.entries(validation.coverage)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join("\n");
  const gapRows = Object.entries(validation.gaps)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join("\n");
  const issueRows = validation.issues
    .map((issue) => `| ${issue.severity} | ${issue.code} | ${issue.count} | ${issue.message} |`)
    .join("\n");

  return `# SKKU Graduate Lab Discovery Validation

- Source: ${validation.sourcePath}
- Status: ${validation.status}
- Generated At: ${validation.generatedAt}

## Coverage

| metric | value |
|---|---:|
${coverageRows}

## Gaps

| metric | missing |
|---|---:|
${gapRows}

## Issues

| severity | code | count | message |
|---|---|---:|---|
${issueRows || "|  |  | 0 | No issues |"}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const reportPath = String(args.get("report") ?? "reports/skku-grad-discovery.json");
  const report = JSON.parse(await readFile(reportPath, "utf8")) as SkkuDiscoveryReport;
  const validation = validate(report, reportPath);

  await mkdir("reports", { recursive: true });
  const outputBase = basename(reportPath).replace(/\.json$/i, "");
  const jsonPath = join("reports", `${outputBase}-validation.json`);
  const mdPath = join("reports", `${outputBase}-validation.md`);
  await writeFile(jsonPath, `${JSON.stringify(validation, null, 2)}\n`, "utf8");
  await writeFile(mdPath, renderMarkdown(validation), "utf8");

  console.log(JSON.stringify({ jsonPath, mdPath, status: validation.status, coverage: validation.coverage, gaps: validation.gaps }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
