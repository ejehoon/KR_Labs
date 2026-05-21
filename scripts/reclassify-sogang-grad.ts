import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { classifyResearchText, type ResearchClassification } from "../packages/crawler/src/taxonomy/researchTaxonomy.js";

type SogangProgram = {
  series: string;
  name: string;
  classification?: ResearchClassification;
};

type SogangFacultyCandidate = {
  sourceProgramName: string;
  affiliation?: string;
  nameKo?: string;
  labName?: string;
  researchText?: string;
  labUrl?: string;
  sourceUrl?: string;
  classificationEvidenceText?: string;
  classification?: ResearchClassification;
};

type SogangDiscoveryReport = {
  generatedAt: string;
  programs: SogangProgram[];
  facultyCandidates: SogangFacultyCandidate[];
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
  console.log(`Usage: pnpm reclassify:sogang-grad [--report=reports/sogang-grad-discovery.json] [--public=apps/web/public/data/sogang-grad-discovery.json]

Re-runs the central KR_Labs taxonomy against an existing enriched Sogang report.
This keeps crawler/enrichment results and only updates classification fields.
`);
}

function countByLabel(candidates: SogangFacultyCandidate[]) {
  const counts: Record<string, number> = {};
  for (const candidate of candidates) {
    for (const match of candidate.classification?.matches ?? []) {
      counts[match.labelKo] = (counts[match.labelKo] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")));
}

function countUniqueByLabel(candidates: SogangFacultyCandidate[]) {
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

function countSuggestions(candidates: SogangFacultyCandidate[]) {
  const counts: Record<string, { count: number; samples: Array<{ program: string; name?: string; researchText?: string }> }> = {};
  for (const candidate of candidates) {
    if ((candidate.classification?.matches ?? []).length > 0) {
      continue;
    }
    for (const suggestion of candidate.classification?.suggestions ?? []) {
      const key = suggestion.suggestedLabel;
      const bucket = (counts[key] ??= { count: 0, samples: [] });
      bucket.count += 1;
      if (bucket.samples.length < 5) {
        bucket.samples.push({
          program: candidate.sourceProgramName,
          name: candidate.nameKo,
          researchText: candidate.researchText,
        });
      }
    }
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0], "ko")));
}

function classificationEvidence(candidate: SogangFacultyCandidate): string {
  return [
    candidate.labName,
    candidate.researchText,
    candidate.affiliation,
    candidate.sourceProgramName,
  ].filter(Boolean).join(" | ");
}

function classifyFacultyCandidate(candidate: SogangFacultyCandidate): ResearchClassification {
  const labNameClassification = classifyResearchText(candidate.labName ?? "");
  if ((labNameClassification.matches ?? []).length > 0) {
    return labNameClassification;
  }
  return classifyResearchText(classificationEvidence(candidate));
}

function cleanResearchText(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }
  const cleaned = text
    .replace(/\s*\((?:E-?mail|Email|TEL|Tel|전화|연락처)\s*[:：][^)]*\)/gi, "")
    .replace(/\s+(?:학과장|주임교수|주임|원장)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function updateSummary(report: SogangDiscoveryReport) {
  const taxonomyMatchCounts = countByLabel(report.facultyCandidates);
  const taxonomyUniqueLabCounts = countUniqueByLabel(report.facultyCandidates);
  const suggestionCount = report.facultyCandidates.reduce((total, candidate) => total + (candidate.classification?.suggestions ?? []).length, 0);
  const withTaxonomyMatch = report.facultyCandidates.filter((candidate) => (candidate.classification?.matches ?? []).length > 0).length;
  const uniqueKeys = new Set(report.facultyCandidates.map(uniqueCandidateKey));
  const uniqueWithTaxonomyKeys = new Set(
    report.facultyCandidates.filter((candidate) => (candidate.classification?.matches ?? []).length > 0).map(uniqueCandidateKey),
  );

  report.summary = {
    ...(report.summary ?? {}),
    facultyCandidateCount: report.facultyCandidates.length,
    taxonomyMatchCounts,
    taxonomyUniqueLabCounts,
    suggestionCount,
    withTaxonomyMatch,
    uniqueLabCount: uniqueKeys.size,
    uniqueWithTaxonomyMatch: uniqueWithTaxonomyKeys.size,
    uniqueUnclassifiedLabCount: uniqueKeys.size - uniqueWithTaxonomyKeys.size,
  };
}

function uniqueCandidateKey(candidate: SogangFacultyCandidate): string {
  return `${candidate.nameKo ?? ""}|${candidate.labUrl ?? candidate.sourceUrl ?? ""}`;
}

function renderGapMarkdown(reportPath: string, report: SogangDiscoveryReport, suggestions: ReturnType<typeof countSuggestions>) {
  const rows = Object.entries(suggestions)
    .slice(0, 80)
    .map(([label, value]) => {
      const sample = value.samples
        .slice(0, 2)
        .map((item) => `${item.program}/${item.name ?? "-"}: ${item.researchText ?? "-"}`)
        .join("<br>");
      return `| ${label} | ${value.count} | ${sample} |`;
    })
    .join("\n");

  return `# Sogang Taxonomy Gap Report

- Source: ${reportPath}
- Generated At: ${new Date().toISOString()}
- Faculty Candidates: ${report.facultyCandidates.length}
- With Taxonomy Match: ${report.summary?.withTaxonomyMatch ?? 0}

## Top Unmatched Suggestions

| suggested label | count | samples |
|---|---:|---|
${rows || "|  | 0 | No unmatched suggestions |"}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const reportPath = String(args.get("report") ?? "reports/sogang-grad-discovery.json");
  const publicPath = args.has("public") ? String(args.get("public")) : "apps/web/public/data/sogang-grad-discovery.json";
  const report = JSON.parse(await readFile(reportPath, "utf8")) as SogangDiscoveryReport;

  for (const program of report.programs) {
    program.classification = classifyResearchText(`${program.series} ${program.name}`);
  }
  for (const candidate of report.facultyCandidates) {
    candidate.researchText = cleanResearchText(candidate.researchText);
    candidate.classificationEvidenceText = classificationEvidence(candidate);
    candidate.classification = classifyFacultyCandidate(candidate);
  }
  report.taxonomyReclassifiedAt = new Date().toISOString();
  updateSummary(report);

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (publicPath) {
    await mkdir(dirname(publicPath), { recursive: true });
    await writeFile(publicPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  const outputBase = basename(reportPath).replace(/\.json$/i, "");
  const suggestions = countSuggestions(report.facultyCandidates);
  const gapJsonPath = join("reports", `${outputBase}-taxonomy-gaps.json`);
  const gapMdPath = join("reports", `${outputBase}-taxonomy-gaps.md`);
  await mkdir("reports", { recursive: true });
  await writeFile(gapJsonPath, `${JSON.stringify(suggestions, null, 2)}\n`, "utf8");
  await writeFile(gapMdPath, renderGapMarkdown(reportPath, report, suggestions), "utf8");

  console.log(
    JSON.stringify(
      {
        reportPath,
        publicPath,
        gapJsonPath,
        gapMdPath,
        withTaxonomyMatch: report.summary?.withTaxonomyMatch,
        uniqueLabCount: report.summary?.uniqueLabCount,
        uniqueWithTaxonomyMatch: report.summary?.uniqueWithTaxonomyMatch,
        uniqueUnclassifiedLabCount: report.summary?.uniqueUnclassifiedLabCount,
        taxonomyMatchCounts: report.summary?.taxonomyMatchCounts,
        taxonomyUniqueLabCounts: report.summary?.taxonomyUniqueLabCounts,
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
