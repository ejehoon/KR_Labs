import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { classifyResearchText, type ResearchClassification } from "../packages/crawler/src/taxonomy/researchTaxonomy.js";

type SogangFacultyCandidate = {
  sourceProgramName: string;
  affiliation?: string;
  nameKo?: string;
  labName?: string;
  researchText?: string;
  labUrl?: string;
  sourceUrl?: string;
  sourceParser?: string;
  labUrlSource?: string;
  classificationEvidenceText?: string;
  classification?: ResearchClassification;
};

type SogangDiscoveryReport = {
  sourceUrl?: string;
  generatedAt?: string;
  programs?: unknown[];
  facultyCandidates: SogangFacultyCandidate[];
  summary?: Record<string, unknown>;
};

type CampusLabLink = {
  collegeOrSection: string;
  labName: string;
  labUrl?: string;
};

const campusDirectoryUrl = "https://www.sogang.ac.kr/ko/school-introduction/campus?tab=1";
const reportPaths = [
  "reports/sogang-grad-discovery.json",
  "reports/sogang-grad-discovery-enriched.json",
  "apps/web/public/data/sogang-grad-discovery.json",
];

function cleanText(input: string | undefined): string | undefined {
  const value = input
    ?.replace(/\u00a0/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
  return value || undefined;
}

function resolveUrl(rawUrl: string | undefined, baseUrl: string): string | undefined {
  const value = cleanText(rawUrl);
  if (!value || value === "#" || value.startsWith("mailto:") || value.startsWith("tel:") || value.startsWith("javascript:")) {
    return undefined;
  }
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function normalizeTextKey(input: string | undefined): string {
  return cleanText(input)?.toLowerCase().replace(/[^a-z0-9가-힣]/g, "") ?? "";
}

function normalizeUrlKey(input: string | undefined): string {
  const url = resolveUrl(input, campusDirectoryUrl);
  if (!url) {
    return "";
  }
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname
      .replace(/\/(?:index|index_new)\.(?:html|do|php)$/i, "/")
      .replace(/\/+$/g, "");
    return `${parsed.hostname.toLowerCase()}${pathname.toLowerCase()}`;
  } catch {
    return url.toLowerCase().replace(/\/+$/g, "");
  }
}

function isLabName(name: string): boolean {
  if (/^https?:\/\//i.test(name)) {
    return false;
  }
  return /(?:lab|laboratory|research\s*group|research\s*&|research\s+and|center\s+for|연구실|연구단|연구그룹|실험실|NSMLab|CFDLab|MPLab|MSM)/i.test(name)
    && !/안전관리센터/.test(name);
}

function programNameForSection(section: string): string {
  const overrides: Record<string, string> = {
    자연과학대학: "수학과",
    물리학: "물리학과",
    화학: "화학과",
    생명과학: "생명과학과",
    공과대학: "전자공학과",
    화공생명공학: "화공생명공학과",
    기계공학: "기계공학과",
    소프트웨어융합대학: "컴퓨터공학과",
  };
  return overrides[section] ?? section;
}

function urlHostKey(url: string | undefined): string {
  const resolved = resolveUrl(url, campusDirectoryUrl);
  if (!resolved) {
    return "";
  }
  try {
    return new URL(resolved).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isWeakLabUrl(url: string | undefined): boolean {
  if (!url || url === "#") {
    return true;
  }
  if (isInstitutionalHomeUrl(url)) {
    return true;
  }
  try {
    const parsed = new URL(url);
    return /(?:cs|scc)\.sogang\.ac\.kr\/cs\/cs04_3(?:\.html)?$/i.test(url)
      || /sogang\.ac\.kr\/ko\/school-introduction\/campus/i.test(url)
      || (
        /\/(?:index_new|index)\.(?:html|do|php)$/i.test(parsed.pathname)
        && /(?:korea|history|philosophy|religion|english|sociology|psychology|politics|econ|sbs)\.sogang\.ac\.kr/i.test(url)
      );
  } catch {
    return true;
  }
}

function isInstitutionalHomeUrl(url: string | undefined): boolean {
  const resolved = resolveUrl(url, campusDirectoryUrl);
  if (!resolved) {
    return false;
  }
  try {
    const parsed = new URL(resolved);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/g, "") || "/";
    return host === "sogang.ac.kr" && ["/", "/index.do", "/ko/home"].includes(path.toLowerCase());
  } catch {
    return false;
  }
}

function evidence(candidate: SogangFacultyCandidate): string {
  return [
    candidate.labName,
    candidate.researchText,
    candidate.affiliation,
    candidate.sourceProgramName,
  ].filter(Boolean).join(" | ");
}

function classify(candidate: SogangFacultyCandidate): ResearchClassification {
  const labClassification = classifyResearchText(candidate.labName ?? "");
  return labClassification.matches.length > 0 ? labClassification : classifyResearchText(evidence(candidate));
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 KR-Labs-Crawler/0.1" } });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

function extractCampusLabLinks(html: string): CampusLabLink[] {
  const sections = [...html.matchAll(/<div class="mt-10">([\s\S]*?)(?=<div class="mt-10">|<\/main>)/g)];
  const links = sections.flatMap((section) => {
    const sectionHtml = section[1] ?? "";
    const collegeOrSection = cleanText(sectionHtml.match(/line-height-140 zoom-text">([^<]+)<\/div>/)?.[1]) ?? "서강대학교";
    return [...sectionHtml.matchAll(/font-bold">\s*([^<]+?)\s*<a href="([^"]*)"/g)]
      .map((match): CampusLabLink | undefined => {
        const labName = cleanText(match[1]);
        if (!labName || !isLabName(labName)) {
          return undefined;
        }
        return {
          collegeOrSection,
          labName,
          labUrl: resolveUrl(match[2], campusDirectoryUrl),
        };
      })
      .filter((item): item is CampusLabLink => Boolean(item));
  });

  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${normalizeTextKey(link.labName)}|${normalizeUrlKey(link.labUrl)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function indexCampusLinks(links: CampusLabLink[]) {
  return {
    byUrl: new Map(links.map((link) => [normalizeUrlKey(link.labUrl), link]).filter(([key]) => key)),
    byName: new Map(links.map((link) => [normalizeTextKey(link.labName), link]).filter(([key]) => key)),
  };
}

function findCampusMatch(
  candidate: SogangFacultyCandidate,
  indexes: ReturnType<typeof indexCampusLinks>,
): CampusLabLink | undefined {
  const urlMatch = indexes.byUrl.get(normalizeUrlKey(candidate.labUrl));
  const textKey = normalizeTextKey(candidate.researchText);
  for (const [labKey, link] of indexes.byName) {
    if (labKey.length >= 6 && textKey.includes(labKey)) {
      return link;
    }
  }
  const fuzzyMatch = [...indexes.byName.values()]
    .map((link) => ({ link, score: tokenOverlapScore(candidate, link) }))
    .sort((a, b) => b.score - a.score)[0];
  if (fuzzyMatch && fuzzyMatch.score >= 2) {
    if (!urlMatch || normalizeUrlKey(urlMatch.labUrl) !== normalizeUrlKey(fuzzyMatch.link.labUrl) && fuzzyMatch.score >= 7) {
      return fuzzyMatch.link;
    }
  }
  if (urlMatch) {
    return urlMatch;
  }
  if (fuzzyMatch && fuzzyMatch.score >= 2) {
    return fuzzyMatch.link;
  }
  return undefined;
}

function tokenOverlapScore(candidate: SogangFacultyCandidate, link: CampusLabLink): number {
  const program = programNameForSection(link.collegeOrSection);
  if (candidate.sourceProgramName !== program && candidate.affiliation !== program) {
    return 0;
  }
  const candidateLabName = candidate.labUrlSource === "sogang-campus-directory" ? undefined : candidate.labName;
  const candidateText = `${candidateLabName ?? ""} ${candidate.researchText ?? ""}`;
  const candidateTokens = new Set(tokenize(candidateText));
  const focusedTokens = new Set(tokenize([candidateLabName, candidate.researchText?.slice(0, 240), candidate.researchText?.split("|").at(-1)].filter(Boolean).join(" ")));
  const linkTokens = tokenize(link.labName).filter((token) => !["lab", "laboratory", "research", "연구실"].includes(token));
  const allHits = linkTokens.filter((token) => candidateTokens.has(token)).length;
  const focusedHits = linkTokens.filter((token) => focusedTokens.has(token)).length;
  return focusedHits * 3 + allHits - linkTokens.length * 0.1;
}

function tokenize(input: string): string[] {
  const normalized = cleanText(input)
    ?.toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9가-힣]+/g, " ")
    .trim();
  if (!normalized) {
    return [];
  }
  return [...new Set(normalized.split(/\s+/).filter((token) => token.length >= 2))];
}

function mergeCampusLinks(report: SogangDiscoveryReport, campusLinks: CampusLabLink[]) {
  const indexes = indexCampusLinks(campusLinks);
  let labNameFilled = 0;
  let labUrlUpdated = 0;
  let nonLabUrlCandidatesRemoved = 0;
  const beforeCandidateCount = report.facultyCandidates.length;

  for (const candidate of report.facultyCandidates) {
    const match = findCampusMatch(candidate, indexes);
    if (!match) {
      if (isInstitutionalHomeUrl(candidate.labUrl)) {
        delete candidate.labUrl;
        candidate.labUrlSource = "removed-institutional-home";
      }
      candidate.classificationEvidenceText = evidence(candidate);
      candidate.classification = classify(candidate);
      continue;
    }

    if (!candidate.labName || candidate.labUrlSource === "sogang-campus-directory" && normalizeTextKey(candidate.labName) !== normalizeTextKey(match.labName)) {
      candidate.labName = match.labName;
      labNameFilled += 1;
    }
    const shouldReplaceExistingUrl = isWeakLabUrl(candidate.labUrl)
      || candidate.labUrlSource === "sogang-campus-directory"
      || candidate.labUrlSource === "removed-institutional-home";
    if (match.labUrl && normalizeUrlKey(candidate.labUrl) !== normalizeUrlKey(match.labUrl) && shouldReplaceExistingUrl) {
      candidate.labUrl = match.labUrl;
      candidate.labUrlSource = "sogang-campus-directory";
      labUrlUpdated += 1;
    }
    candidate.classificationEvidenceText = evidence(candidate);
    candidate.classification = classify(candidate);
  }

  const existingUrlKeys = new Set(report.facultyCandidates.map((candidate) => normalizeUrlKey(candidate.labUrl)).filter(Boolean));
  const existingNameKeys = new Set(report.facultyCandidates.map((candidate) => normalizeTextKey(candidate.labName)).filter(Boolean));
  const supplemental = campusLinks
    .filter((link) => link.labUrl && !existingUrlKeys.has(normalizeUrlKey(link.labUrl)) && !existingNameKeys.has(normalizeTextKey(link.labName)))
    .map((link): SogangFacultyCandidate => {
      const sourceProgramName = programNameForSection(link.collegeOrSection);
      const candidate: SogangFacultyCandidate = {
        sourceProgramName,
        affiliation: sourceProgramName,
        labName: link.labName,
        researchText: link.labName,
        labUrl: link.labUrl,
        sourceUrl: campusDirectoryUrl,
        sourceParser: "sogang-campus-lab-directory",
        labUrlSource: "sogang-campus-directory",
      };
      candidate.classificationEvidenceText = evidence(candidate);
      candidate.classification = classify(candidate);
      return candidate;
    });

  report.facultyCandidates.push(...supplemental);
  normalizeAndDedupeCampusCandidates(report);
  nonLabUrlCandidatesRemoved = removeCandidatesWithoutLabUrl(report);
  const candidateSourceUrlsNormalized = normalizeCandidateSourceUrls(report);
  const supplementalCandidatesAdded = Math.max(0, report.facultyCandidates.length - beforeCandidateCount);
  const campusParserCandidates = report.facultyCandidates.filter((candidate) => candidate.sourceParser === "sogang-campus-lab-directory").length;
  const existingCandidatesWithCampusLabName = report.facultyCandidates.filter((candidate) => candidate.labName && candidate.sourceParser !== "sogang-campus-lab-directory").length;
  report.summary = {
    ...(report.summary ?? {}),
    facultyCandidateCount: report.facultyCandidates.length,
    sogangCampusLabDirectory: {
      sourceUrl: campusDirectoryUrl,
      labLinks: campusLinks.length,
      existingCandidatesWithCampusLabName,
      supplementalCandidates: campusParserCandidates,
      thisRun: {
        labNameFilled,
        labUrlUpdated,
        supplementalCandidatesAdded,
        nonLabUrlCandidatesRemoved,
        candidateSourceUrlsNormalized,
      },
    },
    countsByParser: countBy(report.facultyCandidates, (candidate) => candidate.sourceParser ?? "unknown"),
  };

  return {
    labNameFilled,
    labUrlUpdated,
    supplementalCandidates: supplementalCandidatesAdded,
    nonLabUrlCandidatesRemoved,
    candidateSourceUrlsNormalized,
  };
}

function normalizeAndDedupeCampusCandidates(report: SogangDiscoveryReport) {
  for (const candidate of report.facultyCandidates) {
    if (candidate.sourceParser !== "sogang-campus-lab-directory") {
      continue;
    }
    candidate.sourceProgramName = programNameForSection(candidate.sourceProgramName);
    candidate.affiliation = programNameForSection(candidate.affiliation ?? candidate.sourceProgramName);
    candidate.classificationEvidenceText = evidence(candidate);
    candidate.classification = classify(candidate);
  }

  const nonCampusHosts = new Set(
    report.facultyCandidates
      .filter((candidate) => candidate.sourceParser !== "sogang-campus-lab-directory")
      .map((candidate) => urlHostKey(candidate.labUrl))
      .filter(Boolean),
  );
  report.facultyCandidates = report.facultyCandidates.filter((candidate) => {
    if (candidate.sourceParser !== "sogang-campus-lab-directory") {
      return true;
    }
    if (!candidate.labUrl || /^https?:\/\//i.test(candidate.labName ?? "")) {
      return false;
    }
    const host = urlHostKey(candidate.labUrl);
    return !host || !nonCampusHosts.has(host);
  });
}

function removeCandidatesWithoutLabUrl(report: SogangDiscoveryReport): number {
  const before = report.facultyCandidates.length;
  report.facultyCandidates = report.facultyCandidates.filter((candidate) => Boolean(candidate.labUrl));
  return before - report.facultyCandidates.length;
}

function normalizeCandidateSourceUrls(report: SogangDiscoveryReport): number {
  let updated = 0;
  for (const candidate of report.facultyCandidates) {
    if (candidate.labUrl && candidate.sourceUrl !== candidate.labUrl) {
      candidate.sourceUrl = candidate.labUrl;
      updated += 1;
    }
  }
  return updated;
}

function countBy<T>(items: T[], getKey: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")));
}

async function main() {
  const html = await fetchText(campusDirectoryUrl);
  const campusLinks = extractCampusLabLinks(html);
  const results: Record<string, unknown> = {};

  for (const reportPath of reportPaths) {
    let raw: string;
    try {
      raw = await readFile(reportPath, "utf8");
    } catch {
      continue;
    }
    const report = JSON.parse(raw) as SogangDiscoveryReport;
    const result = mergeCampusLinks(report, campusLinks);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    results[reportPath] = result;
  }

  console.log(JSON.stringify({ campusDirectoryUrl, campusLabLinks: campusLinks.length, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
