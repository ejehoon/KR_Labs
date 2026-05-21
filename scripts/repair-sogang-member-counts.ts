import { readFile, writeFile } from "node:fs/promises";

type SogangFacultyCandidate = {
  nameKo?: string;
  sourceProgramName?: string;
  currentMemberCount?: number;
  memberCount?: number;
  memberCountBreakdown?: Record<string, number>;
  memberCountSourceUrl?: string;
  memberCountCrawledAt?: string;
  enrichmentWarnings?: string[];
};

type SogangDiscoveryReport = {
  facultyCandidates: SogangFacultyCandidate[];
  summary?: {
    enrichment?: {
      withMemberCount?: number;
    };
  };
};

const reportPaths = [
  "reports/sogang-grad-discovery.json",
  "reports/sogang-grad-discovery-enriched.json",
  "apps/web/public/data/sogang-grad-discovery.json",
];

const badMemberCountSourcePatterns = [
  /#role-member-pages$/i,
  /(?:korea|scc)\.sogang\.ac\.kr\/korea\/korea01_5(?:_\d+)?\.html/i,
  /philosophy\.sogang\.ac\.kr\/philosophy\/philosophy01_5(?:_\d+)?\.html/i,
  /sogang\.ac\.kr\/ko\/home/i,
  /(?:professor|faculty|교수진|전임교원|교원소개|employee\/professor)/i,
];

function isBadMemberCountSource(sourceUrl: string | undefined): boolean {
  return badMemberCountSourcePatterns.some((pattern) => pattern.test(sourceUrl ?? ""));
}

function clearBadMemberCount(row: SogangFacultyCandidate): boolean {
  if (!isBadMemberCountSource(row.memberCountSourceUrl)) {
    return false;
  }

  delete row.currentMemberCount;
  delete row.memberCount;
  delete row.memberCountBreakdown;
  delete row.memberCountSourceUrl;
  delete row.memberCountCrawledAt;

  row.enrichmentWarnings = [...new Set([...(row.enrichmentWarnings ?? []), "member_count_cleared_faculty_directory"])];
  return true;
}

async function repairReport(path: string) {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { path, skipped: true, cleared: 0 };
    }
    throw error;
  }

  const report = JSON.parse(raw) as SogangDiscoveryReport;
  let cleared = 0;
  for (const row of report.facultyCandidates) {
    if (clearBadMemberCount(row)) {
      cleared += 1;
    }
  }

  if (report.summary?.enrichment) {
    report.summary.enrichment.withMemberCount = report.facultyCandidates.filter((row) => typeof row.currentMemberCount === "number" || typeof row.memberCount === "number").length;
  }

  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  return { path, skipped: false, cleared };
}

async function main() {
  const results = await Promise.all(reportPaths.map((path) => repairReport(path)));
  for (const result of results) {
    if (result.skipped) {
      console.log(`${result.path}: skipped`);
    } else {
      console.log(`${result.path}: cleared ${result.cleared} member counts`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
