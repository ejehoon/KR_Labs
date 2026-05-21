import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

type ResearchClassification = {
  matches?: Array<{ labelKo: string; fieldId?: string; evidence?: string[] }>;
  suggestions?: Array<{ suggestedLabel: string; evidence?: string[] }>;
};

type CauLabCandidate = {
  departmentName: string;
  professorName?: string;
  professorTitle?: string;
  email?: string;
  labName?: string;
  labUrl?: string;
  profileUrl?: string;
  researchText?: string;
  sourceUrl: string;
  sourceParser: string;
  classification?: ResearchClassification;
  currentMemberCount?: number;
  memberCountSourceUrl?: string;
  scholarUrl?: string;
  dblpUrl?: string;
  paperCount?: number;
  validationWarnings?: string[];
};

type CauDiscoveryReport = {
  generatedAt: string;
  departments: Array<{ name: string; homepageUrl?: string; facultyUrl?: string }>;
  facultyCandidates: CauLabCandidate[];
  summary?: Record<string, unknown>;
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
  console.log(`Usage: pnpm validate:cau-grad [--report=reports/cau-grad-discovery.json]

Validates the local CAU graduate discovery JSON for lab URL fallbacks, member-count source quality,
taxonomy gaps, direct Scholar/DBLP evidence, and duplicate professor/lab rows.
`);
}

function sample(rows: CauLabCandidate[], limit = 20) {
  return rows.slice(0, limit).map((row) => ({
    department: row.departmentName,
    professor: row.professorName,
    lab: row.labName,
    labUrl: row.labUrl,
    memberCount: row.currentMemberCount,
    memberCountSourceUrl: row.memberCountSourceUrl,
    scholarUrl: row.scholarUrl,
    dblpUrl: row.dblpUrl,
    taxonomy: row.classification?.matches?.map((match) => match.labelKo) ?? [],
    warnings: row.validationWarnings,
  }));
}

function buildIssue(
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
  rows: CauLabCandidate[],
  limit = 20,
): ValidationIssue | undefined {
  if (rows.length === 0) {
    return undefined;
  }
  return { severity, code, message, count: rows.length, samples: sample(rows, limit) };
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

function duplicateRows(rows: CauLabCandidate[], getKey: (row: CauLabCandidate) => string | undefined) {
  const buckets = new Map<string, CauLabCandidate[]>();
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

function validate(report: CauDiscoveryReport, sourcePath: string) {
  const candidates = report.facultyCandidates;
  const missingProfessor = candidates.filter((row) => !row.professorName);
  const missingLabName = candidates.filter((row) => !row.labName);
  const missingLabUrl = candidates.filter((row) => !row.labUrl);
  const fallbackUrl = candidates.filter((row) => row.validationWarnings?.includes("연구실 홈페이지 없음, fallback 사용"));
  const unknownMemberCount = candidates.filter((row) => typeof row.currentMemberCount !== "number");
  const suspiciousMemberSource = candidates.filter((row) => hasSuspiciousMemberCountSource(row.memberCountSourceUrl));
  const noTaxonomy = candidates.filter((row) => (row.classification?.matches ?? []).length === 0);
  const noScholar = candidates.filter((row) => !row.scholarUrl);
  const noDblp = candidates.filter((row) => !row.dblpUrl);
  const noPublicationCount = candidates.filter((row) => typeof row.paperCount !== "number");
  const warnings = candidates.filter((row) => (row.validationWarnings ?? []).length > 0);

  const taxonomyCounts: Record<string, number> = {};
  const warningCounts: Record<string, number> = {};
  for (const candidate of candidates) {
    for (const match of candidate.classification?.matches ?? []) {
      taxonomyCounts[match.labelKo] = (taxonomyCounts[match.labelKo] ?? 0) + 1;
    }
    for (const warning of candidate.validationWarnings ?? []) {
      warningCounts[warning] = (warningCounts[warning] ?? 0) + 1;
    }
  }

  const issues = [
    buildIssue("warning", "missing_professor", "교수명을 매칭하지 못한 연구실입니다.", missingProfessor),
    buildIssue("warning", "missing_lab_name", "연구실명이 비어 있습니다.", missingLabName),
    buildIssue("warning", "missing_lab_url", "lab_url이 없습니다.", missingLabUrl),
    buildIssue("info", "fallback_url_used", "연구실 홈페이지가 없어 학과/교수 페이지 fallback URL을 사용했습니다.", fallbackUrl),
    buildIssue("info", "member_count_unknown", "외부 연구실의 현재 구성원 페이지에서 연구원 수를 확인하지 못했습니다.", unknownMemberCount),
    buildIssue("warning", "suspicious_member_count_source", "연구원 수 출처가 교수/학과/논문/Alumni 계열로 보여 수동 검토가 필요합니다.", suspiciousMemberSource),
    buildIssue("info", "dblp_missing", "직접 노출된 DBLP URL이 없습니다. 이름 검색으로 보강하지 않았습니다.", noDblp),
    buildIssue("info", "scholar_missing", "직접 노출된 Scholar URL이 없습니다. 이름 검색으로 보강하지 않았습니다.", noScholar),
    buildIssue("info", "paper_count_missing", "논문 수를 신뢰 가능한 직접 출처에서 확인하지 못했습니다.", noPublicationCount),
    buildIssue("info", "no_taxonomy_match", "기존 KR_Labs taxonomy에 확정 매칭되지 않았습니다.", noTaxonomy),
    buildIssue("info", "candidate_warnings", "adapter/enrichment 경고가 있는 후보입니다.", warnings),
  ].filter((issue): issue is ValidationIssue => Boolean(issue));

  return {
    sourcePath,
    generatedAt: new Date().toISOString(),
    reportGeneratedAt: report.generatedAt,
    status: issues.some((issue) => issue.severity === "error") ? "failed" : issues.some((issue) => issue.severity === "warning") ? "needs_review" : "success",
    coverage: {
      departments: report.departments.length,
      facultyCandidates: candidates.length,
      withProfessor: candidates.length - missingProfessor.length,
      withLabUrl: candidates.length - missingLabUrl.length,
      fallbackUrl: fallbackUrl.length,
      withMemberCount: candidates.length - unknownMemberCount.length,
      memberCountUnknown: unknownMemberCount.length,
      withDblpUrl: candidates.length - noDblp.length,
      withScholarUrl: candidates.length - noScholar.length,
      withTaxonomyMatch: candidates.length - noTaxonomy.length,
      categoryUnclassified: noTaxonomy.length,
    },
    counts: {
      byDepartment: countBy(candidates, (row) => row.departmentName),
      byParser: countBy(candidates, (row) => row.sourceParser),
      byTaxonomy: Object.fromEntries(Object.entries(taxonomyCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
      byWarning: Object.fromEntries(Object.entries(warningCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    },
    duplicates: {
      professorByDepartment: duplicateRows(candidates, (row) => `${row.departmentName}|${row.professorName ?? ""}`),
      labUrl: duplicateRows(candidates, (row) => row.labUrl),
    },
    fallbackUrlRows: sample(fallbackUrl, 100),
    suspiciousRows: sample([...new Set([...missingProfessor, ...suspiciousMemberSource, ...noTaxonomy])], 100),
    manualReviewRows: sample([...new Set([...fallbackUrl, ...unknownMemberCount, ...warnings])], 120),
    taxonomyGapSuggestions: buildTaxonomyGapSuggestions(noTaxonomy),
    issues,
  };
}

function hasSuspiciousMemberCountSource(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  return /professor|faculty|교수|publication|papers?|research|alumni|former|past|졸업|graduate|news|notice|login|contact/i.test(url);
}

function buildTaxonomyGapSuggestions(rows: CauLabCandidate[]) {
  const suggestions = new Map<string, { suggestedLabel: string; reason: string; samples: string[] }>();
  for (const row of rows) {
    const text = `${row.labName ?? ""} ${row.researchText ?? ""}`;
    const suggestion = row.classification?.suggestions?.[0]?.suggestedLabel;
    if (!suggestion) {
      continue;
    }
    const current = suggestions.get(suggestion) ?? {
      suggestedLabel: suggestion,
      reason: "기존 taxonomy 별칭과 직접 매칭되지 않았으나 연구실 연구분야 텍스트에서 반복적으로 등장합니다.",
      samples: [],
    };
    current.samples = [...new Set([...current.samples, text.slice(0, 180)])].slice(0, 5);
    suggestions.set(suggestion, current);
  }
  return [...suggestions.values()];
}

function renderMarkdown(validation: ReturnType<typeof validate>) {
  const coverageRows = Object.entries(validation.coverage).map(([key, value]) => `| ${key} | ${value} |`).join("\n");
  const issueRows = validation.issues.map((issue) => `| ${issue.severity} | ${issue.code} | ${issue.count} | ${issue.message} |`).join("\n");
  const departmentRows = Object.entries(validation.counts.byDepartment).map(([key, value]) => `- ${key}: ${value}`).join("\n");
  const taxonomyRows = Object.entries(validation.counts.byTaxonomy).map(([key, value]) => `- ${key}: ${value}`).join("\n");
  const fallbackRows = validation.fallbackUrlRows.map((row) => `- ${row.department} / ${row.professor} / ${row.lab}: ${row.labUrl}`).join("\n");

  return `# CAU Graduate Discovery Validation

- Source: ${validation.sourcePath}
- Status: ${validation.status}
- Generated At: ${validation.generatedAt}

## Coverage

| metric | value |
|---|---:|
${coverageRows}

## Departments

${departmentRows || "- None"}

## Taxonomy

${taxonomyRows || "- None"}

## Fallback URLs

${fallbackRows || "- None"}

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

  const reportPath = String(args.get("report") ?? "reports/cau-grad-discovery.json");
  const report = JSON.parse(await readFile(reportPath, "utf8")) as CauDiscoveryReport;
  const validation = validate(report, reportPath);
  await mkdir("reports", { recursive: true });
  const outputBase = basename(reportPath).replace(/\.json$/i, "");
  const jsonPath = join("reports", `${outputBase}-validation.json`);
  const mdPath = join("reports", `${outputBase}-validation.md`);
  await writeFile(jsonPath, `${JSON.stringify(validation, null, 2)}\n`, "utf8");
  await writeFile(mdPath, renderMarkdown(validation), "utf8");

  console.log(JSON.stringify({ jsonPath, mdPath, status: validation.status, coverage: validation.coverage, issues: validation.issues.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
