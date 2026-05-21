import { classifyResearchText, type ResearchClassification } from "../taxonomy/researchTaxonomy.js";
import {
  discoverSkkuCollegeEntries,
  discoverSkkuCollegeLabRows,
  type SkkuCollegeEntry,
  type SkkuLabIndexRow,
} from "./skku/labIndexAdapter.js";

export type SkkuLabCandidate = SkkuLabIndexRow & {
  classification: ResearchClassification;
  classificationEvidenceText: string;
};

export type SkkuGraduateDiscoveryReport = {
  sourceUrl: string;
  generatedAt: string;
  colleges: SkkuCollegeEntry[];
  labCandidates: SkkuLabCandidate[];
  skippedColleges: Array<{
    college: SkkuCollegeEntry;
    reason: string;
  }>;
  summary: {
    collegeCount: number;
    parsedCollegeCount: number;
    skippedCollegeCount: number;
    labCandidateCount: number;
    labUrlCount: number;
    countsByCollege: Record<string, number>;
    countsByDepartment: Record<string, number>;
    taxonomyMatchCounts: Record<string, number>;
    suggestionCount: number;
  };
};

const defaultSourceUrl = "https://gradschool.skku.edu/grad/prepare/laboratory.htm";

function buildClassificationEvidence(row: SkkuLabIndexRow): string {
  return [
    row.researchText,
    row.labName,
    row.departmentName,
  ]
    .filter(Boolean)
    .join(" | ");
}

function toCandidate(row: SkkuLabIndexRow): SkkuLabCandidate {
  const classificationEvidenceText = buildClassificationEvidence(row);
  return {
    ...row,
    classificationEvidenceText,
    classification: classifyResearchText(classificationEvidenceText),
  };
}

function incrementCount(counts: Record<string, number>, key: string | undefined) {
  if (!key) {
    return;
  }
  counts[key] = (counts[key] ?? 0) + 1;
}

function summarize(colleges: SkkuCollegeEntry[], labCandidates: SkkuLabCandidate[], skippedColleges: SkkuGraduateDiscoveryReport["skippedColleges"]): SkkuGraduateDiscoveryReport["summary"] {
  const countsByCollege: Record<string, number> = {};
  const countsByDepartment: Record<string, number> = {};
  const taxonomyMatchCounts: Record<string, number> = {};
  let suggestionCount = 0;

  for (const candidate of labCandidates) {
    incrementCount(countsByCollege, candidate.collegeNameKo);
    incrementCount(countsByDepartment, candidate.departmentName);
    suggestionCount += candidate.classification.suggestions.length;
    for (const match of candidate.classification.matches) {
      incrementCount(taxonomyMatchCounts, match.labelKo);
    }
  }

  return {
    collegeCount: colleges.length,
    parsedCollegeCount: colleges.length - skippedColleges.length,
    skippedCollegeCount: skippedColleges.length,
    labCandidateCount: labCandidates.length,
    labUrlCount: labCandidates.filter((candidate) => candidate.labUrl).length,
    countsByCollege,
    countsByDepartment,
    taxonomyMatchCounts,
    suggestionCount,
  };
}

export async function discoverSkkuGraduateSeeds(options?: {
  sourceUrl?: string;
  collegeIds?: string[];
  maxColleges?: number;
}): Promise<SkkuGraduateDiscoveryReport> {
  const sourceUrl = options?.sourceUrl ?? defaultSourceUrl;
  const collegeIds = options?.collegeIds;
  const maxColleges = options?.maxColleges ?? Number.POSITIVE_INFINITY;
  const colleges = await discoverSkkuCollegeEntries(sourceUrl);
  const selectedColleges = colleges
    .filter((college) => !collegeIds || (college.id ? collegeIds.includes(college.id) : collegeIds.includes(college.nameKo)))
    .slice(0, maxColleges);
  const labCandidates: SkkuLabCandidate[] = [];
  const skippedColleges: SkkuGraduateDiscoveryReport["skippedColleges"] = [];

  for (const college of selectedColleges) {
    try {
      const rows = await discoverSkkuCollegeLabRows(college);
      labCandidates.push(...rows.map(toCandidate));
    } catch (error) {
      skippedColleges.push({
        college,
        reason: error instanceof Error ? error.message : "college_adapter_failed",
      });
    }
  }

  return {
    sourceUrl,
    generatedAt: new Date().toISOString(),
    colleges: selectedColleges,
    labCandidates,
    skippedColleges,
    summary: summarize(selectedColleges, labCandidates, skippedColleges),
  };
}
