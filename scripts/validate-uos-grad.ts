import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";
import type { UosFacultyCandidate, UosGraduateDiscoveryReport } from "../packages/crawler/src/schools/uosGraduateDiscovery.js";

type ValidationIssue = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  count: number;
  samples: Array<Record<string, unknown>>;
};

type SampleVerification = {
  department: string;
  professor?: string;
  labUrl?: string;
  labUrlSource: string;
  status: "ok" | "needs_review" | "failed";
  finalUrl?: string;
  title?: string;
  memberCount?: number | null;
  memberCountSourceUrl?: string;
  notes: string[];
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
  console.log(`Usage: pnpm validate:uos-grad [--report=reports/uos-grad-discovery.json] [--verify-samples=10]

Validates the local University of Seoul graduate discovery JSON and revisits
sample professor/lab URLs with Playwright.
`);
}

function sample(rows: UosFacultyCandidate[], limit = 20) {
  return rows.slice(0, limit).map((row) => ({
    department: row.sourceDepartmentName,
    name: row.nameKo,
    researchText: row.researchText,
    labUrl: row.labUrl,
    labUrlSource: row.labUrlSource,
    currentMemberCount: row.currentMemberCount ?? null,
    memberCountSourceUrl: row.memberCountSourceUrl,
    dblpUrl: row.dblpUrl,
    scholarUrl: row.scholarUrl,
    taxonomy: row.classification?.matches?.map((match) => match.labelKo) ?? [],
    warnings: row.warnings,
  }));
}

function buildIssue(
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
  rows: UosFacultyCandidate[],
  limit = 20,
): ValidationIssue | undefined {
  if (rows.length === 0) {
    return undefined;
  }
  return { severity, code, message, count: rows.length, samples: sample(rows, limit) };
}

function duplicateRows(rows: UosFacultyCandidate[], getKey: (row: UosFacultyCandidate) => string | undefined) {
  const buckets = new Map<string, UosFacultyCandidate[]>();
  for (const row of rows) {
    const key = getKey(row);
    if (!key) {
      continue;
    }
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }
  return [...buckets.entries()]
    .filter(([, bucket]) => bucket.length > 1)
    .map(([key, bucket]) => ({ key, count: bucket.length, rows: sample(bucket, 8) }));
}

function isBadMemberCountSource(row: UosFacultyCandidate) {
  if (typeof row.currentMemberCount !== "number") {
    return false;
  }
  return /(?:professor|faculty|교수진|교수소개|전임교수|\/prof\/\d+|graduateNew\/deptIntro)/i.test(row.memberCountSourceUrl ?? "");
}

function validate(report: UosGraduateDiscoveryReport, sourcePath: string, sampleVerifications: SampleVerification[]) {
  const candidates = report.facultyCandidates;
  const missingLabUrl = candidates.filter((row) => !row.labUrl);
  const fallbackLabUrl = candidates.filter((row) => row.labUrlSource !== "external_lab_homepage");
  const missingResearch = candidates.filter((row) => !row.researchText);
  const noTaxonomy = candidates.filter((row) => (row.classification?.matches ?? []).length === 0);
  const badMemberSources = candidates.filter(isBadMemberCountSource);
  const memberCounts = candidates.filter((row) => typeof row.currentMemberCount === "number");
  const unknownMembers = candidates.filter((row) => typeof row.currentMemberCount !== "number");
  const withDblpUrl = candidates.filter((row) => row.dblpUrl);
  const withScholarUrl = candidates.filter((row) => row.scholarUrl);
  const sampleFailures = sampleVerifications.filter((item) => item.status === "failed");
  const sampleNeedsReview = sampleVerifications.filter((item) => item.status === "needs_review");

  const issues = [
    buildIssue("warning", "missing_research_text", "교수 후보에 연구분야 텍스트가 없습니다.", missingResearch),
    buildIssue("warning", "fallback_lab_url", "명시적 연구실 홈페이지가 없어 교수 상세/교수 목록 URL을 fallback으로 사용했습니다.", fallbackLabUrl, 40),
    buildIssue("warning", "missing_lab_url", "저장할 URL이 없는 교수 후보입니다.", missingLabUrl),
    buildIssue("warning", "bad_member_count_source", "연구원수 출처가 교수/학과 페이지로 보입니다.", badMemberSources),
    buildIssue("info", "no_taxonomy_match", "중앙 taxonomy에 확정 매칭되지 않은 후보입니다.", noTaxonomy, 40),
  ].filter((issue): issue is ValidationIssue => Boolean(issue));

  return {
    sourcePath,
    generatedAt: new Date().toISOString(),
    reportGeneratedAt: report.generatedAt,
    status: issues.some((issue) => issue.severity === "error") || sampleFailures.length > 0
      ? "failed"
      : issues.some((issue) => issue.severity === "warning") || sampleNeedsReview.length > 0
        ? "needs_review"
        : "success",
    coverage: {
      departments: report.departments.length,
      professors: candidates.length,
      labUrlPresent: candidates.length - missingLabUrl.length,
      labUrlMissing: missingLabUrl.length,
      externalLabUrl: report.summary.externalLabUrlCount,
      fallbackLabUrl: fallbackLabUrl.length,
      memberCountKnown: memberCounts.length,
      memberCountUnknown: unknownMembers.length,
      dblpUrlPresent: withDblpUrl.length,
      dblpUrlMissing: candidates.length - withDblpUrl.length,
      scholarUrlPresent: withScholarUrl.length,
      scholarUrlMissing: candidates.length - withScholarUrl.length,
      taxonomyClassified: candidates.length - noTaxonomy.length,
      taxonomyUnclassified: noTaxonomy.length,
    },
    counts: report.summary,
    duplicates: {
      departmentName: duplicateRows(candidates, (row) => `${row.sourceDepartmentName}|${row.nameKo ?? ""}`),
      profileUrl: duplicateRows(candidates, (row) => row.profileUrl),
      labUrl: duplicateRows(candidates, (row) => row.labUrlSource === "external_lab_homepage" ? row.labUrl : undefined),
    },
    issues,
    sampleVerifications,
    fallbackUrlRows: sample(fallbackLabUrl, 80),
    suspiciousRows: sample([...badMemberSources, ...missingResearch, ...noTaxonomy], 80),
    manualReviewRows: sample(candidates.filter((row) => row.warnings.length > 0 || (row.classification?.matches ?? []).length === 0), 120),
  };
}

async function verifySamples(report: UosGraduateDiscoveryReport, limit: number): Promise<SampleVerification[]> {
  if (limit <= 0) {
    return [];
  }
  const candidates = [
    ...report.facultyCandidates.filter((row) => row.labUrlSource === "external_lab_homepage"),
    ...report.facultyCandidates.filter((row) => row.labUrlSource !== "external_lab_homepage"),
  ].slice(0, limit);
  const browser = await createBrowserManager();
  const results: SampleVerification[] = [];

  try {
    for (const candidate of candidates) {
      const notes: string[] = [];
      if (candidate.labUrlSource !== "external_lab_homepage") {
        notes.push("연구실 홈페이지 없음, fallback 사용");
      }
      if (typeof candidate.currentMemberCount !== "number") {
        notes.push("연구원수 알 수 없음");
      }
      if (candidate.memberCountSourceUrl && /alumni|former|past|졸업|동문/i.test(candidate.memberCountSourceUrl)) {
        notes.push("member source URL에 alumni/former 계열 단어가 포함됨");
      }
      if (!candidate.labUrl) {
        results.push({
          department: candidate.sourceDepartmentName,
          professor: candidate.nameKo,
          labUrlSource: candidate.labUrlSource,
          status: "failed",
          notes: ["labUrl 없음", ...notes],
        });
        continue;
      }

      const page = await browser.context.newPage();
      try {
        await page.goto(candidate.labUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
        await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
        const title = await page.title();
        const finalUrl = page.url();
        const bodyText = (await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "")).replace(/\s+/g, " ").trim();
        if (!bodyText || bodyText.length < 80) {
          notes.push("페이지 텍스트가 짧아 수동 확인 필요");
        }
        if (/accounts\.google\.com|ServiceLogin/i.test(finalUrl) || /로그인\s*-\s*Google/i.test(title)) {
          notes.push("Google Sites 로그인 리다이렉트로 공개 연구실 페이지 여부 수동 확인 필요");
        }
        if (/404|not\s*found|페이지를\s*찾을\s*수/i.test(`${title} ${bodyText}`)) {
          notes.push("404/Not Found 응답으로 수동 확인 필요");
        }
        if (/치명적인\s*오류|critical\s*error|server\s*error/i.test(bodyText)) {
          notes.push("사이트 오류 문구가 있어 수동 확인 필요");
        }
        if (candidate.labUrlSource === "external_lab_homepage" && /교수소개|전임교수|faculty|professor/i.test(`${title} ${finalUrl}`)) {
          notes.push("외부 URL이 교수 목록/프로필 성격일 수 있음");
        }
        results.push({
          department: candidate.sourceDepartmentName,
          professor: candidate.nameKo,
          labUrl: candidate.labUrl,
          labUrlSource: candidate.labUrlSource,
          finalUrl,
          title,
          memberCount: candidate.currentMemberCount ?? null,
          memberCountSourceUrl: candidate.memberCountSourceUrl,
          status: notes.some((note) => /수동|fallback|교수 목록|프로필|로그인|404|오류/.test(note)) ? "needs_review" : "ok",
          notes,
        });
      } catch (error) {
        results.push({
          department: candidate.sourceDepartmentName,
          professor: candidate.nameKo,
          labUrl: candidate.labUrl,
          labUrlSource: candidate.labUrlSource,
          memberCount: candidate.currentMemberCount ?? null,
          memberCountSourceUrl: candidate.memberCountSourceUrl,
          status: candidate.labUrlSource === "external_lab_homepage" ? "needs_review" : "failed",
          notes: [error instanceof Error ? error.message : String(error), ...notes],
        });
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

function renderMarkdown(validation: ReturnType<typeof validate>) {
  const coverageRows = Object.entries(validation.coverage)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join("\n");
  const issueRows = validation.issues
    .map((issue) => `| ${issue.severity} | ${issue.code} | ${issue.count} | ${issue.message} |`)
    .join("\n");
  const sampleRows = validation.sampleVerifications
    .map((item) => `| ${item.status} | ${item.department} | ${item.professor ?? ""} | ${item.labUrlSource} | ${item.memberCount ?? "알 수 없음"} | ${item.title ?? ""} | ${item.notes.join("; ")} |`)
    .join("\n");
  const fallbackRows = validation.fallbackUrlRows
    .slice(0, 50)
    .map((row) => `| ${row.department ?? ""} | ${row.name ?? ""} | ${row.labUrl ?? ""} | ${row.labUrlSource ?? ""} |`)
    .join("\n");

  return `# UOS Graduate Discovery Validation

- Source: ${validation.sourcePath}
- Status: ${validation.status}
- Generated At: ${validation.generatedAt}
- Report Generated At: ${validation.reportGeneratedAt}

## Required Metrics

| metric | value |
|---|---:|
${coverageRows}

## Issues

| severity | code | count | message |
|---|---|---:|---|
${issueRows || "|  |  | 0 | No issues |"}

## Sample Revisit

| status | department | professor | URL source | member count | page title | notes |
|---|---|---|---|---:|---|---|
${sampleRows || "|  |  |  |  |  |  |  |"}

## Fallback URL List

| department | professor | URL | source |
|---|---|---|---|
${fallbackRows || "|  |  |  |  |"}

## Manual Review Needed

${validation.manualReviewRows.slice(0, 50).map((row) => `- ${row.department ?? ""} / ${row.name ?? ""}: ${(row.warnings as string[] | undefined)?.join(", ") || "taxonomy/research text review"}`).join("\n") || "- None"}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const sourcePath = String(args.get("report") ?? "reports/uos-grad-discovery.json");
  const verifySampleCount = Number(args.get("verify-samples") ?? 10);
  const report = JSON.parse(await readFile(sourcePath, "utf8")) as UosGraduateDiscoveryReport;
  const sampleVerifications = await verifySamples(report, verifySampleCount);
  const validation = validate(report, sourcePath, sampleVerifications);

  await mkdir("reports", { recursive: true });
  const base = basename(sourcePath).replace(/\.json$/i, "");
  const jsonPath = join("reports", `${base}-validation.json`);
  const mdPath = join("reports", `${base}-validation.md`);
  await writeFile(jsonPath, `${JSON.stringify(validation, null, 2)}\n`, "utf8");
  await writeFile(mdPath, renderMarkdown(validation), "utf8");

  console.log(JSON.stringify({
    jsonPath,
    mdPath,
    status: validation.status,
    coverage: validation.coverage,
    issueCount: validation.issues.length,
    sampleVerifications: validation.sampleVerifications,
  }, null, 2));

  if (validation.status === "failed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
