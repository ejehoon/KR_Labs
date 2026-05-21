import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";
import { discoverUosGraduateSeeds } from "../packages/crawler/src/schools/uosGraduateDiscovery.js";

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
  console.log(`Usage: pnpm discover:uos-grad [--max-departments=43] [--max-profiles=999] [--max-member-enrich=999]

Discovers University of Seoul graduate departments, faculty/lab candidates,
taxonomy matches, and conservative member counts from explicit lab homepages.
Writes reports/uos-grad-discovery.json and apps/web/public/data/uos-grad-discovery.json.
`);
}

function renderDiscoveryMarkdown(report: Awaited<ReturnType<typeof discoverUosGraduateSeeds>>) {
  const categoryRows = Object.entries(report.summary.countsByCategory)
    .map(([category, count]) => `| ${category} | ${report.departments.filter((department) => department.category === category).length} | ${count} |`)
    .join("\n");
  const fallbackRows = report.facultyCandidates
    .filter((candidate) => candidate.labUrlSource !== "external_lab_homepage")
    .slice(0, 60)
    .map((candidate) => `| ${candidate.sourceDepartmentName} | ${candidate.nameKo ?? ""} | ${candidate.labUrl ?? ""} | ${candidate.labUrlSource} |`)
    .join("\n");
  const failedRows = report.failedPages
    .map((page) => `| ${page.url} | ${page.reason.replace(/\|/g, "/")} |`)
    .join("\n");

  return `# UOS Graduate Discovery Report

- Source: ${report.sourceUrl}
- Generated At: ${report.generatedAt}
- Categories: ${report.discovery.categoryCount}
- Departments: ${report.summary.departmentCount}
- Professor candidates: ${report.summary.professorCount}
- Professor list URLs: ${report.discovery.professorListUrlCount}
- External lab URLs: ${report.summary.externalLabUrlCount}
- Fallback lab URLs: ${report.summary.fallbackLabUrlCount}
- Member counts known: ${report.summary.memberCountKnown}
- DBLP URLs: ${report.summary.dblpUrlCount}
- Scholar URLs: ${report.summary.scholarUrlCount}

## Structure

- Professor detail pattern: ${report.discovery.professorDetailPattern}
- Lab homepage patterns: ${report.discovery.labHomepagePatterns.join("; ")}
- Member page exploration: ${report.discovery.memberPageExploration}
- Publication exploration: ${report.discovery.publicationExploration}

## Category Coverage

| category | departments | professor candidates |
|---|---:|---:|
${categoryRows}

## Difficulties

${report.discovery.difficulties.map((item) => `- ${item}`).join("\n")}

## Adapter Design

${report.discovery.adapterDesign.map((item) => `- ${item}`).join("\n")}

## Fallback URL Samples

| department | professor | fallback URL | source |
|---|---|---|---|
${fallbackRows || "|  |  |  |  |"}

## Failed Pages

| URL | reason |
|---|---|
${failedRows || "|  |  |"}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const maxDepartments = Number(args.get("max-departments") ?? Number.POSITIVE_INFINITY);
  const maxProfiles = Number(args.get("max-profiles") ?? Number.POSITIVE_INFINITY);
  const maxMemberEnrich = Number(args.get("max-member-enrich") ?? Number.POSITIVE_INFINITY);
  const browser = await createBrowserManager();

  try {
    const report = await discoverUosGraduateSeeds(browser.context, {
      maxDepartments,
      maxProfiles,
      maxMemberEnrich,
    });
    await mkdir("reports", { recursive: true });
    await mkdir(join("apps", "web", "public", "data"), { recursive: true });

    const reportPath = join("reports", "uos-grad-discovery.json");
    const mdPath = join("reports", "uos-grad-discovery-report.md");
    const webDataPath = join("apps", "web", "public", "data", "uos-grad-discovery.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(webDataPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(mdPath, renderDiscoveryMarkdown(report), "utf8");

    console.log(JSON.stringify({
      reportPath,
      mdPath,
      webDataPath,
      summary: report.summary,
      sampleDepartments: report.departments.slice(0, 8).map((department) => ({
        category: department.category,
        name: department.name,
        facultyUrl: department.facultyUrl,
        taxonomy: department.classification.matches.map((match) => match.labelKo),
        warnings: department.warnings,
      })),
      sampleFacultyCandidates: report.facultyCandidates.slice(0, 12).map((candidate) => ({
        department: candidate.sourceDepartmentName,
        name: candidate.nameKo,
        researchText: candidate.researchText,
        labUrl: candidate.labUrl,
        labUrlSource: candidate.labUrlSource,
        currentMemberCount: candidate.currentMemberCount ?? null,
        taxonomy: candidate.classification.matches.map((match) => match.labelKo),
        warnings: candidate.warnings,
      })),
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
