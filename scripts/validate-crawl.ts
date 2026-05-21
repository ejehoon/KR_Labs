import "dotenv/config";
import { createCrawlJob, createSupabaseAdmin, finishCrawlJob } from "@kr-labs/db";
import { buildValidationReport, writeValidationReport } from "../packages/crawler/src/core/report.js";
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
  console.log(`Usage: pnpm crawl:validate --school=snu [--job-id=<crawl-job-id>]

Options:
  --school=<slug>      School slug. Supported: snu, yonsei, korea, kaist
  --job-id=<job-id>    Optional crawl job id to validate
  --help               Show this help
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const school = String(args.get("school") ?? "");
  const jobId = args.get("job-id") ? String(args.get("job-id")) : undefined;
  if (!school) {
    throw new Error("Missing --school. Example: pnpm crawl:validate --school=snu");
  }

  resolveSchoolConfig(school);
  const client = createSupabaseAdmin();
  const validateJob = await createCrawlJob(client, { jobType: "validate", schoolSlug: school });
  const report = await buildValidationReport(client, school, jobId);
  const paths = await writeValidationReport(report);

  await finishCrawlJob(client, validateJob.id, {
    status: report.status === "success" ? "success" : "partial_success",
    metrics: {
      validatedJobId: report.jobId,
      pages: report.pages,
      counts: report.counts,
      reportPaths: paths,
    },
    errorCount: report.pages.failed,
  });

  console.log(JSON.stringify({ validationJobId: validateJob.id, report: paths }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
