import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";
import { discoverHufsGraduateSeeds } from "../packages/crawler/src/schools/hufsGraduateDiscovery.js";

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
    if (arg === "--no-member-enrich") {
      args.set("no-member-enrich", true);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: pnpm discover:hufs-grad [--max-departments=55] [--max-professors=300] [--no-member-enrich]

Discovers HUFS graduate departments, faculty/lab candidates, publication counts,
member-count evidence, and taxonomy matches from the official graduate department list.
Writes reports/hufs-grad-discovery.json without Supabase writes.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const maxDepartments = Number(args.get("max-departments") ?? Number.POSITIVE_INFINITY);
  const maxProfessors = Number(args.get("max-professors") ?? Number.POSITIVE_INFINITY);
  const enrichMembers = !args.has("no-member-enrich");
  const browser = await createBrowserManager();

  try {
    const report = await discoverHufsGraduateSeeds(browser.context, {
      maxDepartments,
      maxProfessors,
      enrichMembers,
    });
    await mkdir("reports", { recursive: true });
    const reportPath = join("reports", "hufs-grad-discovery.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log(
      JSON.stringify(
        {
          reportPath,
          summary: report.summary,
          sampleDepartments: report.departments.slice(0, 8).map((department) => ({
            college: department.collegeName,
            name: department.name,
            homepageUrl: department.homepageUrl,
            facultyListUrl: department.facultyListUrl,
            facultyCount: department.facultyCount,
            warnings: department.discoveryWarnings,
          })),
          sampleFacultyCandidates: report.facultyCandidates.slice(0, 12).map((candidate) => ({
            department: candidate.departmentName,
            nameKo: candidate.nameKo,
            researchText: candidate.researchText,
            labUrl: candidate.labUrl,
            labUrlType: candidate.labUrlType,
            currentMemberCount: candidate.currentMemberCount ?? null,
            scholarUrl: candidate.scholarUrl,
            dblpUrl: candidate.dblpUrl,
            publicationCount: candidate.publicationCount,
            taxonomy: candidate.classification.matches.map((match) => match.labelKo),
            warnings: candidate.warnings,
          })),
          failedPages: report.failedPages.slice(0, 10),
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
