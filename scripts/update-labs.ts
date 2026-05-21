import "dotenv/config";
import { createCrawlJob, createSupabaseAdmin, finishCrawlJob } from "@kr-labs/db";
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
  console.log(`Usage: pnpm crawl:update-labs --school=snu

The Task 7 updater is scaffolded here so cron wiring has a stable command.
Full hash comparison and lab re-extraction will be implemented after validation is accepted.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }
  const school = String(args.get("school") ?? "");
  if (!school) {
    throw new Error("Missing --school. Example: pnpm crawl:update-labs --school=snu");
  }

  resolveSchoolConfig(school);
  const client = createSupabaseAdmin();
  const job = await createCrawlJob(client, { jobType: "update_labs", schoolSlug: school });
  await finishCrawlJob(client, job.id, {
    status: "partial_success",
    metrics: { message: "Task 7 updater scaffold only. Discover and validation MVP is implemented first." },
    errorCount: 0,
  });
  console.log(JSON.stringify({ jobId: job.id, status: "partial_success", message: "update_labs scaffold is ready for Task 7." }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
