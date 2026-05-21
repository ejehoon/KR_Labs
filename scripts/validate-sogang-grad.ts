import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

type ResearchClassification = {
  matches?: Array<{ fieldId?: string; labelKo: string; evidence?: string[] }>;
  suggestions?: Array<{ suggestedLabel: string; evidence?: string[] }>;
};

type SogangProgram = {
  series: string;
  name: string;
  homepageUrl?: string;
};

type SogangFacultyCandidate = {
  sourceProgramName: string;
  affiliation?: string;
  nameKo?: string;
  labName?: string;
  researchText?: string;
  labUrl?: string;
  sourceUrl?: string;
  sourceParser?: string;
  classification?: ResearchClassification;
  currentMemberCount?: number;
  memberCount?: number;
  memberCountBreakdown?: Record<string, number>;
  memberCountSourceUrl?: string;
  paperCount?: number;
  dblpUrl?: string;
  scholarUrl?: string;
};

type SogangDiscoveryReport = {
  generatedAt: string;
  programs: SogangProgram[];
  facultyCandidates: SogangFacultyCandidate[];
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
  console.log(`Usage: pnpm validate:sogang-grad [--report=reports/sogang-grad-discovery.json]

Validates the local Sogang graduate discovery JSON for data quality, taxonomy noise,
and missing enrichment fields such as member counts and publication counts.
`);
}

function hasNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sample(rows: SogangFacultyCandidate[], limit = 20) {
  return rows.slice(0, limit).map((row) => ({
    program: row.sourceProgramName,
    name: row.nameKo,
    labName: row.labName,
    researchText: row.researchText,
    labUrl: row.labUrl,
    currentMemberCount: row.currentMemberCount ?? row.memberCount,
    memberCountSourceUrl: row.memberCountSourceUrl,
    parser: row.sourceParser,
    taxonomy: row.classification?.matches?.map((match) => match.labelKo) ?? [],
  }));
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

function duplicateRows(rows: SogangFacultyCandidate[], getKey: (row: SogangFacultyCandidate) => string | undefined) {
  const buckets = new Map<string, SogangFacultyCandidate[]>();
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

function buildIssue(
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
  rows: SogangFacultyCandidate[],
  limit = 20,
): ValidationIssue | undefined {
  if (rows.length === 0) {
    return undefined;
  }
  return { severity, code, message, count: rows.length, samples: sample(rows, limit) };
}

function validate(report: SogangDiscoveryReport, sourcePath: string) {
  const candidates = report.facultyCandidates;
  const programNames = new Set(report.programs.map((program) => program.name));
  const candidatesByProgram = countBy(candidates, (row) => row.sourceProgramName);
  const parserCounts = countBy(candidates, (row) => row.sourceParser ?? "unknown");
  const taxonomyCounts: Record<string, number> = {};

  for (const candidate of candidates) {
    for (const match of candidate.classification?.matches ?? []) {
      taxonomyCounts[match.labelKo] = (taxonomyCounts[match.labelKo] ?? 0) + 1;
    }
  }

  const missingResearch = candidates.filter((row) => !row.researchText);
  const suspiciousResearch = candidates.filter((row) => hasSuspiciousResearchText(row.researchText));
  const missingLabUrl = candidates.filter((row) => !row.labUrl);
  const suspiciousLabUrl = candidates.filter((row) => isSuspiciousLabUrl(row.labUrl));
  const unknownProgram = candidates.filter((row) => !programNames.has(row.sourceProgramName));
  const noTaxonomy = candidates.filter((row) => (row.classification?.matches ?? []).length === 0);
  const withMemberCount = candidates.filter((row) => hasNumber(row.currentMemberCount) || hasNumber(row.memberCount));
  const withPaperCount = candidates.filter((row) => hasNumber(row.paperCount));
  const withDblpUrl = candidates.filter((row) => row.dblpUrl);
  const withScholarUrl = candidates.filter((row) => row.scholarUrl);
  const suspiciousMemberSource = candidates.filter(hasSuspiciousMemberCountSource);
  const bareLinguisticsAsNlp = candidates.filter((row) =>
    row.researchText === "언어학" && (row.classification?.matches ?? []).some((match) => match.labelKo === "자연어처리"),
  );

  const issues = [
    buildIssue("warning", "missing_research_text", "교수/연구실 후보에 연구분야 텍스트가 없습니다.", missingResearch),
    buildIssue("warning", "suspicious_research_text", "연구분야에 학력/연락처/프로필 텍스트로 보이는 내용이 남아 있습니다.", suspiciousResearch),
    buildIssue("warning", "missing_lab_url", "교수/연구실 후보에 연결 URL이 없습니다.", missingLabUrl),
    buildIssue("error", "suspicious_lab_url", "연구실 URL이 서강대 대표 홈페이지/홈으로 잘못 들어가 있습니다.", suspiciousLabUrl),
    buildIssue("warning", "suspicious_member_source", "연구원 수 출처가 교수/학과 목록 페이지로 보입니다.", suspiciousMemberSource),
    buildIssue("error", "unknown_program", "후보의 sourceProgramName이 학과 목록에 존재하지 않습니다.", unknownProgram),
    buildIssue("error", "bare_linguistics_as_nlp", "일반 언어학이 자연어처리로 과매칭되었습니다.", bareLinguisticsAsNlp),
    buildIssue("info", "no_taxonomy_match", "중앙 taxonomy에 확정 매칭되지 않은 후보입니다.", noTaxonomy),
  ].filter((issue): issue is ValidationIssue => Boolean(issue));

  const duplicateProgramName = duplicateRows(candidates, (row) => `${row.sourceProgramName}|${row.nameKo ?? ""}`);
  const duplicateLabUrl = duplicateRows(candidates, (row) => row.labUrl);

  return {
    sourcePath,
    generatedAt: new Date().toISOString(),
    reportGeneratedAt: report.generatedAt,
    status: issues.some((issue) => issue.severity === "error") ? "failed" : issues.some((issue) => issue.severity === "warning") ? "needs_review" : "success",
    coverage: {
      programs: report.programs.length,
      facultyCandidates: candidates.length,
      withResearchText: candidates.length - missingResearch.length,
      withLabUrl: candidates.length - missingLabUrl.length,
      withMemberCount: withMemberCount.length,
      withPaperCount: withPaperCount.length,
      withDblpUrl: withDblpUrl.length,
      withScholarUrl: withScholarUrl.length,
      withTaxonomyMatch: candidates.length - noTaxonomy.length,
    },
    enrichmentGaps: {
      memberCountMissing: candidates.length - withMemberCount.length,
      paperCountMissing: candidates.length - withPaperCount.length,
      dblpUrlMissing: candidates.length - withDblpUrl.length,
      scholarUrlMissing: candidates.length - withScholarUrl.length,
    },
    counts: {
      byParser: parserCounts,
      byProgram: candidatesByProgram,
      byTaxonomy: Object.fromEntries(Object.entries(taxonomyCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    },
    duplicates: {
      programName: duplicateProgramName,
      labUrl: duplicateLabUrl,
    },
    issues,
  };
}

function isSuspiciousLabUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/g, "") || "/";
    return host === "sogang.ac.kr" && ["/", "/index.do", "/ko/home"].includes(path.toLowerCase());
  } catch {
    return false;
  }
}

function hasSuspiciousResearchText(text: string | undefined): boolean {
  if (!text) {
    return false;
  }
  return /(\bPh\.?\s*D\b|\bE-mail\b|\bEmail\b|\bTEL\b|연구실\s*:|졸업|\bPostDoc\b|\bUniversity\b|대학교|공학박사|문학석사|(?:공학|이학|법학|경영학)?(?:박사|석사)(?:[)\s,.;:/]|$)|(?:^|[\s,;(/])학사(?:[)\s,.;:/]|$))/i.test(text);
}

function hasSuspiciousMemberCountSource(row: SogangFacultyCandidate): boolean {
  if (!hasNumber(row.currentMemberCount) && !hasNumber(row.memberCount)) {
    return false;
  }
  const source = row.memberCountSourceUrl ?? "";
  return /#role-member-pages$/i.test(source)
    || /(?:cs|scc)\.sogang\.ac\.kr\/cs\/cs04_3(?:\.html)?$/i.test(source)
    || /cs\.sogang\.ac\.kr\/cs\/cs02_1(?:\.html)?$/i.test(source)
    || /ai\.sogang\.ac\.kr\/ai\/ai06_1(?:\.html)?$/i.test(source)
    || /(?:korea|scc)\.sogang\.ac\.kr\/korea\/korea01_5(?:_\d+)?\.html/i.test(source)
    || /philosophy\.sogang\.ac\.kr\/philosophy\/philosophy01_5(?:_\d+)?\.html/i.test(source)
    || /sogang\.ac\.kr\/ko\/home/i.test(source)
    || /(?:professor|faculty|교수진|전임교원|employee\/professor)/i.test(source);
}

function renderMarkdown(validation: ReturnType<typeof validate>) {
  const coverageRows = Object.entries(validation.coverage)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join("\n");
  const enrichmentRows = Object.entries(validation.enrichmentGaps)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join("\n");
  const issueRows = validation.issues
    .map((issue) => `| ${issue.severity} | ${issue.code} | ${issue.count} | ${issue.message} |`)
    .join("\n");

  return `# Sogang Graduate Discovery Validation

- Source: ${validation.sourcePath}
- Status: ${validation.status}
- Generated At: ${validation.generatedAt}

## Coverage

| metric | value |
|---|---:|
${coverageRows}

## Enrichment Gaps

| metric | missing |
|---|---:|
${enrichmentRows}

## Issues

| severity | code | count | message |
|---|---|---:|---|
${issueRows || "|  |  | 0 | No issues |"}

## Parser Counts

${Object.entries(validation.counts.byParser).map(([key, value]) => `- ${key}: ${value}`).join("\n")}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const reportPath = String(args.get("report") ?? "reports/sogang-grad-discovery.json");
  const report = JSON.parse(await readFile(reportPath, "utf8")) as SogangDiscoveryReport;
  const validation = validate(report, reportPath);

  await mkdir("reports", { recursive: true });
  const outputBase = basename(reportPath).replace(/\.json$/i, "");
  const jsonPath = join("reports", `${outputBase}-validation.json`);
  const mdPath = join("reports", `${outputBase}-validation.md`);
  await writeFile(jsonPath, `${JSON.stringify(validation, null, 2)}\n`, "utf8");
  await writeFile(mdPath, renderMarkdown(validation), "utf8");

  console.log(JSON.stringify({ jsonPath, mdPath, status: validation.status, coverage: validation.coverage, enrichmentGaps: validation.enrichmentGaps }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
