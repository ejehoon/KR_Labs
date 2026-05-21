import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { enrichLabMemberCount } from "../packages/crawler/src/core/labMetrics.js";
import type { KhuFacultyCandidate, KhuGraduateDiscoveryReport } from "../packages/crawler/src/schools/khuGraduateDiscovery.js";

type AuditVisit = {
  name?: string;
  graduateSchoolName: string;
  sourceParser: string;
  labUrl?: string;
  labUrlKind: string;
  httpStatus?: number;
  finalUrl?: string;
  title?: string;
  hasName: boolean;
  hasEmail: boolean;
  hasResearchEvidence: boolean;
  memberLinkCount: number;
  scholarLinkCount: number;
  dblpLinkCount: number;
  status: "ok" | "needs_review" | "failed";
  evidence: string;
};

type KhusmBoardAudit = {
  url: string;
  departmentName: string;
  pageEmailRows: number;
  reportCandidates: number;
  missingEmails: string[];
  hasNoFacultyMessage: boolean;
  status: "ok" | "needs_review" | "failed";
  error?: string;
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
      continue;
    }
    const flag = arg.match(/^--([^=]+)$/);
    if (flag) {
      args.set(flag[1] ?? "", true);
    }
  }
  return args;
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

function duplicates<T>(items: T[], getKey: (item: T) => string | undefined) {
  return Object.entries(countBy(items, getKey))
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
}

function sampleCandidates(candidates: KhuFacultyCandidate[], perGroup: number) {
  const groups = [
    candidates.filter((candidate) => !candidate.labUrlKind.startsWith("fallback")),
    candidates.filter((candidate) => candidate.sourceParser === "khu_professor_central" && candidate.labUrlKind.startsWith("fallback")).slice(0, perGroup),
    candidates.filter((candidate) => candidate.sourceParser === "khu_khusm_department_board").slice(0, perGroup),
    candidates.filter((candidate) => candidate.sourceParser === "khu_official_faculty_page").slice(0, perGroup),
    candidates.filter((candidate) => candidate.classification.matches.length === 0).slice(0, Math.ceil(perGroup / 2)),
  ];
  const seen = new Set<string>();
  const output: KhuFacultyCandidate[] = [];
  for (const candidate of groups.flat()) {
    const key = `${candidate.nameKo ?? candidate.nameEn}|${candidate.email ?? ""}|${candidate.labUrl ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
  }
  return output;
}

function researchTerms(candidate: KhuFacultyCandidate) {
  return (candidate.researchText ?? "")
    .split(/[|,;/·]/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 4 && !/연락처|학위|보직|주소/.test(term))
    .slice(0, 8);
}

async function visitCandidate(browser: Awaited<ReturnType<typeof chromium.launch>>, candidate: KhuFacultyCandidate): Promise<AuditVisit> {
  const page = await browser.newPage();
  try {
    const response = await page.goto(candidate.labUrl ?? candidate.sourceUrl, { waitUntil: "domcontentloaded", timeout: 18_000 });
    await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined);
    const title = (await page.title().catch(() => "")).replace(/\s+/g, " ").trim();
    const text = ((await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
    const html = await page.content().catch(() => "");
    const evidenceText = `${text} ${html}`;
    const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((anchor) => ({
      href: (anchor as HTMLAnchorElement).href,
      text: (anchor.textContent ?? "").replace(/\s+/g, " ").trim(),
    }))).catch(() => []);
    const hasName = Boolean(candidate.nameKo && evidenceText.includes(candidate.nameKo));
    const hasEmail = Boolean(candidate.email && evidenceText.toLowerCase().includes(candidate.email.toLowerCase()));
    const matchedTerm = researchTerms(candidate).find((term) => evidenceText.includes(term));
    const memberLinkCount = links.filter((link) => /members?|people|team|students?|researchers?|구성원|멤버|학생|연구원/i.test(`${link.text} ${link.href}`)).length;
    const scholarLinkCount = links.filter((link) => /scholar\.google/i.test(link.href)).length;
    const dblpLinkCount = links.filter((link) => /dblp\.org/i.test(link.href)).length;
    const pageOk = response?.ok() ?? false;
    const expectedEvidence = hasName || hasEmail || Boolean(matchedTerm) || !candidate.labUrlKind.startsWith("fallback");
    return {
      name: candidate.nameKo ?? candidate.nameEn,
      graduateSchoolName: candidate.graduateSchoolName,
      sourceParser: candidate.sourceParser,
      labUrl: candidate.labUrl,
      labUrlKind: candidate.labUrlKind,
      httpStatus: response?.status(),
      finalUrl: page.url(),
      title,
      hasName,
      hasEmail,
      hasResearchEvidence: Boolean(matchedTerm),
      memberLinkCount,
      scholarLinkCount,
      dblpLinkCount,
      status: pageOk && expectedEvidence ? "ok" : "needs_review",
      evidence: [
        `http=${response?.status() ?? "unknown"}`,
        hasName ? "name_found" : "name_not_found",
        hasEmail ? "email_found" : "email_not_found",
        matchedTerm ? `research_found=${matchedTerm}` : "research_not_found",
        `member_links=${memberLinkCount}`,
      ].join("; "),
    };
  } catch (error) {
    return {
      name: candidate.nameKo ?? candidate.nameEn,
      graduateSchoolName: candidate.graduateSchoolName,
      sourceParser: candidate.sourceParser,
      labUrl: candidate.labUrl,
      labUrlKind: candidate.labUrlKind,
      hasName: false,
      hasEmail: false,
      hasResearchEvidence: false,
      memberLinkCount: 0,
      scholarLinkCount: 0,
      dblpLinkCount: 0,
      status: "failed",
      evidence: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await page.close();
  }
}

async function auditKhusmBoards(browser: Awaited<ReturnType<typeof chromium.launch>>, report: KhuGraduateDiscoveryReport): Promise<KhusmBoardAudit[]> {
  let activeBrowser = browser;
  async function newAuditPage() {
    if (!activeBrowser.isConnected()) {
      activeBrowser = await chromium.launch({ headless: true });
    }
    return activeBrowser.newPage();
  }
  const indexUrls = [
    "https://khusm.khu.ac.kr/professor/reg_intro.php",
    "https://khusm.khu.ac.kr/professor/clinic_intro.php",
  ];
  const boardUrls = new Set<string>();
  for (const indexUrl of indexUrls) {
    const page = await newAuditPage();
    try {
      await page.goto(indexUrl, { waitUntil: "domcontentloaded", timeout: 18_000 });
      const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")]
        .map((anchor) => (anchor as HTMLAnchorElement).href)
        .filter((href) => /\/bbs\/board\.php\?bo_table=s2_1_[12]&sca=/i.test(href)));
      for (const link of links) {
        boardUrls.add(link);
      }
    } finally {
      await page.close();
    }
  }

  const reportEmailsByDepartment = new Map<string, Set<string>>();
  for (const candidate of report.facultyCandidates) {
    if (!candidate.email) continue;
    for (const department of (candidate.departmentName ?? "").split(/\s+\/\s+/).map((value) => value.trim()).filter(Boolean)) {
      const bucket = reportEmailsByDepartment.get(department) ?? new Set<string>();
      bucket.add(candidate.email.toLowerCase());
      reportEmailsByDepartment.set(department, bucket);
    }
  }
  const output: KhusmBoardAudit[] = [];
  for (const url of [...boardUrls].sort()) {
    const page = await newAuditPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35_000 });
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      const result = await page.evaluate(`(() => {
        const clean = (value) => (value ?? "").replace(/\\s+/g, " ").trim();
        const departmentName = new URL(window.location.href).searchParams.get("sca") ?? "";
        const bodyText = clean(document.body.innerText);
        const rows = [...document.querySelectorAll("table tr")]
          .map((row) => [...row.querySelectorAll("th,td")].map((cell) => clean(cell.innerText)))
          .filter((cells) => /[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i.test(cells.join(" ")));
        const emails = rows.map((cells) => cells.join(" ").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i)?.[0].toLowerCase()).filter(Boolean);
        return { departmentName, pageEmailRows: rows.length, emails, hasNoFacultyMessage: /교수진이 없습니다/.test(bodyText) };
      })()`);
      const reportEmails = reportEmailsByDepartment.get(result.departmentName) ?? new Set<string>();
      const missingEmails = result.emails.filter((email: string) => !reportEmails.has(email));
      const reportCandidates = reportEmails.size;
      output.push({
        url,
        departmentName: result.departmentName,
        pageEmailRows: result.pageEmailRows,
        reportCandidates,
        missingEmails,
        hasNoFacultyMessage: result.hasNoFacultyMessage,
        status: missingEmails.length === 0 && (result.pageEmailRows > 0 || result.hasNoFacultyMessage) ? "ok" : "needs_review",
      });
    } catch (error) {
      output.push({
        url,
        departmentName: "",
        pageEmailRows: 0,
        reportCandidates: 0,
        missingEmails: [],
        hasNoFacultyMessage: false,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await page.close();
    }
  }
  if (activeBrowser !== browser) {
    await activeBrowser.close();
  }
  return output;
}

async function fetchDbRows() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { skipped: true, reason: "missing_supabase_env" };
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" };
  const universityResponse = await fetch(`${url}/rest/v1/universities?select=id,name&name=eq.${encodeURIComponent("경희대학교")}`, { headers });
  const universities = await universityResponse.json() as Array<{ id: number; name: string }>;
  const university = universities[0];
  if (!university) {
    return { skipped: false, universityFound: false };
  }
  const professorsResponse = await fetch(`${url}/rest/v1/professors?select=id,name,department,lab_url,paper_count,lab_member_count,scholar_url,dblp_url,research_sub_fields&university_id=eq.${university.id}&limit=1000`, { headers });
  const rows = await professorsResponse.json() as Array<Record<string, unknown>>;
  return {
    skipped: false,
    universityFound: true,
    university,
    count: rows.length,
    nonNullMemberCount: rows.filter((row) => typeof row.lab_member_count === "number").length,
    nonNullPaperCount: rows.filter((row) => typeof row.paper_count === "number").length,
    scholarUrlCount: rows.filter((row) => row.scholar_url).length,
    dblpUrlCount: rows.filter((row) => row.dblp_url).length,
    duplicateNameDepartmentLabUrl: duplicates(rows, (row) => `${row.name}|${row.department}|${row.lab_url}`),
    pollutedDepartmentRows: rows.filter((row) => /보\s*직|전\s*화|E-mail/i.test(String(row.department ?? ""))).slice(0, 20),
  };
}

function sameHost(a: string | undefined, b: string | undefined) {
  if (!a || !b) return false;
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
}

function renderMarkdown(audit: any) {
  const visitRows = audit.sampleVisits.map((row: AuditVisit) => `| ${row.status} | ${row.graduateSchoolName} | ${row.name ?? ""} | ${row.labUrlKind} | ${row.httpStatus ?? ""} | ${row.evidence} |`).join("\n");
  const khusmRows = audit.khusmBoards.filter((row: KhusmBoardAudit) => row.status !== "ok").map((row: KhusmBoardAudit) => `| ${row.status} | ${row.departmentName} | ${row.pageEmailRows} | ${row.reportCandidates} | ${row.missingEmails.join(", ")} | ${row.url} |`).join("\n");
  const memberRows = audit.memberAudits.map((row: any) => `| ${row.name ?? ""} | ${row.labUrlKind} | ${row.resultCount ?? ""} | ${row.acceptedSameHost} | ${row.sourceUrl ?? ""} | ${row.candidatePages} |`).join("\n");
  return `# KHU Graduate Extended Audit

- Generated At: ${audit.generatedAt}
- Report professors: ${audit.report.professors}
- DB professors: ${audit.db.count ?? "unknown"}
- Sample visits: ${audit.summary.sampleVisits}
- Sample visit issues: ${audit.summary.sampleVisitIssues}
- KHUSM boards: ${audit.summary.khusmBoards}
- KHUSM board issues: ${audit.summary.khusmBoardIssues}
- Non-fallback member audits: ${audit.summary.memberAudits}
- Accepted member counts: ${audit.summary.acceptedMemberCounts}

## DB Checks

- University found: ${audit.db.universityFound}
- Non-null paper counts: ${audit.db.nonNullPaperCount}
- Non-null member counts: ${audit.db.nonNullMemberCount}
- Polluted department rows: ${audit.db.pollutedDepartmentRows?.length ?? 0}
- Duplicate email in report: ${audit.report.duplicateEmail.length}

## Sample Visits

| status | school | professor | URL kind | HTTP | evidence |
|---|---|---|---|---:|---|
${visitRows}

## KHUSM Board Issues

| status | department | page email rows | report candidates | missing emails | URL |
|---|---|---:|---:|---|---|
${khusmRows || "|  |  | 0 | 0 |  |  |"}

## Non-Fallback Member Count Audit

| professor | URL kind | raw count | same host accepted | member source URL | candidate pages |
|---|---|---:|---|---|---:|
${memberRows || "|  |  |  |  |  |  |"}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    console.log("Usage: pnpm tsx scripts/audit-khu-grad.ts [--report=reports/khu-grad-discovery.json] [--sample-per-group=15]");
    return;
  }
  const reportPath = String(args.get("report") ?? "reports/khu-grad-discovery.json");
  const samplePerGroup = Number(args.get("sample-per-group") ?? 15);
  const khusmOnly = args.get("khusm-only") === true;
  const report = JSON.parse(await readFile(reportPath, "utf8")) as KhuGraduateDiscoveryReport;
  let browser = await chromium.launch({ headless: true });
  try {
    const khusmBoards = await auditKhusmBoards(browser, report);
    if (!browser.isConnected()) {
      browser = await chromium.launch({ headless: true });
    }
    const selected = khusmOnly ? [] : sampleCandidates(report.facultyCandidates, samplePerGroup);
    const sampleVisits: AuditVisit[] = [];
    for (const candidate of selected) {
      sampleVisits.push(await visitCandidate(browser, candidate));
    }
    const nonFallback = khusmOnly ? [] : report.facultyCandidates.filter((candidate) => candidate.labUrl && !candidate.labUrlKind.startsWith("fallback"));
    const memberAudits = [];
    for (const candidate of nonFallback) {
      const result = await enrichLabMemberCount(candidate.labUrl);
      memberAudits.push({
        name: candidate.nameKo ?? candidate.nameEn,
        labUrl: candidate.labUrl,
        labUrlKind: candidate.labUrlKind,
        resultCount: result.count,
        sourceUrl: result.sourceUrl,
        acceptedSameHost: Boolean(result.count) && sameHost(candidate.labUrl, result.sourceUrl),
        candidatePages: result.candidatePages.length,
      });
    }
    const duplicateEmail = duplicates(report.facultyCandidates, (candidate) => candidate.email);
    const duplicateNameDepartmentLabUrl = duplicates(report.facultyCandidates, (candidate) => `${candidate.nameKo ?? candidate.nameEn}|${candidate.departmentName ?? ""}|${candidate.labUrl ?? ""}`);
    const db = await fetchDbRows();
    const audit = {
      reportPath,
      generatedAt: new Date().toISOString(),
      report: {
        professors: report.facultyCandidates.length,
        graduateSchools: report.schools.length,
        departments: report.summary.departmentCount,
        nonFallbackLabUrls: report.summary.labUrlCount,
        fallbackLabUrls: report.summary.labUrlFallbackCount,
        duplicateEmail,
        duplicateNameDepartmentLabUrl,
        parserCounts: countBy(report.facultyCandidates, (candidate) => candidate.sourceParser),
      },
      db,
      sampleVisits,
      khusmBoards,
      memberAudits,
      summary: {
        sampleVisits: sampleVisits.length,
        sampleVisitIssues: sampleVisits.filter((row) => row.status !== "ok").length,
        khusmBoards: khusmBoards.length,
        khusmBoardIssues: khusmBoards.filter((row) => row.status !== "ok").length,
        memberAudits: memberAudits.length,
        acceptedMemberCounts: memberAudits.filter((row) => row.acceptedSameHost).length,
      },
    };
    await mkdir("reports", { recursive: true });
    await writeFile("reports/khu-grad-audit.json", `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    await writeFile("reports/khu-grad-audit.md", renderMarkdown(audit), "utf8");
    console.log(JSON.stringify({
      jsonPath: "reports/khu-grad-audit.json",
      mdPath: "reports/khu-grad-audit.md",
      summary: audit.summary,
      db: {
        count: (db as any).count,
        nonNullMemberCount: (db as any).nonNullMemberCount,
        pollutedDepartmentRows: (db as any).pollutedDepartmentRows?.length,
      },
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
