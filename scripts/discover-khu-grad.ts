import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";
import { discoverKhuGraduateSeeds, verifyKhuSamples, type KhuGraduateDiscoveryReport } from "../packages/crawler/src/schools/khuGraduateDiscovery.js";

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

function printHelp() {
  console.log(`Usage: pnpm tsx scripts/discover-khu-grad.ts [--max-schools=17] [--skip-member-enrichment] [--verify-samples=12]

Discovers KHU graduate-school professor/lab candidates from the supplied KHU
graduate admissions target URL. Writes reports/khu-grad-discovery.json and .md
without Supabase writes.
`);
}

function renderDiscoveryMarkdown(report: KhuGraduateDiscoveryReport): string {
  const schoolRows = report.schools
    .map((school) => `| ${school.name} | ${school.homepageUrl} | ${school.professorSearchCode ?? ""} | ${school.facultyUrls.join("<br>")} |`)
    .join("\n");
  const fallbackRows = report.facultyCandidates
    .filter((candidate) => candidate.labUrlKind.startsWith("fallback"))
    .slice(0, 80)
    .map((candidate) => `| ${candidate.graduateSchoolName} | ${candidate.nameKo ?? ""} | ${candidate.labUrl ?? ""} | ${candidate.warnings.join(", ")} |`)
    .join("\n");
  const reviewRows = report.facultyCandidates
    .filter((candidate) =>
      candidate.warnings.length > 0
      || candidate.classification.matches.length === 0
      || candidate.labUrlKind.startsWith("fallback"),
    )
    .slice(0, 100)
    .map((candidate) => `| ${candidate.graduateSchoolName} | ${candidate.nameKo ?? ""} | ${candidate.email ?? ""} | ${candidate.classification.matches.map((match) => match.labelKo).join(", ")} | ${candidate.warnings.join(", ")} |`)
    .join("\n");
  const verificationRows = (report.sampleVerifications ?? [])
    .map((item) => `| ${item.graduateSchoolName} | ${item.name ?? ""} | ${item.status} | ${item.checkedUrl ?? ""} | ${item.evidence} |`)
    .join("\n");

  return `# KHU Graduate Discovery Report

- Source: ${report.sourceUrl}
- Generated At: ${report.generatedAt}
- Graduate schools discovered: ${report.summary.graduateSchoolCount}
- Departments/program buckets: ${report.summary.departmentCount}
- Professors/researcher candidates: ${report.summary.professorCount}
- Non-fallback lab/home URLs: ${report.summary.labUrlCount}
- Fallback URLs: ${report.summary.labUrlFallbackCount}
- Member counts known: ${report.summary.memberCountKnown}
- Member counts unknown: ${report.summary.memberCountUnknown}
- DBLP URLs: ${report.summary.dblpUrlCount}
- Scholar URLs: ${report.summary.scholarUrlCount}
- Classified: ${report.summary.taxonomyClassifiedCount}
- Unclassified: ${report.summary.taxonomyUnclassifiedCount}

## Discovery

| graduate school | homepage | professor search code | faculty URLs |
|---|---|---:|---|
${schoolRows}

## Structure Notes

- The target page is a graduate-admission hub. It does not contain professor records directly; it exposes GO links to graduate-school sites.
- The general graduate school links to KHU's central professor search. That search supports POST filters by graduate-school code and professor detail pages.
- Several graduate-school sites use KHU CMS faculty boards, while tourism, media communication, law, medical, sport, and east-west medicine have separate PHP/board layouts.
- Dedicated lab homepages are sparse. When no Home/Lab/Website URL was found, the candidate keeps a professor profile or faculty-list fallback and is marked for review.
- Member counts are only accepted from discovered external lab/home pages with member/person/team/student sections. Faculty-list pages are never used as member-count sources.

## Counts By Graduate School

${Object.entries(report.summary.countsByGraduateSchool).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Taxonomy Matches

${Object.entries(report.summary.taxonomyMatchCounts).map(([key, value]) => `- ${key}: ${value}`).join("\n") || "- None"}

## Fallback URL Usage

| school | professor | fallback URL | reason |
|---|---|---|---|
${fallbackRows || "|  |  |  |  |"}

## Manual Review Candidates

| school | professor | email | taxonomy | issue |
|---|---|---|---|---|
${reviewRows || "|  |  |  |  |  |"}

## Sample Verification

| school | professor | status | checked URL | evidence |
|---|---|---|---|---|
${verificationRows || "|  |  |  |  |  |"}

## Skipped Pages

${report.skippedPages.map((page) => `- ${page.url}: ${page.reason}`).join("\n") || "- None"}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const maxSchools = Number(args.get("max-schools") ?? 17);
  const maxFacultyPages = Number(args.get("max-faculty-pages") ?? Number.POSITIVE_INFINITY);
  const verifySamples = Number(args.get("verify-samples") ?? 12);
  const enrichMembers = !(args.get("skip-member-enrichment") === true || args.get("skip-member-enrichment") === "true");
  const browser = await createBrowserManager();

  try {
    const report = await discoverKhuGraduateSeeds(browser.context, {
      maxSchools,
      maxFacultyPages,
      enrichMembers,
      enrichConcurrency: Number(args.get("enrich-concurrency") ?? 3),
    });
    report.sampleVerifications = await verifyKhuSamples(browser.context, report.facultyCandidates, verifySamples);

    await mkdir("reports", { recursive: true });
    await mkdir(join("apps", "web", "public", "data"), { recursive: true });
    const reportPath = join("reports", "khu-grad-discovery.json");
    const mdPath = join("reports", "khu-grad-discovery.md");
    const webDataPath = join("apps", "web", "public", "data", "khu-grad-discovery.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(mdPath, renderDiscoveryMarkdown(report), "utf8");
    await writeFile(webDataPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log(JSON.stringify({ reportPath, mdPath, webDataPath, summary: report.summary, skippedPages: report.skippedPages.length }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
