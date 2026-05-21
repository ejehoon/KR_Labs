import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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
};

type SkkuDiscoveryReport = {
  generatedAt: string;
  colleges: unknown[];
  labCandidates: SkkuLabCandidate[];
  summary?: Record<string, unknown>;
  taxonomyReclassifiedAt?: string;
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
  console.log(`Usage: pnpm reclassify:skku-grad [--report=reports/skku-grad-discovery.json] [--public=apps/web/public/data/skku-grad-discovery.json]

Re-runs the central KR_Labs taxonomy against an existing enriched SKKU report.
`);
}

function classificationEvidence(candidate: SkkuLabCandidate): string {
  return [
    candidate.labName,
    candidate.homepageResearchText,
    candidate.researchText,
    candidate.departmentName,
    candidate.collegeNameKo,
  ]
    .filter(Boolean)
    .join(" | ");
}

function countByLabel(candidates: SkkuLabCandidate[]) {
  const counts: Record<string, number> = {};
  for (const candidate of candidates) {
    for (const match of candidate.classification?.matches ?? []) {
      counts[match.labelKo] = (counts[match.labelKo] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")));
}

function uniqueCandidateKey(candidate: SkkuLabCandidate): string {
  return `${candidate.professorName ?? candidate.labName ?? ""}|${candidate.labUrl ?? candidate.sourceUrl ?? ""}`;
}

function countUniqueByLabel(candidates: SkkuLabCandidate[]) {
  const idsByLabel = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    for (const match of candidate.classification?.matches ?? []) {
      if (!idsByLabel.has(match.labelKo)) {
        idsByLabel.set(match.labelKo, new Set());
      }
      idsByLabel.get(match.labelKo)?.add(uniqueCandidateKey(candidate));
    }
  }
  return Object.fromEntries(
    [...idsByLabel.entries()]
      .map(([label, keys]) => [label, keys.size] as const)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")),
  );
}

function updateSummary(report: SkkuDiscoveryReport) {
  const uniqueKeys = new Set(report.labCandidates.map(uniqueCandidateKey));
  const uniqueWithTaxonomyKeys = new Set(
    report.labCandidates.filter((candidate) => (candidate.classification?.matches ?? []).length > 0).map(uniqueCandidateKey),
  );

  report.summary = {
    ...(report.summary ?? {}),
    taxonomyMatchCounts: countByLabel(report.labCandidates),
    taxonomyUniqueLabCounts: countUniqueByLabel(report.labCandidates),
    suggestionCount: report.labCandidates.reduce((total, candidate) => total + (candidate.classification?.suggestions ?? []).length, 0),
    withTaxonomyMatch: report.labCandidates.filter((candidate) => (candidate.classification?.matches ?? []).length > 0).length,
    uniqueLabCount: uniqueKeys.size,
    uniqueWithTaxonomyMatch: uniqueWithTaxonomyKeys.size,
    uniqueUnclassifiedLabCount: uniqueKeys.size - uniqueWithTaxonomyKeys.size,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const reportPath = String(args.get("report") ?? "reports/skku-grad-discovery.json");
  const publicPath = args.has("public") ? String(args.get("public")) : "apps/web/public/data/skku-grad-discovery.json";
  const report = JSON.parse(await readFile(reportPath, "utf8")) as SkkuDiscoveryReport;

  for (const candidate of report.labCandidates) {
    candidate.classificationEvidenceText = classificationEvidence(candidate);
    candidate.classification = classifyResearchText(candidate.classificationEvidenceText);
  }
  report.taxonomyReclassifiedAt = new Date().toISOString();
  updateSummary(report);

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (publicPath) {
    await mkdir(dirname(publicPath), { recursive: true });
    await writeFile(publicPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  console.log(
    JSON.stringify(
      {
        reportPath,
        publicPath,
        labCandidates: report.labCandidates.length,
        uniqueLabCount: report.summary?.uniqueLabCount,
        uniqueUnclassifiedLabCount: report.summary?.uniqueUnclassifiedLabCount,
        taxonomyMatchCounts: report.summary?.taxonomyMatchCounts,
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
