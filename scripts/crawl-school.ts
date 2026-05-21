import "dotenv/config";
import { createCrawlJob, createSupabaseAdmin, finishCrawlJob } from "@kr-labs/db";
import { runDiscoverSchool } from "../packages/crawler/src/index.js";
import { resolveSchoolConfig } from "../packages/crawler/src/index.js";

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
  console.log(`Usage: pnpm crawl:school --school=snu --mode=discover

Options:
  --school=<slug>   School slug. Supported: snu, yonsei, korea, kaist
  --mode=discover   Currently supported mode
  --help            Show this help
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const school = String(args.get("school") ?? "");
  const mode = String(args.get("mode") ?? "discover");
  if (!school) {
    throw new Error("Missing --school. Example: pnpm crawl:school --school=snu --mode=discover");
  }
  if (mode !== "discover") {
    throw new Error(`Unsupported mode "${mode}". The MVP currently supports --mode=discover.`);
  }

  resolveSchoolConfig(school);
  const client = createSupabaseAdmin();
  const job = await createCrawlJob(client, { jobType: "discover_school", schoolSlug: school });

  try {
    const metrics = await runDiscoverSchool({ client, schoolSlug: school, jobId: job.id });
    console.log(JSON.stringify({ jobId: job.id, status: metrics.failedPages > 0 ? "partial_success" : "success", metrics }, null, 2));
  } catch (error) {
    await finishCrawlJob(client, job.id, {
      status: "failed",
      metrics: { fatal: error instanceof Error ? error.message : String(error) },
      errorCount: 1,
    });
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
