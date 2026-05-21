import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";
import { extractEntities } from "../packages/crawler/src/core/entityExtract.js";
import { normalizeUrl } from "../packages/crawler/src/core/linkDiscovery.js";
import { extractPage } from "../packages/crawler/src/core/pageExtract.js";
import { RateLimiter } from "../packages/crawler/src/core/rateLimit.js";
import { isAllowedByRobots } from "../packages/crawler/src/core/robots.js";
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
  console.log(`Usage: pnpm crawl:dry-run --school=snu --max-pages=3

Runs Playwright extraction locally without Supabase writes.
Outputs a JSON sample report under reports/.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const school = String(args.get("school") ?? "snu");
  const maxPages = Number(args.get("max-pages") ?? 3);
  const config = { ...resolveSchoolConfig(school), maxPages };
  const queue = config.seedUrls.map((url) => ({ url, depth: 0 }));
  const visited = new Set<string>();
  const pages = [];
  const errors = [];
  const browser = await createBrowserManager();
  const limiter = new RateLimiter(config.delayMs);
  const userAgent = process.env.CRAWLER_USER_AGENT ?? "KR-Labs-Crawler/0.1 contact@example.com";

  try {
    while (queue.length > 0 && visited.size < config.maxPages) {
      const item = queue.shift();
      if (!item) {
        break;
      }
      const url = normalizeUrl(item.url);
      if (!url || visited.has(url)) {
        continue;
      }
      visited.add(url);

      try {
        if (!(await isAllowedByRobots(url, userAgent, config.allowedDomains))) {
          pages.push({ url, status: "skipped", reason: "robots_or_domain_disallowed" });
          continue;
        }

        await limiter.wait();
        console.log(`Visiting ${url}`);
        const page = await extractPage(browser.context, url, config);
        const entities = extractEntities(page, config);
        pages.push({
          url: page.url,
          finalUrl: page.finalUrl,
          pageType: page.pageType,
          httpStatus: page.httpStatus,
          title: page.title,
          textLength: page.extractedText.length,
          linkCount: page.links.length,
          entityCounts: {
            departments: entities.departments.length,
            professors: entities.professors.length,
            labs: entities.labs.length,
            publications: entities.publications.length,
          },
          sample: {
            departments: entities.departments.slice(0, 50),
            professors: entities.professors.slice(0, 50),
            labs: entities.labs.slice(0, 50),
            publications: entities.publications.slice(0, 50),
          },
        });

        if (item.depth < config.maxDepth) {
          for (const link of page.links.slice(0, 20)) {
            if (visited.size + queue.length >= config.maxPages) {
              break;
            }
            if (link.score >= 5 && !visited.has(link.url)) {
              queue.push({ url: link.url, depth: item.depth + 1 });
            }
          }
        }
      } catch (error) {
        errors.push({
          url,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    await browser.close();
  }

  await mkdir("reports", { recursive: true });
  const report = {
    school,
    maxPages,
    generatedAt: new Date().toISOString(),
    visited: visited.size,
    pages,
    errors,
  };
  const reportPath = join("reports", `${school}-dry-run.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const webDataPath = join("apps", "web", "public", "data", `${school}-dry-run.json`);
  await mkdir(join("apps", "web", "public", "data"), { recursive: true });
  await writeFile(webDataPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ reportPath, webDataPath, visited: visited.size, errors: errors.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
