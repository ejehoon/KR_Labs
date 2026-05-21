import type {
  DepartmentCandidate,
  EntityExtractionResult,
  ExtractedPage,
  LabCandidate,
  ProfessorCandidate,
  PublicationCandidate,
  SchoolCrawlerConfig,
} from "../types.js";
import { dedupeBy, dedupeStrings } from "./dedupe.js";

const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const doiRegex = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi;
const yearRegex = /\b(19|20)\d{2}\b/;
const koreanNameRegex = /([가-힣]{2,5})\s*(교수|부교수|조교수|명예교수|Professor)?/;
const linkedKoreanProfessorRegex = /([가-힣]{2,5})\s*(교수|부교수|조교수|명예교수)/;
const englishNameRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/;
const alumniRegex = /alumni|former|졸업|동문|수료|previous/i;
const memberContextRegex = /member|people|student|researcher|postdoc|ph\.?d|master|ms|m\.s|undergraduate|구성원|멤버|학생|연구원|박사|석사|학부연구생/i;

function cleanLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function lines(page: ExtractedPage): string[] {
  return page.extractedText.split(/\r?\n/).map(cleanLine).filter((line) => line.length > 0 && line.length < 400);
}

function keywordHits(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return dedupeStrings(keywords.filter((keyword) => lower.includes(keyword.toLowerCase())));
}

export function extractEntities(page: ExtractedPage, config: SchoolCrawlerConfig): EntityExtractionResult {
  const pageLines = lines(page);
  const departments = extractDepartments(page, config);
  const professors = extractProfessors(page, pageLines, config);
  const labs = extractLabs(page, config);
  const publications = extractPublications(page, pageLines);

  return {
    departments: dedupeBy(departments, (item) => item.homepageUrl ?? item.nameKo ?? item.nameEn),
    professors: dedupeBy(professors, (item) => item.email ?? item.profileUrl ?? item.nameKo ?? item.nameEn),
    labs: dedupeBy(labs, (item) => item.homepageUrl ?? item.nameKo ?? item.nameEn),
    publications: dedupeBy(publications, (item) => item.doi ?? `${item.title}-${item.year ?? ""}`),
  };
}

function extractDepartments(page: ExtractedPage, config: SchoolCrawlerConfig): DepartmentCandidate[] {
  const candidates: DepartmentCandidate[] = [];

  for (const link of page.links) {
    const hits = keywordHits(`${link.text} ${link.url}`, config.departmentKeywords);
    if (hits.length === 0) {
      continue;
    }
    if (/교수|교수진|faculty|professor/i.test(link.text)) {
      continue;
    }
    const looksSpecific = /학과|전공|대학원|department|school|graduate/i.test(link.text);
    candidates.push({
      nameKo: /[가-힣]/.test(link.text) ? link.text.slice(0, 120) : undefined,
      nameEn: /[A-Za-z]/.test(link.text) ? link.text.slice(0, 120) : undefined,
      homepageUrl: link.url,
      sourceUrl: page.finalUrl,
      confidence: looksSpecific ? 0.72 : 0.48,
    });
  }

  return candidates;
}

function extractProfessors(page: ExtractedPage, pageLines: string[], config: SchoolCrawlerConfig): ProfessorCandidate[] {
  const emails = [...new Set(page.extractedText.match(emailRegex) ?? [])].map((email) => email.toLowerCase());
  const candidates: ProfessorCandidate[] = [];
  const facultyContext = page.pageType === "faculty" || keywordHits(page.title ?? "", config.facultyKeywords).length > 0;

  for (const email of emails) {
    const index = pageLines.findIndex((line) => line.toLowerCase().includes(email));
    const context = pageLines.slice(Math.max(index - 2, 0), index + 3).join(" ");
    const koName = context.match(koreanNameRegex)?.[1];
    const enName = context.match(englishNameRegex)?.[1];
    const title = context.match(/(교수|부교수|조교수|명예교수|Professor|Associate Professor|Assistant Professor)/i)?.[1];
    const labLink = page.links.find((link) => keywordHits(`${link.text} ${link.url}`, config.labKeywords).length > 0);

    candidates.push({
      nameKo: koName,
      nameEn: enName,
      title,
      email,
      profileUrl: page.pageType === "professor" || facultyContext ? page.finalUrl : undefined,
      labUrl: labLink?.url,
      researchInterests: extractResearchKeywords(context),
      sourceUrl: page.finalUrl,
      confidence: email && (koName || enName) ? 0.86 : 0.55,
    });
  }

  for (const link of page.links) {
    if (keywordHits(`${link.text} ${link.url}`, config.facultyKeywords).length === 0) {
      continue;
    }
    const koName = link.text.match(linkedKoreanProfessorRegex)?.[1];
    const enName = link.text.match(englishNameRegex)?.[1];
    if (!koName && !enName) {
      continue;
    }
    candidates.push({
      nameKo: koName,
      nameEn: enName,
      profileUrl: link.url,
      researchInterests: [],
      sourceUrl: page.finalUrl,
      confidence: 0.52,
    });
  }

  return candidates;
}

function extractLabs(page: ExtractedPage, config: SchoolCrawlerConfig): LabCandidate[] {
  const candidates: LabCandidate[] = [];
  const labLinks = page.links.filter((link) => keywordHits(`${link.text} ${link.url}`, config.labKeywords).length > 0);
  const memberCount = extractMemberCount(page);

  for (const link of labLinks) {
    candidates.push({
      nameKo: /[가-힣]/.test(link.text) ? link.text.slice(0, 160) : undefined,
      nameEn: /[A-Za-z]/.test(link.text) ? link.text.slice(0, 160) : undefined,
      homepageUrl: link.url,
      description: undefined,
      researchKeywords: extractResearchKeywords(link.text),
      currentMemberCount: undefined,
      memberCountBreakdown: undefined,
      sourceUrl: page.finalUrl,
      confidence: link.text.length > 2 ? 0.62 : 0.42,
    });
  }

  if (page.pageType === "lab") {
    candidates.push({
      nameKo: /[가-힣]/.test(page.title ?? "") ? page.title : undefined,
      nameEn: /[A-Za-z]/.test(page.title ?? "") ? page.title : undefined,
      homepageUrl: page.finalUrl,
      description: page.extractedText.slice(0, 2000),
      researchKeywords: extractResearchKeywords(page.extractedText),
      currentMemberCount: memberCount?.total,
      memberCountBreakdown: memberCount?.breakdown,
      sourceUrl: page.finalUrl,
      contentHash: page.contentHash,
      confidence: memberCount ? 0.82 : 0.78,
    });
  }

  return candidates;
}

function extractMemberCount(page: ExtractedPage): { total: number; breakdown: Record<string, number> } | undefined {
  const titleAndText = `${page.title ?? ""}\n${page.extractedText}`;
  if (!memberContextRegex.test(titleAndText)) {
    return undefined;
  }

  const explicit = titleAndText.match(/(?:current\s+)?(?:members?|people|구성원|인원|연구실\s*인원)\D{0,20}(\d{1,3})\s*(?:명|people|members?)?/i);
  if (explicit?.[1]) {
    const total = Number(explicit[1]);
    if (Number.isInteger(total) && total > 0 && total < 300) {
      return { total, breakdown: { explicit_total: total } };
    }
  }

  const pageLines = lines(page);
  const currentLines = pageLines.filter((line) => memberContextRegex.test(line) && !alumniRegex.test(line));
  const breakdown = {
    professor: countRoleLines(currentLines, /principal investigator|pi\b|professor|교수/i),
    postdoc: countRoleLines(currentLines, /post-?doc|postdoctoral|박사후|연수연구원/i),
    phd: countRoleLines(currentLines, /ph\.?d|doctoral|박사과정|박사/i),
    master: countRoleLines(currentLines, /m\.?s\.?|master|석사과정|석사/i),
    undergraduate: countRoleLines(currentLines, /undergraduate|학부연구생|인턴/i),
    researcher: countRoleLines(currentLines, /researcher|staff|engineer|연구원/i),
  };
  const roleTotal = Object.values(breakdown).reduce((sum, value) => sum + value, 0);

  if (roleTotal > 0 && roleTotal < 300) {
    return { total: roleTotal, breakdown };
  }

  const tableEstimate = page.tablesText
    .filter((text) => memberContextRegex.test(text) && !alumniRegex.test(text))
    .map((text) => {
      const emailCount = (text.match(emailRegex) ?? []).length;
      const roleCount = (text.match(/ph\.?d|master|undergraduate|post-?doc|researcher|박사과정|석사과정|학부연구생|연구원/gi) ?? []).length;
      return Math.max(emailCount, roleCount);
    })
    .reduce((max, value) => Math.max(max, value), 0);

  if (tableEstimate > 0 && tableEstimate < 300) {
    return { total: tableEstimate, breakdown: { table_estimate: tableEstimate } };
  }

  return undefined;
}

function countRoleLines(linesToCheck: string[], pattern: RegExp): number {
  return linesToCheck.filter((line) => pattern.test(line)).length;
}

function extractPublications(page: ExtractedPage, pageLines: string[]): PublicationCandidate[] {
  const candidates: PublicationCandidate[] = [];

  for (const line of pageLines) {
    const year = Number(line.match(yearRegex)?.[0]);
    const doi = line.match(doiRegex)?.[0];
    const looksLikePublication =
      Boolean(year && line.length > 40) &&
      (/proceedings|journal|conference|transactions|letters|논문|학회|저널|doi/i.test(line) || Boolean(doi));
    if (!looksLikePublication) {
      continue;
    }
    candidates.push({
      title: line.replace(doiRegex, "").trim().slice(0, 500),
      authors: [],
      year: Number.isFinite(year) ? year : undefined,
      doi,
      sourceUrl: page.finalUrl,
      confidence: doi ? 0.74 : 0.48,
    });
  }

  return candidates.slice(0, 25);
}

function extractResearchKeywords(text: string): string[] {
  const keywords = [
    "AI",
    "Artificial Intelligence",
    "Machine Learning",
    "Deep Learning",
    "LLM",
    "NLP",
    "Computer Vision",
    "Robotics",
    "HCI",
    "Data Science",
    "Bioinformatics",
    "인공지능",
    "기계학습",
    "딥러닝",
    "자연어처리",
    "컴퓨터비전",
    "로보틱스",
    "데이터사이언스",
  ];
  const lower = text.toLowerCase();
  return dedupeStrings(keywords.filter((keyword) => lower.includes(keyword.toLowerCase())));
}
