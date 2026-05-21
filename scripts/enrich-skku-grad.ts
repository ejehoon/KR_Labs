import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { enrichLabMemberCount } from "../packages/crawler/src/core/labMetrics.js";

type ResearchClassification = {
  matches?: Array<{ labelKo: string; evidence?: string[] }>;
  suggestions?: Array<{ suggestedLabel: string; evidence?: string[] }>;
};

type SkkuLabCandidate = {
  collegeNameKo: string;
  departmentName: string;
  labName?: string;
  professorName?: string;
  researchText?: string;
  labUrl?: string;
  sourceUrl: string;
  classification?: ResearchClassification;
  currentMemberCount?: number;
  memberCountBreakdown?: Record<string, number>;
  memberCountSourceUrl?: string;
  memberCountCrawledAt?: string;
  memberCountMethod?: string;
  enrichmentWarnings?: string[];
};

type SkkuDiscoveryReport = {
  sourceUrl: string;
  generatedAt: string;
  colleges: unknown[];
  labCandidates: SkkuLabCandidate[];
  skippedColleges?: unknown[];
  summary: Record<string, unknown>;
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
  console.log(`Usage: pnpm enrich:skku-grad [--report=reports/skku-grad-discovery.json] [--output=reports/skku-grad-discovery.json] [--max-candidates=80] [--concurrency=4] [--professor=박진영] [--lab-url-contains=hli.skku.edu]

Enriches SKKU lab candidates with current member counts by visiting lab homepage
member pages. Alumni/Former/Past sections are excluded.
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

function updateSummary(report: SkkuDiscoveryReport) {
  report.summary = {
    ...report.summary,
    enrichment: {
      labCandidates: report.labCandidates.length,
      withLabUrl: report.labCandidates.filter((row) => row.labUrl).length,
      withMemberCount: report.labCandidates.filter((row) => typeof row.currentMemberCount === "number").length,
      memberCountMissing: report.labCandidates.filter((row) => row.labUrl && typeof row.currentMemberCount !== "number").length,
    },
  };
}

function isUnreliableMemberCountSource(sourceUrl: string | undefined): boolean {
  if (!sourceUrl) {
    return false;
  }
  return /(?:^|[\/_-])(?:publications?|papers?|projects?|research|current[-_]?news|news|awards?|posts?|contact|articles?|policy|privacy|terms|agreement|signup|mypage|current[-_]?students|admissions?|welfare|support|schoollife\d*|activity|exchange[-_]?students|exhange[-_]?students|cscience[-_]?current|student[-_]?scg|student[-_]?sw|student[-_]?global[-_]?stu|student[-_]?(?:[a-z]+[-_])*[a-z]*stu|research[-_]?biotech|alumi|links?|group[-_]?photos?|photos?|galler(?:y|ies))(?:[\/_.-]|$|[?#])/i.test(sourceUrl)
    || /(?:^|\/)(?:prof|professor|faculty|principal(?:[-_]?investigator)?|pi|fulltime)(?:[-_/]|$|[?#])/i.test(sourceUrl)
    || /#role-member-pages$|faculty|professor|교수진|전임교원|교원소개|login(?:\.php)?|give\.skku\.edu|ihappynanum\.com|samsunghospital\.com\/home\/future\/|success\.skku\.edu\/success\/index\.do|coefs\.charlotte\.edu\/(?:ttxu|hzhang3)|coefs\.uncc\.edu\/hcho17|^https?:\/\/(?:www\.)?skku\.edu\/?$|^https?:\/\/(?:www\.)?skkumed\.ac\.kr\/?$/i.test(sourceUrl);
}

function isSchoolIndexFallbackLabUrl(labUrl: string | undefined): boolean {
  return /gradschool\.skku\.edu\/grad\/prepare\/laboratory_01\.htm\?college_id=/i.test(labUrl ?? "");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const reportPath = String(args.get("report") ?? "reports/skku-grad-discovery.json");
  const outputPath = String(args.get("output") ?? reportPath);
  const maxCandidatesArg = args.get("max-candidates");
  const maxCandidates = typeof maxCandidatesArg === "string" ? Number(maxCandidatesArg) : undefined;
  const offset = Number(args.get("offset") ?? 0);
  const concurrency = Number(args.get("concurrency") ?? 4);
  const force = args.get("force") === true || args.get("force") === "true";
  const professorFilter = typeof args.get("professor") === "string" ? String(args.get("professor")) : undefined;
  const labUrlContains = typeof args.get("lab-url-contains") === "string" ? String(args.get("lab-url-contains")).toLowerCase() : undefined;
  const departmentFilter = typeof args.get("department") === "string" ? String(args.get("department")) : undefined;
  const report = JSON.parse(await readFile(reportPath, "utf8")) as SkkuDiscoveryReport;
  const indexedCandidates = report.labCandidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => Boolean(candidate.labUrl))
    .filter(({ candidate }) => !isSchoolIndexFallbackLabUrl(candidate.labUrl))
    .filter(({ candidate }) => !professorFilter || candidate.professorName === professorFilter)
    .filter(({ candidate }) => !departmentFilter || candidate.departmentName === departmentFilter)
    .filter(({ candidate }) => !labUrlContains || candidate.labUrl?.toLowerCase().includes(labUrlContains))
    .filter(({ candidate }) => force || typeof candidate.currentMemberCount !== "number")
    .slice(offset, maxCandidates ? offset + maxCandidates : undefined);

  const enriched = await mapLimit(indexedCandidates, concurrency, async ({ candidate, index }, localIndex) => {
    const result = await enrichLabMemberCount(candidate.labUrl);
    const warnings = [...(candidate.enrichmentWarnings ?? [])];
    const unreliableSource = isUnreliableMemberCountSource(result.sourceUrl);
    if (unreliableSource) {
      warnings.push("member_count_unreliable_source");
    }
    const safeResult = unreliableSource ? { count: undefined, breakdown: undefined, sourceUrl: undefined, method: undefined } : result;
    if (!safeResult.count) {
      warnings.push("member_count_not_found");
    }

    const next: SkkuLabCandidate = {
      ...candidate,
      currentMemberCount: safeResult.count ?? (force ? undefined : candidate.currentMemberCount),
      memberCountBreakdown: safeResult.breakdown ?? (force ? undefined : candidate.memberCountBreakdown),
      memberCountSourceUrl: safeResult.sourceUrl ?? (force ? undefined : candidate.memberCountSourceUrl),
      memberCountCrawledAt: safeResult.count ? new Date().toISOString() : (force ? undefined : candidate.memberCountCrawledAt),
      memberCountMethod: safeResult.method ?? (force ? undefined : candidate.memberCountMethod),
      enrichmentWarnings: warnings.length > 0 ? [...new Set(warnings)] : undefined,
    };

    console.log(
      JSON.stringify({
        progress: `${localIndex + 1}/${indexedCandidates.length}`,
        index,
        lab: candidate.labName,
        professor: candidate.professorName,
        labUrl: candidate.labUrl,
        memberCount: safeResult.count ?? null,
        sourceUrl: safeResult.sourceUrl,
        ignoredSourceUrl: unreliableSource ? result.sourceUrl : undefined,
      }),
    );

    return { index, candidate: next };
  });

  for (const item of enriched) {
    report.labCandidates[item.index] = item.candidate;
  }

  updateSummary(report);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        outputPath,
        processed: indexedCandidates.length,
        enrichment: report.summary.enrichment,
        iris: report.labCandidates.find((row) => row.labUrl && /iris\.skku\.edu/i.test(row.labUrl)),
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
