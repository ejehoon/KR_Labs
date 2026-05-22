import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";
import { discoverHanyangGraduateSeeds } from "../packages/crawler/src/schools/hanyangGraduateDiscovery.js";

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

function optionalNumber(value: string | boolean | undefined): number | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function printHelp() {
  console.log(`Usage: pnpm discover:hanyang-grad [--max-lab-colleges=11] [--max-lab-departments=120] [--max-research-enrichment-labs=9999] [--max-member-enrichment-labs=9999] [--homepage-enrichment=verified|all|off] [--max-department-homepages=125]

Discovers Hanyang graduate departments and lab cards via Playwright.
Writes reports/hanyang-grad-discovery.json without Supabase writes.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const browser = await createBrowserManager();
  try {
    const report = await discoverHanyangGraduateSeeds(browser.context, {
      maxLabColleges: optionalNumber(args.get("max-lab-colleges")),
      maxLabDepartments: optionalNumber(args.get("max-lab-departments")),
      maxResearchEnrichmentLabs: optionalNumber(args.get("max-research-enrichment-labs")) ?? 9999,
      maxMemberEnrichmentLabs: optionalNumber(args.get("max-member-enrichment-labs")) ?? 9999,
      homepageEnrichmentMode: (args.get("homepage-enrichment") as "verified" | "all" | "off" | undefined) ?? "verified",
      maxDepartmentHomepages: optionalNumber(args.get("max-department-homepages")),
    });
    await mkdir("reports", { recursive: true });
    const reportPath = join("reports", "hanyang-grad-discovery.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log(JSON.stringify({
      reportPath,
      summary: report.summary,
      discoveryReport: report.discoveryReport,
      samplePrograms: report.programs.slice(0, 8).map((program) => ({
        collegeName: program.collegeName,
        name: program.name,
        homepageUrl: program.homepageUrl,
        taxonomy: program.classification.matches.map((match) => match.labelKo),
      })),
      sampleLabCandidates: report.labCandidates.slice(0, 12).map((candidate) => ({
        collegeName: candidate.collegeName,
        departmentName: candidate.departmentName,
        labName: candidate.labName,
        professorName: candidate.professorName,
        labUrl: candidate.labUrl,
        homepageResearchSourceUrl: candidate.homepageResearchSourceUrl,
        memberCount: candidate.currentMemberCount ?? null,
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
