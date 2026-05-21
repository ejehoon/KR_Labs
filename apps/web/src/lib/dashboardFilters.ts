import type { LabRow, RankingRow } from "../data";
import { getPrimaryLabUrl } from "./labLinks";
import { inferField } from "./researchFields";
import type { ResearchTaxonomy } from "../taxonomy";

export type LabFilterInput = {
  labs: LabRow[];
  query: string;
  selectedAreaIds: string[];
  selectedSchool?: string;
  taxonomies: ResearchTaxonomy[];
};

export function filterLabs({ labs, query, selectedAreaIds, selectedSchool, taxonomies }: LabFilterInput): LabRow[] {
  if (selectedAreaIds.length === 0) {
    return [];
  }

  const uniqueLabs = uniqueLabRows(labs);
  const selectedAreas = getSelectedAreas(taxonomies, selectedAreaIds);
  const normalizedQuery = query.trim().toLowerCase();

  return uniqueLabs.filter((lab) => {
    const haystack = buildLabHaystack(lab);
    const areaHaystack = buildAreaHaystack(lab);
    const matchesSchool = !selectedSchool || lab.school === selectedSchool;
    const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
    const matchesArea =
      selectedAreas.some(({ taxonomySlug, areaId, terms }) => {
        if (isUncategorizedArea(areaId)) {
          return lab.keywords.length === 0;
        }
        return matchesTaxonomyDomain(lab, taxonomySlug) && terms.some((term) => areaHaystack.includes(term.toLowerCase()));
      });

    return matchesSchool && matchesQuery && matchesArea;
  });
}

export function searchLabsByKeyword(labs: LabRow[], query: string): LabRow[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  return uniqueLabRows(labs).filter((lab) => buildLabHaystack(lab).includes(normalizedQuery));
}

export function buildRankingRowsFromLabs(labs: LabRow[]): RankingRow[] {
  const uniqueLabs = uniqueLabRows(labs);
  const rowsBySchool = new Map<string, LabRow[]>();

  for (const lab of uniqueLabs) {
    rowsBySchool.set(lab.school, [...(rowsBySchool.get(lab.school) ?? []), lab]);
  }

  const rankingRows: RankingRow[] = [...rowsBySchool.entries()]
    .map(([school, schoolLabs]) => {
      const knownMemberTotal = schoolLabs.reduce((total, lab) => total + (lab.memberCount ?? 0), 0);
      const paperCount = schoolLabs.reduce((total, lab) => total + (lab.paperCount ?? 0), 0);
      const avgConfidence = schoolLabs.length > 0 ? schoolLabs.reduce((total, lab) => total + lab.confidence, 0) / schoolLabs.length : 0;

      return {
        school,
        department: "Computer Science",
        labs: schoolLabs.length,
        professors: schoolLabs.length,
        pages: 0,
        memberCount: knownMemberTotal || null,
        paperCount,
        avgConfidence,
        source: schoolLabs[0]?.source ?? "kr-rankings",
      };
    });

  return rankingRows.sort((a, b) => b.paperCount - a.paperCount || b.labs - a.labs || a.school.localeCompare(b.school));
}

export function getSelectedAreaTerms(taxonomies: ResearchTaxonomy[], areaIds: string[]): string[] {
  return getSelectedAreas(taxonomies, areaIds).flatMap((area) => area.terms);
}

function getSelectedAreas(taxonomies: ResearchTaxonomy[], areaIds: string[]): Array<{ taxonomySlug: string; areaId: string; terms: string[] }> {
  const selected = new Set(areaIds);
  return taxonomies.flatMap((taxonomy) =>
    taxonomy.groups.flatMap((group) =>
      group.areas.flatMap((area) =>
        selected.has(`${taxonomy.slug}:${area.id}`) ? [{ taxonomySlug: taxonomy.slug, areaId: area.id, terms: area.matchTerms }] : [],
      ),
    ),
  );
}

function isUncategorizedArea(areaId: string): boolean {
  return areaId === "uncategorized";
}

export function uniqueLabRows(labs: LabRow[]): LabRow[] {
  const seen = new Set<string>();
  const rows: LabRow[] = [];

  for (const lab of labs) {
    const key = semanticLabKey(lab);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    rows.push(lab);
  }

  return rows;
}

function semanticLabKey(lab: LabRow): string {
  const url = getPrimaryLabUrl(lab);
  if (url) {
    return `${lab.school}|${lab.name}|${url}`;
  }
  return `${lab.school}|${lab.name}|${lab.department ?? lab.programName ?? ""}|${lab.id ?? ""}`;
}

function buildLabHaystack(lab: LabRow): string {
  return `${lab.name} ${lab.school} ${lab.department ?? ""} ${lab.researchText ?? ""} ${lab.keywords.join(" ")} ${lab.paperCount ?? ""} ${inferField(lab.name)}`.toLowerCase();
}

function buildAreaHaystack(lab: LabRow): string {
  return `${lab.researchText ?? ""} ${lab.keywords.join(" ")} ${inferField(lab.name)}`.toLowerCase();
}

function matchesTaxonomyDomain(lab: LabRow, taxonomySlug: string): boolean {
  if (taxonomySlug === "cs") {
    return /컴퓨터|인공지능|소프트웨어|전산|computer science|computer engineering|artificial intelligence/i.test(domainHaystack(lab));
  }
  if (taxonomySlug === "engineering") {
    return /전자|전기|기계|화공|화학공학|공학|반도체|집적회로|신호처리|무선통신|로봇|재료|의공/i.test(domainHaystack(lab));
  }
  if (taxonomySlug === "natural-science") {
    return /수학|수학교육|물리|화학|자연과학|mathematics|physics|chemistry/i.test(domainHaystack(lab));
  }
  if (taxonomySlug === "bio-medical") {
    return /생명|바이오|의학|의료|의공|bio|medical/i.test(domainHaystack(lab));
  }
  if (taxonomySlug === "social-business") {
    return /경영|경제|금융|사회|정치|외교|국제관계|지역학|동남아시아|여성학|젠더|법학|심리|미디어|커뮤니케이션|business|economics|finance|law|psychology|media|global studies/i.test(domainHaystack(lab));
  }
  if (taxonomySlug === "humanities-arts") {
    return /국문|국어|영문|영어|독문|독어|불문|불어|중국|사학|철학|종교|한국학|역사|문학|언어|문화|교육|아트|예술|콘텐츠|humanities|arts/i.test(domainHaystack(lab));
  }
  return true;
}

function domainHaystack(lab: LabRow): string {
  return `${lab.department ?? ""} ${lab.programName ?? ""} ${lab.researchText ?? ""} ${lab.keywords.join(" ")}`.toLowerCase();
}
