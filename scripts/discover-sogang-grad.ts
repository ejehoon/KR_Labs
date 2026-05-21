import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";
import { discoverSogangGraduateSeeds } from "../packages/crawler/src/schools/sogangGraduateDiscovery.js";

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
  console.log(`Usage: pnpm discover:sogang-grad --max-programs=51 --max-pages-per-program=4

Discovers Sogang graduate programs, faculty/lab candidates, and taxonomy matches.
Writes reports/sogang-grad-discovery.json without Supabase writes.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const maxPrograms = Number(args.get("max-programs") ?? 51);
  const maxPagesPerProgram = Number(args.get("max-pages-per-program") ?? 4);
  const browser = await createBrowserManager();

  try {
    const report = await discoverSogangGraduateSeeds(browser.context, { maxPrograms, maxPagesPerProgram });
    await mkdir("reports", { recursive: true });
    const reportPath = join("reports", "sogang-grad-discovery.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log(
      JSON.stringify(
        {
          reportPath,
          summary: report.summary,
          samplePrograms: report.programs.slice(0, 8).map((program) => ({
            series: program.series,
            name: program.name,
            type: program.type,
            homepageUrl: program.homepageUrl,
            taxonomy: program.classification.matches.map((match) => match.labelKo),
          })),
          sampleFacultyCandidates: report.facultyCandidates.slice(0, 12).map((candidate) => ({
            sourceProgramName: candidate.sourceProgramName,
            affiliation: candidate.affiliation,
            nameKo: candidate.nameKo,
            researchText: candidate.researchText,
            labUrl: candidate.labUrl,
            sourceParser: candidate.sourceParser,
            taxonomy: candidate.classification.matches.map((match) => match.labelKo),
          })),
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
