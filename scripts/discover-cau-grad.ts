import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";
import { discoverCauGraduateSeeds } from "../packages/crawler/src/schools/cauGraduateDiscovery.js";

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
  console.log(`Usage: pnpm discover:cau-grad [--max-lab-homepages=120] [--enrich-concurrency=3] [--skip-member-enrichment=true]

Discovers Chung-Ang University graduate/faculty/lab candidates from the TARGET_URL set.
Writes reports/cau-grad-discovery.json and apps/web/public/data/cau-grad-discovery.json without Supabase writes.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const skipMemberEnrichment = String(args.get("skip-member-enrichment") ?? "false") === "true";
  const maxLabHomepages = Number(args.get("max-lab-homepages") ?? Number.POSITIVE_INFINITY);
  const enrichConcurrency = Number(args.get("enrich-concurrency") ?? 3);
  const browser = await createBrowserManager();

  try {
    const report = await discoverCauGraduateSeeds(browser.context, {
      enrichMemberCounts: !skipMemberEnrichment,
      maxLabHomepages,
      enrichConcurrency,
    });

    await mkdir("reports", { recursive: true });
    await mkdir(join("apps", "web", "public", "data"), { recursive: true });
    const reportPath = join("reports", "cau-grad-discovery.json");
    const webDataPath = join("apps", "web", "public", "data", "cau-grad-discovery.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(webDataPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log(
      JSON.stringify(
        {
          reportPath,
          webDataPath,
          summary: report.summary,
          targetPages: report.discovery.targetPages.map((page) => ({
            id: page.id,
            kind: page.pageKind,
            sourceUrl: page.sourceUrl,
            professorListUrls: page.professorListUrls,
          })),
          sampleFacultyCandidates: report.facultyCandidates.slice(0, 12).map((candidate) => ({
            departmentName: candidate.departmentName,
            professorName: candidate.professorName,
            labName: candidate.labName,
            labUrl: candidate.labUrl,
            currentMemberCount: candidate.currentMemberCount,
            scholarUrl: candidate.scholarUrl,
            dblpUrl: candidate.dblpUrl,
            taxonomy: candidate.classification.matches.map((match) => match.labelKo),
            warnings: candidate.validationWarnings,
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
