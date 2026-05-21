import { mkdir, readFile, writeFile } from "node:fs/promises";

type ResearchClassification = {
  matches?: Array<{ labelKo: string; evidence?: string[] }>;
  suggestions?: Array<{ suggestedLabel: string; evidence?: string[] }>;
};

type KhuFacultyCandidate = {
  graduateSchoolName: string;
  departmentName?: string;
  nameKo?: string;
  nameEn?: string;
  email?: string;
  profileUrl?: string;
  labUrl?: string;
  labUrlKind?: string;
  sourceUrl: string;
  researchText?: string;
  classification?: ResearchClassification;
  currentMemberCount?: number;
  memberCountSourceUrl?: string;
  dblpUrl?: string;
  scholarUrl?: string;
  scopusUrl?: string;
  pureUrl?: string;
  warnings?: string[];
};

type KhuDiscoveryReport = {
  sourceUrl: string;
  generatedAt: string;
  schools: Array<{ name: string; homepageUrl: string; facultyUrls?: string[]; departmentUrls?: string[] }>;
  facultyCandidates: KhuFacultyCandidate[];
  sampleVerifications?: Array<{ status: string; evidence: string; checkedUrl?: string; name?: string; graduateSchoolName: string }>;
};

type ValidationIssue = {
  severity: "error" | "warning" | "info";
  code: string;
  count: number;
  message: string;
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

function hasNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sample(rows: KhuFacultyCandidate[], limit = 20) {
  return rows.slice(0, limit).map((row) => ({
    school: row.graduateSchoolName,
    department: row.departmentName,
    name: row.nameKo ?? row.nameEn,
    email: row.email,
    labUrl: row.labUrl,
    labUrlKind: row.labUrlKind,
    researchText: row.researchText,
    taxonomy: row.classification?.matches?.map((match) => match.labelKo) ?? [],
    memberCount: row.currentMemberCount ?? null,
    memberCountSourceUrl: row.memberCountSourceUrl,
    warnings: row.warnings ?? [],
  }));
}

function countBy<T>(items: T[], getKey: (item: T) => string | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")));
}

function duplicateRows(rows: KhuFacultyCandidate[], getKey: (row: KhuFacultyCandidate) => string | undefined) {
  const buckets = new Map<string, KhuFacultyCandidate[]>();
  for (const row of rows) {
    const key = getKey(row);
    if (!key) continue;
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }
  return [...buckets.entries()]
    .filter(([, bucket]) => bucket.length > 1)
    .map(([key, bucket]) => ({ key, count: bucket.length, rows: sample(bucket, 8) }));
}

function buildIssue(
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
  rows: KhuFacultyCandidate[],
): ValidationIssue | undefined {
  if (rows.length === 0) return undefined;
  return { severity, code, count: rows.length, message, samples: sample(rows) };
}

function validate(report: KhuDiscoveryReport, sourcePath: string) {
  const candidates = report.facultyCandidates;
  const fallbackRows = candidates.filter((row) => row.labUrlKind?.startsWith("fallback"));
  const noMemberCount = candidates.filter((row) => !hasNumber(row.currentMemberCount));
  const memberCountKnown = candidates.filter((row) => hasNumber(row.currentMemberCount));
  const noDblp = candidates.filter((row) => !row.dblpUrl);
  const noScholar = candidates.filter((row) => !row.scholarUrl);
  const noTaxonomy = candidates.filter((row) => (row.classification?.matches ?? []).length === 0);
  const missingResearchText = candidates.filter((row) => !row.researchText);
  const suspiciousMemberSource = candidates.filter((row) =>
    hasNumber(row.currentMemberCount)
    && /professor|faculty|교수|BMSR00047|BMSR00060|goods\.php|06\/01\.php/i.test(row.memberCountSourceUrl ?? ""),
  );
  const sampleNeedsReview = (report.sampleVerifications ?? []).filter((row) => row.status !== "ok");

  const issues = [
    buildIssue("warning", "fallback_lab_url", "연구실 홈페이지가 없어 교수 상세/교수 목록 fallback URL을 사용했습니다.", fallbackRows),
    buildIssue("info", "member_count_unknown", "현재 구성원 페이지에서 연구원수를 확인하지 못했습니다.", noMemberCount),
    buildIssue("info", "dblp_missing", "페이지에서 직접 확인된 DBLP URL이 없습니다.", noDblp),
    buildIssue("info", "scholar_missing", "페이지에서 직접 확인된 Scholar URL이 없습니다.", noScholar),
    buildIssue("warning", "taxonomy_unclassified", "기존 taxonomy와 확정 매칭되지 않은 후보입니다.", noTaxonomy),
    buildIssue("warning", "missing_research_text", "교수 상세/연구실 페이지에서 연구분야 텍스트를 확보하지 못했습니다.", missingResearchText),
    buildIssue("error", "suspicious_member_count_source", "연구원수 출처가 교수/학과 목록 페이지처럼 보입니다.", suspiciousMemberSource),
  ].filter((issue): issue is ValidationIssue => Boolean(issue));

  const taxonomyCounts: Record<string, number> = {};
  for (const candidate of candidates) {
    for (const match of candidate.classification?.matches ?? []) {
      taxonomyCounts[match.labelKo] = (taxonomyCounts[match.labelKo] ?? 0) + 1;
    }
  }

  return {
    sourcePath,
    sourceUrl: report.sourceUrl,
    reportGeneratedAt: report.generatedAt,
    generatedAt: new Date().toISOString(),
    status: issues.some((issue) => issue.severity === "error") ? "failed" : issues.some((issue) => issue.severity === "warning") ? "needs_review" : "success",
    coverage: {
      graduateSchools: report.schools.length,
      departments: Object.keys(countBy(candidates, (row) => row.departmentName)).length,
      professors: candidates.length,
      labUrlPresent: candidates.filter((row) => row.labUrl).length,
      labUrlNonFallback: candidates.filter((row) => row.labUrl && !row.labUrlKind?.startsWith("fallback")).length,
      labUrlFallback: fallbackRows.length,
      memberCountKnown: memberCountKnown.length,
      memberCountUnknown: noMemberCount.length,
      dblpUrlPresent: candidates.length - noDblp.length,
      scholarUrlPresent: candidates.length - noScholar.length,
      taxonomyClassified: candidates.length - noTaxonomy.length,
      taxonomyUnclassified: noTaxonomy.length,
      sampleVerifications: report.sampleVerifications?.length ?? 0,
      sampleNeedsReview: sampleNeedsReview.length,
    },
    counts: {
      byGraduateSchool: countBy(candidates, (row) => row.graduateSchoolName),
      byDepartment: countBy(candidates, (row) => row.departmentName),
      byTaxonomy: Object.fromEntries(Object.entries(taxonomyCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))),
    },
    duplicates: {
      email: duplicateRows(candidates, (row) => row.email),
      schoolName: duplicateRows(candidates, (row) => `${row.graduateSchoolName}|${row.nameKo ?? row.nameEn ?? ""}`),
      labUrl: duplicateRows(candidates, (row) => row.labUrl && !row.labUrlKind?.startsWith("fallback") ? row.labUrl : undefined),
    },
    fallbackUrlRows: sample(fallbackRows, 100),
    suspiciousRows: sample([...suspiciousMemberSource, ...missingResearchText], 100),
    manualReviewRows: sample(candidates.filter((row) =>
      row.labUrlKind?.startsWith("fallback")
      || (row.classification?.matches ?? []).length === 0
      || (row.warnings ?? []).length > 0,
    ), 150),
    sampleVerifications: report.sampleVerifications ?? [],
    issues,
  };
}

function renderMarkdown(validation: ReturnType<typeof validate>) {
  const coverageRows = Object.entries(validation.coverage).map(([key, value]) => `| ${key} | ${value} |`).join("\n");
  const issueRows = validation.issues.map((issue) => `| ${issue.severity} | ${issue.code} | ${issue.count} | ${issue.message} |`).join("\n");
  const fallbackRows = validation.fallbackUrlRows.slice(0, 80).map((row) => `| ${row.school} | ${row.name} | ${row.labUrl} | ${row.warnings} |`).join("\n");
  const verificationRows = validation.sampleVerifications.map((row) => `| ${row.graduateSchoolName} | ${row.name ?? ""} | ${row.status} | ${row.checkedUrl ?? ""} | ${row.evidence} |`).join("\n");

  return `# KHU Graduate Discovery Validation

- Source: ${validation.sourcePath}
- Target URL: ${validation.sourceUrl}
- Status: ${validation.status}
- Generated At: ${validation.generatedAt}

## Coverage

| metric | value |
|---|---:|
${coverageRows}

## Required Checks

| item | value |
|---|---:|
| 총 학과 수 | ${validation.coverage.departments} |
| 총 교수 수 | ${validation.coverage.professors} |
| 연구실 URL 있음 | ${validation.coverage.labUrlNonFallback} |
| 연구실 URL 없음/fallback | ${validation.coverage.labUrlFallback} |
| 연구원수 확인됨 | ${validation.coverage.memberCountKnown} |
| 연구원수 알 수 없음 | ${validation.coverage.memberCountUnknown} |
| DBLP URL 있음 | ${validation.coverage.dblpUrlPresent} |
| DBLP URL 없음 | ${validation.coverage.professors - validation.coverage.dblpUrlPresent} |
| Scholar URL 있음 | ${validation.coverage.scholarUrlPresent} |
| Scholar URL 없음 | ${validation.coverage.professors - validation.coverage.scholarUrlPresent} |
| 카테고리 분류됨 | ${validation.coverage.taxonomyClassified} |
| 카테고리 미분류 | ${validation.coverage.taxonomyUnclassified} |

## Issues

| severity | code | count | message |
|---|---|---:|---|
${issueRows || "|  |  | 0 | No issues |"}

## Counts By Graduate School

${Object.entries(validation.counts.byGraduateSchool).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Fallback URL Usage

| school | professor | URL | warning |
|---|---|---|---|
${fallbackRows || "|  |  |  |  |"}

## Sample Verification

| school | professor | status | checked URL | evidence |
|---|---|---|---|---|
${verificationRows || "|  |  |  |  |  |"}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    console.log("Usage: pnpm tsx scripts/validate-khu-grad.ts [--report=reports/khu-grad-discovery.json]");
    return;
  }

  const reportPath = String(args.get("report") ?? "reports/khu-grad-discovery.json");
  const report = JSON.parse(await readFile(reportPath, "utf8")) as KhuDiscoveryReport;
  const validation = validate(report, reportPath);
  await mkdir("reports", { recursive: true });
  await writeFile("reports/khu-grad-validation.json", `${JSON.stringify(validation, null, 2)}\n`, "utf8");
  await writeFile("reports/khu-grad-validation.md", renderMarkdown(validation), "utf8");
  console.log(JSON.stringify({ jsonPath: "reports/khu-grad-validation.json", mdPath: "reports/khu-grad-validation.md", status: validation.status, coverage: validation.coverage }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
