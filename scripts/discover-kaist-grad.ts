import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";
import { discoverKaistGraduateSeeds } from "../packages/crawler/src/schools/kaistGraduateDiscovery.js";

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
  console.log(`Usage: pnpm discover:kaist-grad --college="AI 대학" --max-lab-probes=5

Discovers KAIST graduate department homepage links from the admissions page,
then probes department faculty/lab links without writing to Supabase.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const college = String(args.get("college") ?? "AI 대학");
  const maxLabProbes = Number(args.get("max-lab-probes") ?? 5);
  const browser = await createBrowserManager();

  try {
    const report = await discoverKaistGraduateSeeds(browser.context, {
      collegeNames: college.split(",").map((item) => item.trim()).filter(Boolean),
      maxLabProbesPerDepartment: maxLabProbes,
    });
    await mkdir("reports", { recursive: true });
    const reportPath = join("reports", "kaist-grad-discovery.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    const summary = report.departments.map((department) => ({
      departmentName: department.departmentName,
      homepageUrl: department.homepageUrl,
      admissionUrl: department.admissionUrl,
      facultyCount: department.faculty.length,
      probedLabs: department.labProbes.length,
      memberPagesFound: department.labProbes.filter((probe) => probe.memberPageUrl).length,
      publicationPagesFound: department.labProbes.filter((probe) => probe.publicationPageUrl).length,
    }));

    console.log(JSON.stringify({ reportPath, departments: summary }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
