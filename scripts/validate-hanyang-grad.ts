import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";
import { snapshotPlaywrightPage } from "../packages/crawler/src/core/playwrightExtract.js";
import type { HanyangGraduateDiscoveryReport, HanyangLabCandidate } from "../packages/crawler/src/schools/hanyangGraduateDiscovery.js";

type ValidationIssue = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  count: number;
  samples: Array<Record<string, unknown>>;
};

type SampleVerification = {
  professorName?: string;
  labName?: string;
  labUrl: string;
  status?: number;
  finalUrl?: string;
  title?: string;
  matchedProfessorOrLabText: boolean;
  memberCount?: number;
  memberCountSourceUrl?: string;
  memberSourceHasFormerTerms?: boolean;
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
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: pnpm validate:hanyang-grad [--report=reports/hanyang-grad-discovery.json] [--verify-samples=10]

Validates Hanyang graduate discovery JSON and optionally revisits lab/member URLs
with Playwright for sample verification.
`);
}

function hasNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sample(rows: HanyangLabCandidate[], limit = 20) {
  return rows.slice(0, limit).map((row) => ({
    college: row.collegeName,
    department: row.departmentName,
    professor: row.professorName,
    lab: row.labName,
    labUrl: row.labUrl,
    sourceUrl: row.sourceUrl,
    memberCount: row.currentMemberCount ?? null,
    memberCountSourceUrl: row.memberCountSourceUrl,
    taxonomy: row.classification.matches.map((match) => match.labelKo),
    warnings: row.warnings,
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

function duplicateRows(rows: HanyangLabCandidate[], getKey: (row: HanyangLabCandidate) => string | undefined) {
  const buckets = new Map<string, HanyangLabCandidate[]>();
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
  rows: HanyangLabCandidate[],
): ValidationIssue | undefined {
  if (rows.length === 0) {
    return undefined;
  }
  return { severity, code, message, count: rows.length, samples: sample(rows) };
}

async function verifySamples(rows: HanyangLabCandidate[], limit: number): Promise<SampleVerification[]> {
  if (limit <= 0) {
    return [];
  }
  const selected = [
    ...rows.filter((row) => row.labHomepageUrl && hasNumber(row.currentMemberCount)),
    ...rows.filter((row) => row.labHomepageUrl && !hasNumber(row.currentMemberCount)),
    ...rows.filter((row) => !row.labHomepageUrl),
  ].slice(0, limit);

  const browser = await createBrowserManager();
  try {
    const output: SampleVerification[] = [];
    for (const row of selected) {
      try {
        const snapshot = await snapshotPlaywrightPage(browser.context, row.labUrl);
        const sourceText = `${snapshot.title} ${snapshot.text}`.toLowerCase();
        let memberSourceHasFormerTerms: boolean | undefined;
        if (row.memberCountSourceUrl) {
          const memberSnapshot = await snapshotPlaywrightPage(browser.context, row.memberCountSourceUrl);
          memberSourceHasFormerTerms = /alumni|former|past|graduates?|졸업|동문|ob/i.test(memberSnapshot.text);
        }
        output.push({
          professorName: row.professorName,
          labName: row.labName,
          labUrl: row.labUrl,
          status: snapshot.status,
          finalUrl: snapshot.finalUrl,
          title: snapshot.title,
          matchedProfessorOrLabText: Boolean(
            (row.professorName && sourceText.includes(row.professorName.toLowerCase()))
              || (row.labName && sourceText.includes(row.labName.toLowerCase())),
          ),
          memberCount: row.currentMemberCount,
          memberCountSourceUrl: row.memberCountSourceUrl,
          memberSourceHasFormerTerms,
        });
      } catch (error) {
        output.push({
          professorName: row.professorName,
          labName: row.labName,
          labUrl: row.labUrl,
          matchedProfessorOrLabText: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return output;
  } finally {
    await browser.close();
  }
}

function validate(report: HanyangGraduateDiscoveryReport, sourcePath: string, sampleVerifications: SampleVerification[]) {
  const rows = report.labCandidates;
  const missingResearch = rows.filter((row) => !row.researchText);
  const missingProfessor = rows.filter((row) => !row.professorName);
  const missingEmail = rows.filter((row) => !row.email);
  const fallbackRows = rows.filter((row) => !row.labHomepageUrl);
  const noTaxonomy = rows.filter((row) => row.classification.matches.length === 0);
  const withMemberCount = rows.filter((row) => hasNumber(row.currentMemberCount));
  const suspiciousMemberSource = rows.filter((row) =>
    row.memberCountSourceUrl
      ? /professor|faculty|교수|lab_03\.php|department|research|publication|paper|alumni|former|past|졸업|동문/i.test(row.memberCountSourceUrl)
      : false,
  );
  const suspiciousSamples = sampleVerifications.filter((item) => item.error || (item.status && item.status >= 400) || item.memberSourceHasFormerTerms);
  const taxonomyCounts: Record<string, number> = {};
  for (const row of rows) {
    for (const match of row.classification.matches) {
      taxonomyCounts[match.labelKo] = (taxonomyCounts[match.labelKo] ?? 0) + 1;
    }
  }

  const issues = [
    buildIssue("warning", "missing_research_text", "연구분야 텍스트가 없는 연구실 후보입니다.", missingResearch),
    buildIssue("warning", "missing_professor", "담당교수명이 없는 연구실 후보입니다.", missingProfessor),
    buildIssue("warning", "missing_email", "교수 이메일이 없는 연구실 후보입니다.", missingEmail),
    buildIssue("warning", "fallback_lab_url", "외부 연구실 홈페이지가 없어 학과 연구실 목록 페이지를 fallback lab_url로 사용했습니다.", fallbackRows),
    buildIssue("warning", "suspicious_member_source", "연구원수 출처가 연구실 구성원 페이지가 아닐 가능성이 있습니다.", suspiciousMemberSource),
    buildIssue("info", "no_taxonomy_match", "기존 taxonomy에 확정 매칭되지 않은 후보입니다.", noTaxonomy),
  ].filter((issue): issue is ValidationIssue => Boolean(issue));

  return {
    sourcePath,
    generatedAt: new Date().toISOString(),
    reportGeneratedAt: report.generatedAt,
    status: issues.some((issue) => issue.severity === "error") ? "failed" : issues.some((issue) => issue.severity === "warning") ? "needs_review" : "success",
    discoveryReport: report.discoveryReport,
    coverage: {
      departments: report.programs.length,
      professors: rows.filter((row) => row.professorName).length,
      labs: rows.length,
      labHomepageUrlPresent: rows.length - fallbackRows.length,
      labHomepageUrlMissingFallbackUsed: fallbackRows.length,
      memberCountVerified: withMemberCount.length,
      memberCountUnknown: rows.length - withMemberCount.length,
      dblpUrlPresent: rows.filter((row) => row.dblpUrl).length,
      dblpUrlMissing: rows.filter((row) => !row.dblpUrl).length,
      scholarUrlPresent: rows.filter((row) => row.scholarUrl).length,
      scholarUrlMissing: rows.filter((row) => !row.scholarUrl).length,
      categorized: rows.length - noTaxonomy.length,
      uncategorized: noTaxonomy.length,
    },
    counts: {
      byCollege: countBy(rows, (row) => row.collegeName),
      byDepartment: countBy(rows, (row) => row.departmentName),
      byTaxonomy: Object.fromEntries(Object.entries(taxonomyCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    },
    duplicates: {
      email: duplicateRows(rows, (row) => row.email),
      labUrl: duplicateRows(rows, (row) => row.labHomepageUrl),
      professorDepartment: duplicateRows(rows, (row) => row.professorName ? `${row.departmentName}|${row.professorName}` : undefined),
    },
    fallbackLabUrls: sample(fallbackRows, 80),
    suspiciousData: [
      ...sample(suspiciousMemberSource, 20),
      ...suspiciousSamples.map((item) => ({ code: "sample_verification", ...item })),
    ],
    manualReview: sample([...fallbackRows, ...missingResearch, ...noTaxonomy], 80),
    sampleVerifications,
    issues,
  };
}

function renderMarkdown(validation: ReturnType<typeof validate>) {
  const coverageRows = Object.entries(validation.coverage)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join("\n");
  const issueRows = validation.issues
    .map((issue) => `| ${issue.severity} | ${issue.code} | ${issue.count} | ${issue.message} |`)
    .join("\n");
  const sampleRows = validation.sampleVerifications
    .map((item) => `| ${item.professorName ?? ""} | ${item.labName ?? ""} | ${item.status ?? ""} | ${item.matchedProfessorOrLabText ? "yes" : "no"} | ${item.memberCount ?? "unknown"} | ${item.error ?? ""} |`)
    .join("\n");

  return `# Hanyang Graduate Discovery Validation

- Source: ${validation.sourcePath}
- Status: ${validation.status}
- Generated At: ${validation.generatedAt}

## Discovery Report

- Department page: ${validation.discoveryReport.departmentPage.finalUrl}
- Department links: ${validation.discoveryReport.departmentPage.departmentLinkCount}
- Lab root page: ${validation.discoveryReport.labRootPage.finalUrl}
- Lab index colleges: ${validation.discoveryReport.labRootPage.collegeLabIndexCount}
- Professor/lab cards: ${validation.discoveryReport.professorListUrlPattern}
- Professor detail URL pattern: ${validation.discoveryReport.professorDetailUrlPattern ?? "not exposed on graduate lab pages"}
- Lab homepage links: ${validation.discoveryReport.labHomepageLinkPattern}
- Members traversal: ${validation.discoveryReport.membersTraversal}
- Publications traversal: ${validation.discoveryReport.publicationsTraversal}

## Coverage

| metric | value |
|---|---:|
${coverageRows}

## Issues

| severity | code | count | message |
|---|---|---:|---|
${issueRows || "|  |  | 0 | No issues |"}

## Sample Verification

| professor | lab | status | matched text | member count | error |
|---|---|---:|---|---:|---|
${sampleRows || "|  |  |  |  |  |  |"}

## Fallback URL Samples

${validation.fallbackLabUrls.slice(0, 30).map((row) => `- ${row.department ?? ""} / ${row.professor ?? ""} / ${row.lab ?? ""}: ${row.labUrl}`).join("\n") || "- None"}

## Manual Review Needed

${validation.manualReview.slice(0, 40).map((row) => `- ${row.department ?? ""} / ${row.professor ?? ""} / ${row.lab ?? ""}: ${(row.warnings as string[] | undefined)?.join("; ") ?? ""}`).join("\n") || "- None"}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const reportPath = String(args.get("report") ?? "reports/hanyang-grad-discovery.json");
  const verifySamplesCount = Number(args.get("verify-samples") ?? 0);
  const report = JSON.parse(await readFile(reportPath, "utf8")) as HanyangGraduateDiscoveryReport;
  const sampleVerifications = await verifySamples(report.labCandidates, Number.isFinite(verifySamplesCount) ? verifySamplesCount : 0);
  const validation = validate(report, reportPath, sampleVerifications);

  await mkdir("reports", { recursive: true });
  const baseName = basename(reportPath).replace(/\.json$/i, "");
  const jsonPath = join("reports", `${baseName}-validation.json`);
  const mdPath = join("reports", `${baseName}-validation.md`);
  await writeFile(jsonPath, `${JSON.stringify(validation, null, 2)}\n`, "utf8");
  await writeFile(mdPath, renderMarkdown(validation), "utf8");

  console.log(JSON.stringify({
    jsonPath,
    mdPath,
    status: validation.status,
    coverage: validation.coverage,
    issueCounts: validation.issues.map((issue) => ({ code: issue.code, count: issue.count })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});

