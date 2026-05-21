import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { discoverSkkuGraduateSeeds } from "../packages/crawler/src/schools/skkuGraduateDiscovery.js";

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

function parseList(value: string | boolean | undefined): string[] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function printHelp() {
  console.log(`Usage: pnpm discover:skku-grad --college-id=COL009 --max-colleges=1

Discovers SKKU graduate college lab-index pages into a dry-run report.
Writes reports/skku-grad-discovery.json without Supabase writes.

Examples:
  pnpm discover:skku-grad --college-id=COL009
  pnpm discover:skku-grad --max-colleges=13
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const collegeIds = parseList(args.get("college-id"));
  const maxColleges = Number(args.get("max-colleges") ?? (collegeIds ? Number.POSITIVE_INFINITY : 1));
  const report = await discoverSkkuGraduateSeeds({ collegeIds, maxColleges });
  await mkdir("reports", { recursive: true });
  const reportPath = join("reports", "skku-grad-discovery.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        reportPath,
        summary: report.summary,
        skippedColleges: report.skippedColleges.map((item) => ({
          college: item.college.nameKo,
          url: item.college.url,
          reason: item.reason,
        })),
        sampleColleges: report.colleges.slice(0, 8),
        sampleLabCandidates: report.labCandidates.slice(0, 12).map((candidate) => ({
          collegeNameKo: candidate.collegeNameKo,
          departmentName: candidate.departmentName,
          labName: candidate.labName,
          professorName: candidate.professorName,
          researchText: candidate.researchText,
          labUrl: candidate.labUrl,
          taxonomy: candidate.classification.matches.map((match) => match.labelKo),
        })),
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
