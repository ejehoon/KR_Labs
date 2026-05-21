import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";

type ResearchClassification = {
  matches?: Array<{ fieldId?: string; labelKo: string; evidence?: string[] }>;
};

type HufsFacultyCandidate = {
  departmentName: string;
  collegeName: string;
  nameKo?: string;
  nameEn?: string;
  email?: string;
  profileUrl?: string;
  labUrl?: string;
  labUrlType?: "external_lab_or_homepage" | "profile_fallback" | "faculty_page_fallback";
  fallbackReason?: string;
  researchText?: string;
  publicationCount?: number;
  scholarUrl?: string;
  dblpUrl?: string;
  currentMemberCount?: number;
  memberCountSourceUrl?: string;
  sourceUrl: string;
  classification?: ResearchClassification;
  warnings?: string[];
};

type HufsDepartment = {
  collegeName: string;
  name: string;
  homepageUrl?: string;
  facultyListUrl?: string;
  facultyCount?: number;
  discoveryWarnings?: string[];
};

type HufsDiscoveryReport = {
  sourceUrl: string;
  generatedAt: string;
  departments: HufsDepartment[];
  facultyCandidates: HufsFacultyCandidate[];
  failedPages?: Array<{ url: string; stage: string; message: string }>;
};

type PageCheck = {
  department: string;
  professor: string;
  url: string;
  purpose: "external_lab" | "member_source";
  status?: number;
  finalUrl?: string;
  title?: string;
  hasProfessorName?: boolean;
  hasMemberTerms?: boolean;
  hasAlumniTerms?: boolean;
  currentMemberCount?: number;
  textSample?: string;
  error?: string;
};

type SupabaseTableCheck = {
  table: string;
  status: "available" | "missing_or_incompatible" | "not_configured";
  httpStatus?: number;
  details: string;
};

function professorName(row: HufsFacultyCandidate) {
  return row.nameKo ?? row.nameEn ?? "(unknown)";
}

function normalizeUrl(url: string | undefined) {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function bucketDuplicates<T>(rows: T[], getKey: (row: T) => string | undefined) {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const key = getKey(row);
    if (!key) {
      continue;
    }
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }
  return [...buckets.entries()]
    .filter(([, bucket]) => bucket.length > 1)
    .map(([key, bucket]) => ({ key, count: bucket.length, rows: bucket }));
}

function summarizeCandidate(row: HufsFacultyCandidate) {
  return {
    department: row.departmentName,
    college: row.collegeName,
    professor: professorName(row),
    email: row.email,
    profileUrl: row.profileUrl,
    labUrl: row.labUrl,
    labUrlType: row.labUrlType,
    memberCount: row.currentMemberCount ?? null,
    memberCountSourceUrl: row.memberCountSourceUrl,
    taxonomy: row.classification?.matches?.map((match) => match.labelKo) ?? [],
    warnings: row.warnings ?? [],
  };
}

function auditDuplicates(report: HufsDiscoveryReport) {
  const candidates = report.facultyCandidates;
  const duplicateDepartmentNames = bucketDuplicates(
    candidates,
    (row) => `${row.departmentName}|${professorName(row)}`,
  ).map((bucket) => ({ ...bucket, rows: bucket.rows.map(summarizeCandidate) }));
  const duplicateEmails = bucketDuplicates(candidates, (row) => row.email?.toLowerCase()).map((bucket) => ({
    ...bucket,
    rows: bucket.rows.map(summarizeCandidate),
  }));
  const duplicateProfiles = bucketDuplicates(candidates, (row) => normalizeUrl(row.profileUrl)).map((bucket) => ({
    ...bucket,
    rows: bucket.rows.map(summarizeCandidate),
  }));
  const duplicateLabUrls = bucketDuplicates(candidates, (row) => normalizeUrl(row.labUrl)).map((bucket) => ({
    ...bucket,
    rows: bucket.rows.map(summarizeCandidate),
  }));

  return {
    duplicateDepartmentNames,
    duplicateEmails,
    duplicateProfiles,
    duplicateLabUrls,
    oversizedDepartments: report.departments
      .filter((department) => (department.facultyCount ?? 0) >= 50)
      .map((department) => ({
        college: department.collegeName,
        department: department.name,
        facultyCount: department.facultyCount,
        facultyListUrl: department.facultyListUrl,
      })),
  };
}

async function checkPage(row: HufsFacultyCandidate, url: string, purpose: PageCheck["purpose"]): Promise<PageCheck> {
  const browser = await createBrowserManager();
  const page = await browser.context.newPage();
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
    const bodyText = (await page.locator("body").innerText({ timeout: 6_000 }).catch(() => "")).replace(/\s+/g, " ").trim();
    const memberTerms = /(members?|people|students?|team|researchers?|구성원|연구원|학생|멤버|박사|석사|인턴|postdoc|visiting)/i;
    const alumniTerms = /(alumni|former|graduates?|past members?|졸업생|동문|OB|former member|alumnae)/i;
    return {
      department: row.departmentName,
      professor: professorName(row),
      url,
      purpose,
      status: response?.status(),
      finalUrl: page.url(),
      title: await page.title(),
      hasProfessorName: row.nameKo ? bodyText.includes(row.nameKo) : row.nameEn ? bodyText.toLowerCase().includes(row.nameEn.toLowerCase()) : undefined,
      hasMemberTerms: memberTerms.test(bodyText),
      hasAlumniTerms: alumniTerms.test(bodyText),
      currentMemberCount: row.currentMemberCount ?? undefined,
      textSample: bodyText.slice(0, 500),
    };
  } catch (error) {
    return {
      department: row.departmentName,
      professor: professorName(row),
      url,
      purpose,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await page.close().catch(() => undefined);
    await browser.close();
  }
}

async function checkExternalUrls(report: HufsDiscoveryReport) {
  const externalRows = report.facultyCandidates.filter((row) => row.labUrlType === "external_lab_or_homepage" && row.labUrl);
  const checks: PageCheck[] = [];
  for (const row of externalRows) {
    checks.push(await checkPage(row, row.labUrl as string, "external_lab"));
    if (row.memberCountSourceUrl && normalizeUrl(row.memberCountSourceUrl) !== normalizeUrl(row.labUrl)) {
      checks.push(await checkPage(row, row.memberCountSourceUrl, "member_source"));
    }
  }
  return checks;
}

async function probeSupabaseTable(table: string, select: string): Promise<SupabaseTableCheck> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) {
    return { table, status: "not_configured", details: "SUPABASE_URL 또는 key가 .env에 없습니다." };
  }

  try {
    const url = new URL(`/rest/v1/${table}`, supabaseUrl);
    url.searchParams.set("select", select);
    url.searchParams.set("limit", "1");
    const response = await fetch(url, {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        accept: "application/json",
      },
    });
    const text = await response.text();
    const body = text.slice(0, 300).replace(/\s+/g, " ");
    return {
      table,
      status: response.ok ? "available" : "missing_or_incompatible",
      httpStatus: response.status,
      details: response.ok ? "read probe succeeded" : body || response.statusText,
    };
  } catch (error) {
    return {
      table,
      status: "missing_or_incompatible",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkSupabaseCompatibility() {
  const probes = [
    probeSupabaseTable("universities", "id,name"),
    probeSupabaseTable(
      "professors",
      "id,name,department,paper_count,lab_member_count,lab_url,scholar_url,dblp_url,university_id,research_sub_fields",
    ),
    probeSupabaseTable("research_sub_fields", "id,name,field_id"),
    probeSupabaseTable("departments", "id,name,university_id"),
    probeSupabaseTable("labs", "id,name,professor_id,department_id"),
    probeSupabaseTable("crawl_jobs", "id,school_id,status"),
    probeSupabaseTable("publications", "id,lab_id,title"),
  ];
  const tableChecks = await Promise.all(probes);
  const crawlerSchemaReady = tableChecks
    .filter((check) => ["departments", "labs", "crawl_jobs", "publications"].includes(check.table))
    .every((check) => check.status === "available");
  const legacyProfessorSchemaReady = tableChecks
    .filter((check) => ["universities", "professors", "research_sub_fields"].includes(check.table))
    .every((check) => check.status === "available");

  return {
    configured: tableChecks.every((check) => check.status !== "not_configured"),
    tableChecks,
    crawlerSchemaReady,
    legacyProfessorSchemaReady,
    recommendation: crawlerSchemaReady
      ? "PRD crawler schema로 upsert 가능"
      : legacyProfessorSchemaReady
        ? "현재 DB는 legacy professor schema로 보입니다. HUFS 데이터를 넣으려면 별도 매핑 upsert가 필요합니다."
        : "필수 테이블이 부족합니다. Supabase 스키마를 먼저 정리해야 합니다.",
  };
}

function renderMarkdown(report: Awaited<ReturnType<typeof buildSupplementalReport>>) {
  const externalRows = report.externalUrlChecks
    .map(
      (check) =>
        `| ${check.purpose} | ${check.department} | ${check.professor} | ${check.status ?? check.error ?? ""} | ${check.hasProfessorName ?? ""} | ${check.hasMemberTerms ?? ""} | ${check.hasAlumniTerms ?? ""} | ${check.currentMemberCount ?? ""} | ${check.url} |`,
    )
    .join("\n");
  const tableRows = report.supabase.tableChecks
    .map((check) => `| ${check.table} | ${check.status} | ${check.httpStatus ?? ""} | ${check.details.replace(/\|/g, "/")} |`)
    .join("\n");
  const duplicateRows = report.duplicateAudit.duplicateDepartmentNames
    .map((bucket) => `- ${bucket.key}: ${bucket.count}건`)
    .join("\n");
  const externalUnknownRows = report.externalUnknownMemberCounts
    .map((row) => `- ${row.department} / ${row.professor}: ${row.labUrl}`)
    .join("\n");

  return `# HUFS Graduate Supplemental Validation

- Source: ${report.sourcePath}
- Generated At: ${report.generatedAt}
- Status: ${report.status}

## 추가 검증 요약

| metric | value |
|---|---:|
| externalLabUrls | ${report.summary.externalLabUrls} |
| externalUrlChecks | ${report.summary.externalUrlChecks} |
| externalUrlErrors | ${report.summary.externalUrlErrors} |
| memberSourceChecks | ${report.summary.memberSourceChecks} |
| externalUnknownMemberCounts | ${report.summary.externalUnknownMemberCounts} |
| duplicateDepartmentNames | ${report.summary.duplicateDepartmentNames} |
| duplicateEmails | ${report.summary.duplicateEmails} |
| duplicateProfiles | ${report.summary.duplicateProfiles} |
| oversizedDepartments | ${report.summary.oversizedDepartments} |

## Supabase 적재 가능성

- Recommendation: ${report.supabase.recommendation}
- Crawler schema ready: ${report.supabase.crawlerSchemaReady}
- Legacy professor schema ready: ${report.supabase.legacyProfessorSchemaReady}

| table | status | http | details |
|---|---|---:|---|
${tableRows}

## 외부 연구실 / 멤버 페이지 Playwright 재검증

| purpose | department | professor | status/error | name | memberTerms | alumniTerms | count | url |
|---|---|---|---|---|---|---|---:|---|
${externalRows || "|  |  |  |  |  |  |  |  |  |"}

## 연구원수 알 수 없음인 외부 URL

${externalUnknownRows || "- None"}

## 중복 이름 수동 검토

${duplicateRows || "- None"}

## 대형 학과 수동 검토

${report.duplicateAudit.oversizedDepartments
  .map((department) => `- ${department.department}: ${department.facultyCount}명 (${department.facultyListUrl})`)
  .join("\n") || "- None"}
`;
}

async function buildSupplementalReport(reportPath: string) {
  const report = JSON.parse(await readFile(reportPath, "utf8")) as HufsDiscoveryReport;
  const duplicateAudit = auditDuplicates(report);
  const externalUrlChecks = await checkExternalUrls(report);
  const supabase = await checkSupabaseCompatibility();
  const externalUnknownMemberCounts = report.facultyCandidates
    .filter((row) => row.labUrlType === "external_lab_or_homepage" && !row.currentMemberCount)
    .map(summarizeCandidate);

  const externalUrlErrors = externalUrlChecks.filter((check) => check.error || (check.status && check.status >= 400)).length;
  const status =
    externalUrlErrors > 0 || !supabase.legacyProfessorSchemaReady || duplicateAudit.oversizedDepartments.length > 0
      ? "needs_review"
      : "success";

  return {
    sourcePath: reportPath,
    generatedAt: new Date().toISOString(),
    discoveryGeneratedAt: report.generatedAt,
    status,
    summary: {
      externalLabUrls: report.facultyCandidates.filter((row) => row.labUrlType === "external_lab_or_homepage").length,
      externalUrlChecks: externalUrlChecks.length,
      externalUrlErrors,
      memberSourceChecks: externalUrlChecks.filter((check) => check.purpose === "member_source").length,
      externalUnknownMemberCounts: externalUnknownMemberCounts.length,
      duplicateDepartmentNames: duplicateAudit.duplicateDepartmentNames.length,
      duplicateEmails: duplicateAudit.duplicateEmails.length,
      duplicateProfiles: duplicateAudit.duplicateProfiles.length,
      oversizedDepartments: duplicateAudit.oversizedDepartments.length,
    },
    supabase,
    externalUrlChecks,
    externalUnknownMemberCounts,
    duplicateAudit,
  };
}

async function main() {
  const reportPath = process.argv.find((arg) => arg.startsWith("--report="))?.split("=", 2)[1] ?? "reports/hufs-grad-discovery.json";
  const supplementalReport = await buildSupplementalReport(reportPath);
  await mkdir("reports", { recursive: true });
  const baseName = basename(reportPath, ".json");
  const jsonPath = join("reports", `${baseName}-supplemental-validation.json`);
  const mdPath = join("reports", `${baseName}-supplemental-validation.md`);
  await writeFile(jsonPath, `${JSON.stringify(supplementalReport, null, 2)}\n`, "utf8");
  await writeFile(mdPath, renderMarkdown(supplementalReport), "utf8");
  console.log(JSON.stringify({ jsonPath, mdPath, status: supplementalReport.status, summary: supplementalReport.summary, supabase: supplementalReport.supabase }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
