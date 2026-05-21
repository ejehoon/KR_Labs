import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";
import { cleanText } from "../packages/crawler/src/core/html.js";
import { enrichLabPublicationCount } from "../packages/crawler/src/core/labPublicationMetrics.js";
import { enrichLabResearchEvidence } from "../packages/crawler/src/core/labResearchEvidence.js";
import { classifyResearchText, type ResearchClassification } from "../packages/crawler/src/taxonomy/researchTaxonomy.js";

type SkkuLabCandidate = {
  collegeNameKo: string;
  departmentName: string;
  labName?: string;
  professorName?: string;
  researchText?: string;
  labUrl?: string;
  sourceUrl: string;
  classification?: ResearchClassification;
  classificationEvidenceText?: string;
  homepageResearchText?: string;
  homepageResearchSourceUrl?: string;
  researchEvidenceWarnings?: string[];
  paperCount?: number;
  paperCountSource?: "publication_page";
  paperCountSourceUrl?: string;
  publicationEvidenceWarnings?: string[];
};

type SkkuDiscoveryReport = {
  generatedAt: string;
  labCandidates: SkkuLabCandidate[];
  summary?: Record<string, unknown>;
  researchPublicationEnrichedAt?: string;
};

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
  console.log(`Usage: pnpm enrich:skku-grad:research-publications [--report=reports/skku-grad-discovery.json] [--public=apps/web/public/data/skku-grad-discovery.json] [--max-candidates=545] [--concurrency=3] [--force=true]

Visits SKKU lab homepages with Playwright, extracts lab intro/Research text for
taxonomy evidence, and counts publications only when a clear publications page
is found. Counts are intentionally conservative.
`);
}

async function mapLimit<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index] as T, index);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, run));
  return results;
}

function isSchoolIndexFallbackLabUrl(labUrl: string | undefined): boolean {
  return /gradschool\.skku\.edu\/grad\/prepare\/laboratory_01\.htm\?college_id=/i.test(labUrl ?? "");
}

function classificationEvidence(candidate: SkkuLabCandidate): string {
  return [
    candidate.labName,
    candidate.homepageResearchText,
    candidate.researchText,
    candidate.departmentName,
    candidate.collegeNameKo,
  ]
    .map((value) => cleanText(value))
    .filter((value): value is string => Boolean(value))
    .join(" | ");
}

function updateSummary(report: SkkuDiscoveryReport) {
  const paperCounts = report.labCandidates.filter((row) => typeof row.paperCount === "number");
  report.summary = {
    ...(report.summary ?? {}),
    researchPublicationEnrichment: {
      labCandidates: report.labCandidates.length,
      withHomepageResearchText: report.labCandidates.filter((row) => row.homepageResearchText).length,
      withHomepageResearchSourceUrl: report.labCandidates.filter((row) => row.homepageResearchSourceUrl).length,
      withPublicationPagePaperCount: paperCounts.length,
      publicationPagePaperSum: paperCounts.reduce((total, row) => total + (row.paperCount ?? 0), 0),
    },
  };
}

async function enrichReport(reportPath: string, options: { maxCandidates?: number; concurrency: number; force: boolean }) {
  const report = JSON.parse(await readFile(reportPath, "utf8")) as SkkuDiscoveryReport;
  const browser = await createBrowserManager();

  try {
    const indexedCandidates = report.labCandidates
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => Boolean(candidate.labUrl))
      .filter(({ candidate }) => !isSchoolIndexFallbackLabUrl(candidate.labUrl))
      .filter(({ candidate }) => options.force || !candidate.homepageResearchText || typeof candidate.paperCount !== "number")
      .slice(0, options.maxCandidates);

    const enriched = await mapLimit(indexedCandidates, options.concurrency, async ({ candidate, index }, localIndex) => {
      const [researchEvidence, publicationCount] = await Promise.all([
        enrichLabResearchEvidence(browser.context, candidate.labUrl, candidate.labName),
        enrichLabPublicationCount(browser.context, candidate.labUrl),
      ]);

      const next: SkkuLabCandidate = {
        ...candidate,
        homepageResearchText: researchEvidence.text ?? (options.force ? undefined : candidate.homepageResearchText),
        homepageResearchSourceUrl: researchEvidence.sourceUrl ?? (options.force ? undefined : candidate.homepageResearchSourceUrl),
        researchEvidenceWarnings: researchEvidence.warnings.length > 0 ? researchEvidence.warnings : (options.force ? undefined : candidate.researchEvidenceWarnings),
        paperCount: publicationCount.count ?? (options.force ? undefined : candidate.paperCount),
        paperCountSource: publicationCount.count ? "publication_page" : (options.force ? undefined : candidate.paperCountSource),
        paperCountSourceUrl: publicationCount.sourceUrl ?? (options.force ? undefined : candidate.paperCountSourceUrl),
        publicationEvidenceWarnings: publicationCount.warnings.length > 0 ? publicationCount.warnings : (options.force ? undefined : candidate.publicationEvidenceWarnings),
      };
      next.classificationEvidenceText = classificationEvidence(next);
      next.classification = classifyResearchText(next.classificationEvidenceText);

      console.log(
        JSON.stringify({
          progress: `${localIndex + 1}/${indexedCandidates.length}`,
          index,
          professor: candidate.professorName,
          lab: candidate.labName,
          labUrl: candidate.labUrl,
          homepageResearchSourceUrl: next.homepageResearchSourceUrl,
          paperCount: next.paperCount ?? null,
          paperCountSourceUrl: next.paperCountSourceUrl,
          taxonomy: next.classification.matches.map((match) => match.labelKo).slice(0, 5),
        }),
      );

      return { index, candidate: next };
    });

    for (const item of enriched) {
      report.labCandidates[item.index] = item.candidate;
    }

    report.researchPublicationEnrichedAt = new Date().toISOString();
    updateSummary(report);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    return {
      reportPath,
      processed: indexedCandidates.length,
      summary: report.summary?.researchPublicationEnrichment,
    };
  } finally {
    await browser.close();
  }
}

async function copyReport(sourcePath: string, publicPath: string) {
  const report = await readFile(sourcePath, "utf8");
  await mkdir(dirname(publicPath), { recursive: true });
  await writeFile(publicPath, report, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const reportPath = String(args.get("report") ?? "reports/skku-grad-discovery.json");
  const publicPath = String(args.get("public") ?? "apps/web/public/data/skku-grad-discovery.json");
  const maxCandidatesArg = args.get("max-candidates");
  const maxCandidates = typeof maxCandidatesArg === "string" ? Number(maxCandidatesArg) : undefined;
  const concurrency = Number(args.get("concurrency") ?? 3);
  const force = args.get("force") === true || args.get("force") === "true";

  const result = await enrichReport(reportPath, { maxCandidates, concurrency, force });
  await copyReport(reportPath, publicPath);

  console.log(JSON.stringify({ ...result, publicPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
