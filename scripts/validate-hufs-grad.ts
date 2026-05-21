import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";

type ResearchClassification = {
  matches?: Array<{ fieldId?: string; labelKo: string; evidence?: string[] }>;
  suggestions?: Array<{ suggestedLabel: string; evidence?: string[] }>;
};

type HufsDepartment = {
  collegeName: string;
  name: string;
  homepageUrl?: string;
  facultyListUrl?: string;
  facultyCount?: number;
  discoveryWarnings?: string[];
};

type HufsFacultyCandidate = {
  departmentName: string;
  collegeName: string;
  nameKo?: string;
  nameEn?: string;
  email?: string;
  homepageUrl?: string;
  profileUrl?: string;
  labUrl?: string;
  labUrlType?: "external_lab_or_homepage" | "profile_fallback" | "faculty_page_fallback";
  fallbackReason?: string;
  researchText?: string;
  publicationCount?: number;
  publicationCountSourceUrl?: string;
  scholarUrl?: string;
  dblpUrl?: string;
  currentMemberCount?: number;
  memberCountSourceUrl?: string;
  sourceUrl: string;
  classification?: ResearchClassification;
  warnings?: string[];
};

type HufsDiscoveryReport = {
  sourceUrl: string;
  generatedAt: string;
  departments: HufsDepartment[];
  facultyCandidates: HufsFacultyCandidate[];
  failedPages?: Array<{ url: string; stage: string; message: string }>;
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
  console.log(`Usage: pnpm validate:hufs-grad [--report=reports/hufs-grad-discovery.json] [--sample-size=12]

Validates the local HUFS graduate discovery JSON for coverage, fallbacks,
member-count evidence, publication/DBLP/Scholar links, taxonomy coverage,
and revisits a sample of professor/lab URLs with Playwright.
`);
}

function hasNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sample(rows: HufsFacultyCandidate[], limit = 20) {
  return rows.slice(0, limit).map((row) => ({
    department: row.departmentName,
    name: row.nameKo ?? row.nameEn,
    researchText: row.researchText,
    labUrl: row.labUrl,
    labUrlType: row.labUrlType,
    memberCount: row.currentMemberCount,
    memberCountSourceUrl: row.memberCountSourceUrl,
    scholarUrl: row.scholarUrl,
    dblpUrl: row.dblpUrl,
    publicationCount: row.publicationCount,
    taxonomy: row.classification?.matches?.map((match) => match.labelKo) ?? [],
    warnings: row.warnings,
  }));
}

function buildIssue(
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
  rows: HufsFacultyCandidate[],
  limit = 20,
): ValidationIssue | undefined {
  if (rows.length === 0) {
    return undefined;
  }
  return { severity, code, message, count: rows.length, samples: sample(rows, limit) };
}

function duplicateRows(rows: HufsFacultyCandidate[], getKey: (row: HufsFacultyCandidate) => string | undefined) {
  const buckets = new Map<string, HufsFacultyCandidate[]>();
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

function countBy<T>(items: T[], getKey: (item: T) => string | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = getKey(item);
    if (key) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function hasSuspiciousMemberSource(row: HufsFacultyCandidate): boolean {
  if (!hasNumber(row.currentMemberCount)) {
    return false;
  }
  const source = row.memberCountSourceUrl ?? "";
  return /(?:profl|professor|faculty|교수진|전임교원|artclView\.do|subview\.do)$/i.test(source);
}

function validateStatic(report: HufsDiscoveryReport, sourcePath: string) {
  const candidates = report.facultyCandidates;
  const noFacultyListDepartments = report.departments.filter((department) => !department.facultyListUrl);
  const missingResearch = candidates.filter((row) => !row.researchText);
  const missingLabUrl = candidates.filter((row) => !row.labUrl);
  const fallbackRows = candidates.filter((row) => row.labUrlType !== "external_lab_or_homepage");
  const noTaxonomy = candidates.filter((row) => (row.classification?.matches ?? []).length === 0);
  const memberKnown = candidates.filter((row) => hasNumber(row.currentMemberCount));
  const suspiciousMemberSource = candidates.filter(hasSuspiciousMemberSource);
  const withDblpUrl = candidates.filter((row) => row.dblpUrl);
  const withScholarUrl = candidates.filter((row) => row.scholarUrl);
  const withPublicationCount = candidates.filter((row) => hasNumber(row.publicationCount));
  const taxonomyCounts: Record<string, number> = {};

  for (const candidate of candidates) {
    for (const match of candidate.classification?.matches ?? []) {
      taxonomyCounts[match.labelKo] = (taxonomyCounts[match.labelKo] ?? 0) + 1;
    }
  }

  const issues = [
    noFacultyListDepartments.length > 0
      ? {
          severity: "warning" as const,
          code: "department_faculty_list_missing",
          message: "교수진 URL을 찾지 못한 학과가 있습니다.",
          count: noFacultyListDepartments.length,
          samples: noFacultyListDepartments.slice(0, 20).map((department) => ({
            college: department.collegeName,
            department: department.name,
            homepageUrl: department.homepageUrl,
            warnings: department.discoveryWarnings,
          })),
        }
      : undefined,
    buildIssue("warning", "missing_research_text", "교수/연구실 후보에 연구분야 텍스트가 없습니다.", missingResearch),
    buildIssue("warning", "missing_lab_url", "교수/연구실 후보에 연결 URL이 없습니다.", missingLabUrl),
    buildIssue("warning", "fallback_lab_url", "연구실 홈페이지를 확인하지 못해 fallback URL을 사용했습니다.", fallbackRows),
    buildIssue("warning", "suspicious_member_source", "연구원 수 출처가 교수/학과 페이지로 보입니다.", suspiciousMemberSource),
    buildIssue("info", "no_taxonomy_match", "중앙 taxonomy에 확정 매칭되지 않은 후보입니다.", noTaxonomy),
  ].filter((issue): issue is ValidationIssue => Boolean(issue));

  return {
    sourcePath,
    generatedAt: new Date().toISOString(),
    reportGeneratedAt: report.generatedAt,
    status: issues.some((issue) => issue.severity === "error") ? "failed" : issues.some((issue) => issue.severity === "warning") ? "needs_review" : "success",
    coverage: {
      departments: report.departments.length,
      departmentsWithHomepage: report.departments.filter((row) => row.homepageUrl).length,
      departmentsWithFacultyList: report.departments.filter((row) => row.facultyListUrl).length,
      professors: candidates.length,
      labUrlPresent: candidates.length - missingLabUrl.length,
      externalLabUrl: candidates.filter((row) => row.labUrlType === "external_lab_or_homepage").length,
      fallbackLabUrl: fallbackRows.length,
      memberCountKnown: memberKnown.length,
      memberCountUnknown: candidates.length - memberKnown.length,
      dblpUrlPresent: withDblpUrl.length,
      dblpUrlMissing: candidates.length - withDblpUrl.length,
      scholarUrlPresent: withScholarUrl.length,
      scholarUrlMissing: candidates.length - withScholarUrl.length,
      publicationCountKnown: withPublicationCount.length,
      taxonomyClassified: candidates.length - noTaxonomy.length,
      taxonomyUnclassified: noTaxonomy.length,
    },
    counts: {
      byCollege: countBy(report.departments, (row) => row.collegeName),
      byDepartment: countBy(candidates, (row) => row.departmentName),
      byTaxonomy: Object.fromEntries(Object.entries(taxonomyCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    },
    duplicates: {
      departmentName: duplicateRows(candidates, (row) => `${row.departmentName}|${row.nameKo ?? row.nameEn ?? ""}`),
      labUrl: duplicateRows(candidates, (row) => row.labUrl),
      email: duplicateRows(candidates, (row) => row.email),
    },
    fallbackRows: sample(fallbackRows, 50),
    suspiciousRows: sample([...missingResearch, ...suspiciousMemberSource, ...noTaxonomy], 50),
    manualReviewRows: sample(candidates.filter((row) => (row.warnings ?? []).length > 0 || (row.classification?.matches ?? []).length === 0), 80),
    issues,
    failedPages: report.failedPages ?? [],
  };
}

async function revisitSample(report: HufsDiscoveryReport, sampleSize: number) {
  const browser = await createBrowserManager();
  const rows = [
    ...report.facultyCandidates.filter((row) => row.labUrlType === "external_lab_or_homepage").slice(0, Math.ceil(sampleSize / 2)),
    ...report.facultyCandidates.filter((row) => row.labUrlType !== "external_lab_or_homepage").slice(0, sampleSize),
  ].slice(0, sampleSize);

  try {
    const sampleChecks = [];
    for (const row of rows) {
      const page = await browser.context.newPage();
      try {
        const targetUrl = row.labUrl ?? row.profileUrl ?? row.sourceUrl;
        const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
        const title = await page.title();
        const text = (await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "")).replace(/\s+/g, " ").trim();
        sampleChecks.push({
          department: row.departmentName,
          name: row.nameKo ?? row.nameEn,
          targetUrl,
          httpStatus: response?.status(),
          finalUrl: page.url(),
          title,
          hasProfessorName: row.nameKo ? text.includes(row.nameKo) : undefined,
          labUrlType: row.labUrlType,
          memberCountSourceUrl: row.memberCountSourceUrl,
          memberCountSourceLooksCurrent: row.memberCountSourceUrl
            ? (row.warnings ?? []).some((warning) => /Playwright 수동 검증/.test(warning))
              || !/(alumni|former|졸업|동문|past|profl|professor|faculty|교수진|전임교원)/i.test(row.memberCountSourceUrl)
            : undefined,
          taxonomy: row.classification?.matches?.map((match) => match.labelKo) ?? [],
          note: row.fallbackReason ?? "external/faculty homepage checked",
        });
      } catch (error) {
        sampleChecks.push({
          department: row.departmentName,
          name: row.nameKo ?? row.nameEn,
          targetUrl: row.labUrl ?? row.profileUrl ?? row.sourceUrl,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        await page.close();
      }
    }
    return sampleChecks;
  } finally {
    await browser.close();
  }
}

function renderMarkdown(validation: ReturnType<typeof validateStatic> & { sampleChecks: Awaited<ReturnType<typeof revisitSample>> }) {
  const coverageRows = Object.entries(validation.coverage)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join("\n");
  const issueRows = validation.issues
    .map((issue) => `| ${issue.severity} | ${issue.code} | ${issue.count} | ${issue.message} |`)
    .join("\n");
  const sampleRows = validation.sampleChecks
    .map((row) => `| ${row.department ?? ""} | ${row.name ?? ""} | ${row.httpStatus ?? row.error ?? ""} | ${row.labUrlType ?? ""} | ${row.targetUrl ?? ""} | ${row.note ?? ""} |`)
    .join("\n");

  return `# HUFS Graduate Discovery Validation

- Source: ${validation.sourcePath}
- Status: ${validation.status}
- Generated At: ${validation.generatedAt}
- Discovery Generated At: ${validation.reportGeneratedAt}

## Coverage

| metric | value |
|---|---:|
${coverageRows}

## Issues

| severity | code | count | message |
|---|---|---:|---|
${issueRows || "|  |  | 0 | None |"}

## Fallback URL 사용 목록

${validation.fallbackRows.map((row) => `- ${row.department} / ${row.name}: ${row.labUrl} (${row.warnings?.join("; ") ?? ""})`).join("\n") || "- None"}

## 의심 데이터 / 수동 검토 필요

${validation.manualReviewRows.map((row) => `- ${row.department} / ${row.name}: ${(row.warnings as string[] | undefined)?.join("; ") || "taxonomy or source review"}`).join("\n") || "- None"}

## Playwright Sample Revisit

| department | professor | status | labUrlType | url | note |
|---|---|---:|---|---|---|
${sampleRows || "|  |  |  |  |  |  |"}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const reportPath = String(args.get("report") ?? "reports/hufs-grad-discovery.json");
  const sampleSize = Number(args.get("sample-size") ?? 12);
  const report = JSON.parse(await readFile(reportPath, "utf8")) as HufsDiscoveryReport;
  const staticValidation = validateStatic(report, reportPath);
  const sampleChecks = await revisitSample(report, sampleSize);
  const validation = { ...staticValidation, sampleChecks };

  await mkdir("reports", { recursive: true });
  const baseName = basename(reportPath, ".json");
  const jsonPath = join("reports", `${baseName}-validation.json`);
  const mdPath = join("reports", `${baseName}-validation.md`);
  await writeFile(jsonPath, `${JSON.stringify(validation, null, 2)}\n`, "utf8");
  await writeFile(mdPath, renderMarkdown(validation), "utf8");

  console.log(
    JSON.stringify(
      {
        jsonPath,
        mdPath,
        status: validation.status,
        coverage: validation.coverage,
        issueCounts: validation.issues.map((issue) => ({ code: issue.code, count: issue.count })),
        sampleChecks: validation.sampleChecks,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
