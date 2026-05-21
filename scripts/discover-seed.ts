import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";
import { extractEntities } from "../packages/crawler/src/core/entityExtract.js";
import { normalizeUrl } from "../packages/crawler/src/core/linkDiscovery.js";
import { extractPage } from "../packages/crawler/src/core/pageExtract.js";
import { classifyResearchText } from "../packages/crawler/src/taxonomy/researchTaxonomy.js";
import type { CrawlMetrics, ExtractedPage, SchoolCrawlerConfig } from "../packages/crawler/src/types.js";

type QueueItem = {
  url: string;
  depth: number;
};

type SeedDiscoveryPage = {
  url: string;
  finalUrl?: string;
  status?: number;
  title?: string;
  pageType: string;
  textLength: number;
  headings: string[];
  topLinks: Array<{ url: string; text: string; score: number; pageType: string }>;
  entityCounts: {
    departments: number;
    professors: number;
    labs: number;
    publications: number;
  };
  taxonomy: {
    status?: string;
    matches: Array<{ fieldId: string; labelKo: string; confidence: number; evidence: string[] }>;
    suggestions: Array<{ suggestedLabel: string; reason: string; evidence: string[] }>;
    rejectedMatches?: Array<{ fieldId: string; labelKo: string; confidence: number; evidence: string[] }>;
  };
  reviewReasons: string[];
};

type SeedDiscoveryReport = {
  seedUrl: string;
  schoolSlug: string;
  schoolName: string;
  generatedAt: string;
  config: {
    allowedDomains: string[];
    maxDepth: number;
    maxPages: number;
    minLinkScore: number;
  };
  summary: CrawlMetrics & {
    pageTypeCounts: Record<string, number>;
    taxonomyMatchedPages: number;
    taxonomySuggestionPages: number;
    reviewPageCount: number;
  };
  pages: SeedDiscoveryPage[];
  failedPages: Array<{ url: string; reason: string }>;
  nextActions: string[];
};

type RecipeBook = {
  version: 1;
  updatedAt: string;
  recipes: Array<{
    schoolSlug: string;
    schoolName: string;
    seedUrls: string[];
    allowedDomains: string[];
    lastReportPath: string;
    lastRunAt: string;
    pageTypeCounts: Record<string, number>;
    notes: string[];
    fixes: Array<{ date: string; description: string; files?: string[] }>;
  }>;
};

const defaultDepartmentKeywords = ["학과", "전공", "대학원", "department", "graduate", "program"];
const defaultFacultyKeywords = ["교수", "교수진", "교원", "faculty", "professor", "people"];
const defaultLabKeywords = ["연구실", "실험실", "랩", "lab", "laboratory", "research", "group"];

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      args.set("help", true);
      continue;
    }
    if (arg.startsWith("--") && !arg.includes("=")) {
      args.set(arg.slice(2), true);
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      args.set(match[1] ?? "", match[2] ?? "");
    }
  }
  return args;
}

function optionalNumber(value: string | boolean | undefined, fallback: number): number {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function csv(value: string | boolean | undefined): string[] {
  return typeof value === "string"
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "seed";
}

function hostFromUrl(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

function buildConfig(input: {
  seedUrl: string;
  schoolSlug: string;
  schoolName: string;
  allowedDomains: string[];
  maxDepth: number;
  maxPages: number;
}): SchoolCrawlerConfig {
  return {
    slug: input.schoolSlug,
    nameKo: input.schoolName,
    homepageUrl: input.seedUrl,
    allowedDomains: input.allowedDomains,
    seedUrls: [input.seedUrl],
    includeUrlPatterns: [/학과|전공|교수|교원|연구실|연구|department|faculty|professor|people|lab|research/i],
    excludeUrlPatterns: [/login|signin|privacy|calendar|notice|board|공지|입학|admission/i],
    departmentKeywords: defaultDepartmentKeywords,
    facultyKeywords: defaultFacultyKeywords,
    labKeywords: defaultLabKeywords,
    maxDepth: input.maxDepth,
    maxPages: input.maxPages,
    concurrency: 1,
    delayMs: 250,
  };
}

function initialMetrics(): CrawlMetrics {
  return {
    visitedPages: 0,
    successfulPages: 0,
    failedPages: 0,
    skippedPages: 0,
    departmentsFound: 0,
    professorsFound: 0,
    labsFound: 0,
    publicationsFound: 0,
    reviewItemsCreated: 0,
  };
}

function reviewReasons(page: ExtractedPage, entityCounts: SeedDiscoveryPage["entityCounts"], taxonomy: ReturnType<typeof classifyResearchText>): string[] {
  const reasons: string[] = [];
  if (page.extractedText.length < 200) {
    reasons.push("본문 텍스트가 짧아 Playwright 렌더링/권한/인코딩 확인 필요");
  }
  if (entityCounts.departments + entityCounts.professors + entityCounts.labs + entityCounts.publications === 0) {
    reasons.push("generic extractor가 엔티티를 찾지 못함");
  }
  if (taxonomy.status !== "matched") {
    reasons.push(taxonomy.status === "new_category_candidate" ? "신규 taxonomy 후보 있음" : "taxonomy 미분류");
  }
  return reasons;
}

function pageSummary(page: ExtractedPage): string {
  return [
    page.title,
    page.headings.slice(0, 6).join(" | "),
    page.extractedText.slice(0, 2000),
  ].filter(Boolean).join(" | ");
}

function nextActions(report: SeedDiscoveryReport): string[] {
  const actions: string[] = [];
  if (report.summary.reviewPageCount > 0) {
    actions.push("reviewReasons가 있는 페이지를 확인해 학교별 adapter나 selector를 추가하세요.");
  }
  if (report.summary.taxonomySuggestionPages > 0) {
    actions.push("taxonomy suggestions를 검토해 기존 alias로 흡수하거나 새 leaf category를 제안하세요.");
  }
  if (report.summary.professorsFound === 0 && report.summary.labsFound === 0) {
    actions.push("교수/연구실 후보가 없으므로 메뉴 JS, iframe, 탭 클릭, PDF/HWP 첨부 여부를 확인하세요.");
  }
  if (actions.length === 0) {
    actions.push("seed 탐색이 안정적입니다. 필요하면 학교별 discover script 또는 adapter로 승격하세요.");
  }
  return actions;
}

async function updateRecipeBook(path: string, report: SeedDiscoveryReport) {
  let book: RecipeBook = { version: 1, updatedAt: new Date().toISOString(), recipes: [] };
  try {
    book = JSON.parse(await readFile(path, "utf8")) as RecipeBook;
  } catch {
    // Create the recipe book on first run.
  }

  const existing = book.recipes.find((recipe) => recipe.schoolSlug === report.schoolSlug);
  const next = {
    schoolSlug: report.schoolSlug,
    schoolName: report.schoolName,
    seedUrls: [report.seedUrl],
    allowedDomains: report.config.allowedDomains,
    lastReportPath: join("reports", `seed-discovery-${report.schoolSlug}.json`),
    lastRunAt: report.generatedAt,
    pageTypeCounts: report.summary.pageTypeCounts,
    notes: existing?.notes ?? [],
    fixes: existing?.fixes ?? [],
  };

  book = {
    version: 1,
    updatedAt: new Date().toISOString(),
    recipes: [...book.recipes.filter((recipe) => recipe.schoolSlug !== report.schoolSlug), next]
      .sort((a, b) => a.schoolSlug.localeCompare(b.schoolSlug)),
  };

  await mkdir("docs", { recursive: true });
  await writeFile(path, `${JSON.stringify(book, null, 2)}\n`, "utf8");
}

function printHelp() {
  console.log(`Usage: pnpm discover:seed --url=<seed-url> [--school=<slug>] [--name=<school-name>] [--max-pages=25] [--max-depth=2] [--allowed-domains=a.ac.kr,b.ac.kr] [--update-recipe]

Runs a Playwright dry-run from one seed URL, classifies page roles, extracts generic entities,
and writes reports/seed-discovery-<school>.json. It does not write to Supabase.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const seedUrl = normalizeUrl(String(args.get("url") ?? ""));
  if (!seedUrl) {
    throw new Error("Missing --url. Example: pnpm discover:seed --url=https://korea.sogang.ac.kr/korea/index_new.html");
  }
  const host = hostFromUrl(seedUrl);
  const schoolSlug = String(args.get("school") ?? slugify(host));
  const schoolName = String(args.get("name") ?? schoolSlug);
  const maxPages = optionalNumber(args.get("max-pages"), 25);
  const maxDepth = optionalNumber(args.get("max-depth"), 2);
  const minLinkScore = optionalNumber(args.get("min-link-score"), 5);
  const allowedDomains = [...new Set([host, ...csv(args.get("allowed-domains")).map((domain) => domain.replace(/^www\./, "").toLowerCase())])];
  const config = buildConfig({ seedUrl, schoolSlug, schoolName, allowedDomains, maxPages, maxDepth });
  const metrics = initialMetrics();
  const pageTypeCounts: Record<string, number> = {};
  const pages: SeedDiscoveryPage[] = [];
  const failedPages: SeedDiscoveryReport["failedPages"] = [];
  const queue: QueueItem[] = [{ url: seedUrl, depth: 0 }];
  const visited = new Set<string>();
  const browser = await createBrowserManager();

  try {
    while (queue.length > 0 && visited.size < maxPages) {
      const item = queue.shift();
      if (!item) {
        break;
      }
      const normalized = normalizeUrl(item.url);
      if (!normalized || visited.has(normalized)) {
        metrics.skippedPages += 1;
        continue;
      }
      visited.add(normalized);
      metrics.visitedPages += 1;

      try {
        const page = await extractPage(browser.context, normalized, config);
        const entities = extractEntities(page, config);
        const entityCounts = {
          departments: entities.departments.length,
          professors: entities.professors.length,
          labs: entities.labs.length,
          publications: entities.publications.length,
        };
        const taxonomy = classifyResearchText(pageSummary(page));
        const reasons = reviewReasons(page, entityCounts, taxonomy);

        metrics.successfulPages += 1;
        metrics.departmentsFound += entityCounts.departments;
        metrics.professorsFound += entityCounts.professors;
        metrics.labsFound += entityCounts.labs;
        metrics.publicationsFound += entityCounts.publications;
        metrics.reviewItemsCreated += reasons.length > 0 ? 1 : 0;
        pageTypeCounts[page.pageType] = (pageTypeCounts[page.pageType] ?? 0) + 1;

        pages.push({
          url: page.url,
          finalUrl: page.finalUrl,
          status: page.httpStatus,
          title: page.title,
          pageType: page.pageType,
          textLength: page.extractedText.length,
          headings: page.headings.slice(0, 12),
          topLinks: page.links.slice(0, 20).map((link) => ({
            url: link.url,
            text: link.text,
            score: link.score,
            pageType: link.pageType,
          })),
          entityCounts,
          taxonomy: {
            status: taxonomy.status,
            matches: taxonomy.matches,
            suggestions: taxonomy.suggestions,
            rejectedMatches: taxonomy.rejectedMatches,
          },
          reviewReasons: reasons,
        });

        if (item.depth < maxDepth) {
          for (const link of page.links) {
            if (visited.size + queue.length >= maxPages) {
              break;
            }
            if (link.score >= minLinkScore && !visited.has(link.url)) {
              queue.push({ url: link.url, depth: item.depth + 1 });
            }
          }
        }
      } catch (error) {
        metrics.failedPages += 1;
        failedPages.push({ url: normalized, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  } finally {
    await browser.close();
  }

  const report: SeedDiscoveryReport = {
    seedUrl,
    schoolSlug,
    schoolName,
    generatedAt: new Date().toISOString(),
    config: {
      allowedDomains,
      maxDepth,
      maxPages,
      minLinkScore,
    },
    summary: {
      ...metrics,
      pageTypeCounts,
      taxonomyMatchedPages: pages.filter((page) => page.taxonomy.status === "matched").length,
      taxonomySuggestionPages: pages.filter((page) => page.taxonomy.suggestions.length > 0).length,
      reviewPageCount: pages.filter((page) => page.reviewReasons.length > 0).length,
    },
    pages,
    failedPages,
    nextActions: [],
  };
  report.nextActions = nextActions(report);

  await mkdir("reports", { recursive: true });
  const reportPath = join("reports", `seed-discovery-${schoolSlug}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (args.get("update-recipe") === true) {
    await updateRecipeBook("docs/crawler-recipes.json", report);
  }

  console.log(JSON.stringify({
    reportPath,
    recipeUpdated: args.get("update-recipe") === true,
    summary: report.summary,
    nextActions: report.nextActions,
    samplePages: report.pages.slice(0, 5).map((page) => ({
      pageType: page.pageType,
      title: page.title,
      finalUrl: page.finalUrl,
      entityCounts: page.entityCounts,
      taxonomy: page.taxonomy.matches.map((match) => match.labelKo),
      suggestions: page.taxonomy.suggestions.map((suggestion) => suggestion.suggestedLabel),
      reviewReasons: page.reviewReasons,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
