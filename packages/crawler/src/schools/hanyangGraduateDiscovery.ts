import type { BrowserContext } from "playwright";
import { cleanText, resolveUrl, uniqueBy } from "../core/html.js";
import { enrichLabMemberCount } from "../core/labMetrics.js";
import { enrichLabResearchEvidence } from "../core/labResearchEvidence.js";
import { snapshotPlaywrightPage, type PlaywrightPageSnapshot } from "../core/playwrightExtract.js";
import { classifyResearchText, type ResearchClassification, type ResearchFieldMatch } from "../taxonomy/researchTaxonomy.js";

export type HanyangGraduateProgram = {
  collegeName: string;
  name: string;
  sourceUrl: string;
  homepageUrl?: string;
  labIndexUrl?: string;
  classification: ResearchClassification;
};

export type HanyangLabCandidate = {
  collegeName: string;
  departmentName: string;
  affiliations?: Array<{
    collegeName: string;
    departmentName: string;
    sourceUrl: string;
  }>;
  labName?: string;
  professorName?: string;
  email?: string;
  phone?: string;
  location?: string;
  localCategory?: string;
  researchText?: string;
  homepageResearchText?: string;
  homepageResearchSourceUrl?: string;
  researchEvidenceCandidatePages?: Array<{ url: string; score: number; reason: string }>;
  labUrl: string;
  labHomepageUrl?: string;
  sourceUrl: string;
  pdfUrl?: string;
  classification: ResearchClassification;
  currentMemberCount?: number;
  memberCountBreakdown?: Record<string, number>;
  memberCountSourceUrl?: string;
  memberCountCrawledAt?: string;
  memberCountCandidatePages?: Array<{ url: string; score: number; reason: string }>;
  scholarUrl?: string;
  dblpUrl?: string;
  paperCount?: number;
  warnings: string[];
};

export type HanyangProfessorCandidate = {
  collegeName: string;
  departmentName: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  profileUrl?: string;
  labHomepageUrl?: string;
  researchText?: string;
  profileDetailText?: string;
  profileDetailSourceUrl?: string;
  sourceUrl: string;
  classification: ResearchClassification;
  warnings: string[];
};

export type HanyangGraduateDiscoveryReport = {
  sourceUrl: string;
  generatedAt: string;
  discoveryReport: {
    departmentPage: Pick<PlaywrightPageSnapshot, "finalUrl" | "status" | "title" | "headings" | "iframeUrls"> & {
      departmentLinkCount: number;
    };
    labRootPage: Pick<PlaywrightPageSnapshot, "finalUrl" | "status" | "title" | "headings" | "iframeUrls"> & {
      collegeLabIndexCount: number;
    };
    professorListUrlPattern: string;
    professorDetailUrlPattern?: string;
    labHomepageLinkPattern: string;
    membersTraversal: string;
    publicationsTraversal: string;
    structuralNotes: string[];
    adapterDesign: string[];
  };
  programs: HanyangGraduateProgram[];
  professorCandidates: HanyangProfessorCandidate[];
  labCandidates: HanyangLabCandidate[];
  failedPages: Array<{ url: string; reason: string }>;
  summary: {
    programCount: number;
    collegeCount: number;
    labIndexCollegeCount: number;
    labDepartmentCount: number;
    labCandidateCount: number;
    professorCandidateCount: number;
    labHomepageCount: number;
    fallbackLabUrlCount: number;
    memberCountVerifiedCount: number;
    memberCountUnknownCount: number;
    dblpUrlCount: number;
    scholarUrlCount: number;
    taxonomyMatchCount: number;
    taxonomySuggestionCount: number;
    countsByCollege: Record<string, number>;
    countsByDepartment: Record<string, number>;
    professorCountsByDepartment: Record<string, number>;
    taxonomyMatchCounts: Record<string, number>;
  };
};

type LabIndex = {
  collegeName: string;
  url: string;
};

type LabDepartmentIndex = {
  collegeName: string;
  departmentName: string;
  url: string;
};

type RawProgram = {
  collegeName: string;
  name: string;
  sourceUrl: string;
  homepageUrl?: string;
};

type RawLab = {
  departmentName: string;
  labName?: string;
  professorName?: string;
  email?: string;
  phone?: string;
  location?: string;
  researchText?: string;
  homepageUrl?: string;
  pdfUrl?: string;
};

type DepartmentHomepageLab = {
  labName: string;
  professorName: string;
  location?: string;
  phone?: string;
  homepageUrl?: string;
  researchText?: string;
  sourceUrl: string;
};

const defaultSourceUrl = "http://www.grad.hanyang.ac.kr/department/departmentintro.php";
const labRootUrl = "http://www.grad.hanyang.ac.kr/graduate/lab.php";
const gradBaseUrl = "http://www.grad.hanyang.ac.kr/";
const verifiedDepartmentHomepageHosts = new Set([
  "eece.hanyang.ac.kr",
  "fn.hanyang.ac.kr",
]);

const hanyangEeceLocalCategoryMatches: Record<string, ResearchFieldMatch[]> = {
  "반도체": [{ fieldId: "electronics.semiconductor", labelKo: "반도체/집적회로", confidence: 0.86, evidence: ["local_category:반도체"] }],
  "신호처리": [{ fieldId: "signal_processing", labelKo: "신호처리", confidence: 0.86, evidence: ["local_category:신호처리"] }],
  "통신": [{ fieldId: "electronics.rf", labelKo: "RF/무선통신", confidence: 0.82, evidence: ["local_category:통신"] }],
  "회로": [{ fieldId: "electronics.semiconductor", labelKo: "반도체/집적회로", confidence: 0.78, evidence: ["local_category:회로"] }],
  "전기에너지": [{ fieldId: "electronics.power_energy_systems", labelKo: "전력/에너지 시스템", confidence: 0.86, evidence: ["local_category:전기에너지"] }],
  "제어/로봇": [
    { fieldId: "electronics.control", labelKo: "제어/계측", confidence: 0.84, evidence: ["local_category:제어/로봇"] },
    { fieldId: "robotics", labelKo: "로보틱스", confidence: 0.78, evidence: ["local_category:제어/로봇"] },
  ],
};

function incrementCount(counts: Record<string, number>, key: string | undefined) {
  if (!key) {
    return;
  }
  counts[key] = (counts[key] ?? 0) + 1;
}

function stripArrow(text: string): string {
  return cleanText(text.replace(/\s*화살표\s*$/g, "")) ?? "";
}

function normalizeProfessorName(input: string | undefined): string | undefined {
  return cleanText(input?.replace(/\s*교수\s*$/g, ""));
}

function cleanResearchScopeText(input: string | undefined): string | undefined {
  const text = cleanText(input);
  if (!text) {
    return undefined;
  }
  const stopMatch = text.match(/\s*(?:[-–—]\s*)?(?:학력|교육|education|경력|career|experience|biography|bio|주요논문|publications?|selected publications?|주요저서|수상경력|awards?|학회활동)(?:\s|[:：]|$)/i);
  const scoped = stopMatch?.index !== undefined ? text.slice(0, stopMatch.index) : text;
  return cleanText(scoped
    .replace(/^(?:연구(?:관심)?분야|주요\s*연구\s*분야|research\s*(?:areas?|interests?|topics?))\s*[:：\-]?\s*/i, "")
    .replace(/\s+/g, " "));
}

function classificationEvidenceForLab(lab: HanyangLabCandidate): string {
  const primaryEvidence = [
    lab.labName,
    lab.homepageResearchText,
    lab.researchText,
  ].filter(Boolean);
  return (primaryEvidence.length > 0 ? primaryEvidence : [lab.departmentName]).join(" | ");
}

function classifyLabResearch(lab: HanyangLabCandidate): ResearchClassification {
  const primary = classifyResearchText(classificationEvidenceForLab(lab));
  const localCategoryMatches = lab.localCategory ? hanyangEeceLocalCategoryMatches[lab.localCategory] ?? [] : [];
  if (localCategoryMatches.length > 0) {
    const matches = uniqueBy([...primary.matches, ...localCategoryMatches], (match) => match.fieldId)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
    return {
      ...primary,
      matches,
      suggestions: [],
      status: "matched",
      threshold: primary.threshold,
    };
  }
  if (primary.matches.length > 0) {
    return primary;
  }
  return classifyResearchText([classificationEvidenceForLab(lab), lab.departmentName].filter(Boolean).join(" | "));
}

function buildDiscoveryMetadata(
  departmentSnapshot: PlaywrightPageSnapshot,
  labRootSnapshot: PlaywrightPageSnapshot,
  programs: HanyangGraduateProgram[],
  labIndexes: LabIndex[],
): HanyangGraduateDiscoveryReport["discoveryReport"] {
  return {
    departmentPage: {
      finalUrl: departmentSnapshot.finalUrl,
      status: departmentSnapshot.status,
      title: departmentSnapshot.title,
      headings: departmentSnapshot.headings,
      iframeUrls: departmentSnapshot.iframeUrls,
      departmentLinkCount: programs.length,
    },
    labRootPage: {
      finalUrl: labRootSnapshot.finalUrl,
      status: labRootSnapshot.status,
      title: labRootSnapshot.title,
      headings: labRootSnapshot.headings,
      iframeUrls: labRootSnapshot.iframeUrls,
      collegeLabIndexCount: labIndexes.length,
    },
    professorListUrlPattern: "graduate/lab_03.php?catcode={departmentCatcode} renders lab cards with professor name/email/research fields.",
    professorDetailUrlPattern: undefined,
    labHomepageLinkPattern: ".lab_info a.homepage, optional per lab card; empty link text but stable class.",
    membersTraversal: "For cards with a lab homepage, member pages are discovered from Homepage/Lab root links containing Members/People/Team/Students/구성원/연구원 and common derived paths. Counts are left unknown when current-member evidence is absent.",
    publicationsTraversal: "No reliable DBLP/Scholar/publication URLs are exposed on the graduate lab cards; external lab homepages may contain publication pages but ambiguous name-only DBLP/Scholar matches are not stored.",
    structuralNotes: [
      "TARGET_URL is static EUC-KR HTML with department rows under .department_con .part_list and no iframe.",
      "Department detail pages contain program descriptions, not professor detail pages.",
      "The graduate research lab flow is separate: graduate/lab.php -> lab_02.php?catcode=college -> lab_03.php?catcode=department.",
      "lab_03 pages expose lab cards but not individual professor profile detail URLs.",
      "Some lab cards lack homepage links; those use the lab_03 department page as a conservative fallback and are flagged.",
    ],
    adapterDesign: [
      "Use shared Playwright snapshot utility for page verification.",
      "Use Hanyang adapter selectors for .department_con, lab_02, lab_03, and .lab_info.",
      "Classify from lab research text first, then lab/department names.",
      "Use shared member-count enrichment only for external lab homepages; never count department/faculty list rows as members.",
    ],
  };
}

function summarize(
  programs: HanyangGraduateProgram[],
  labIndexes: LabIndex[],
  labDepartmentIndexes: LabDepartmentIndex[],
  labCandidates: HanyangLabCandidate[],
  professorCandidates: HanyangProfessorCandidate[],
): HanyangGraduateDiscoveryReport["summary"] {
  const countsByCollege: Record<string, number> = {};
  const countsByDepartment: Record<string, number> = {};
  const professorCountsByDepartment: Record<string, number> = {};
  const taxonomyMatchCounts: Record<string, number> = {};
  let taxonomySuggestionCount = 0;

  for (const candidate of labCandidates) {
    incrementCount(countsByCollege, candidate.collegeName);
    incrementCount(countsByDepartment, candidate.departmentName);
    taxonomySuggestionCount += candidate.classification.suggestions.length;
    for (const match of candidate.classification.matches) {
      incrementCount(taxonomyMatchCounts, match.labelKo);
    }
  }
  for (const candidate of professorCandidates) {
    incrementCount(professorCountsByDepartment, candidate.departmentName);
  }

  return {
    programCount: programs.length,
    collegeCount: new Set(programs.map((program) => program.collegeName)).size,
    labIndexCollegeCount: labIndexes.length,
    labDepartmentCount: uniqueBy(labDepartmentIndexes, (item) => item.url).length,
    labCandidateCount: labCandidates.length,
    professorCandidateCount: professorCandidates.length,
    labHomepageCount: labCandidates.filter((candidate) => candidate.labHomepageUrl).length,
    fallbackLabUrlCount: labCandidates.filter((candidate) => !candidate.labHomepageUrl).length,
    memberCountVerifiedCount: labCandidates.filter((candidate) => typeof candidate.currentMemberCount === "number").length,
    memberCountUnknownCount: labCandidates.filter((candidate) => typeof candidate.currentMemberCount !== "number").length,
    dblpUrlCount: labCandidates.filter((candidate) => candidate.dblpUrl).length,
    scholarUrlCount: labCandidates.filter((candidate) => candidate.scholarUrl).length,
    taxonomyMatchCount: labCandidates.filter((candidate) => candidate.classification.matches.length > 0).length,
    taxonomySuggestionCount,
    countsByCollege: Object.fromEntries(Object.entries(countsByCollege).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    countsByDepartment: Object.fromEntries(Object.entries(countsByDepartment).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    professorCountsByDepartment: Object.fromEntries(Object.entries(professorCountsByDepartment).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    taxonomyMatchCounts: Object.fromEntries(Object.entries(taxonomyMatchCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
  };
}

function mergeClassifications(a: ResearchClassification, b: ResearchClassification): ResearchClassification {
  return {
    matches: uniqueBy([...a.matches, ...b.matches], (match) => match.fieldId),
    suggestions: uniqueBy([...a.suggestions, ...b.suggestions], (suggestion) => suggestion.suggestedLabel),
  };
}

function mergeDuplicateLabs(candidates: HanyangLabCandidate[]): HanyangLabCandidate[] {
  const byKey = new Map<string, HanyangLabCandidate>();
  for (const candidate of candidates) {
    const keys = mergeKeys(candidate);
    const affiliations = candidate.affiliations ?? [{
      collegeName: candidate.collegeName,
      departmentName: candidate.departmentName,
      sourceUrl: candidate.sourceUrl,
    }];
    const existing = keys.map((key) => byKey.get(key)).find((value): value is HanyangLabCandidate => Boolean(value));
    if (!existing) {
      const next = { ...candidate, affiliations };
      for (const key of keys) {
        byKey.set(key, next);
      }
      continue;
    }

    existing.affiliations = uniqueBy([...(existing.affiliations ?? []), ...affiliations], (item) =>
      `${item.collegeName}|${item.departmentName}|${item.sourceUrl}`,
    );
    existing.classification = mergeClassifications(existing.classification, candidate.classification);
    existing.warnings = [...new Set([...existing.warnings, ...candidate.warnings])];
    existing.researchText = existing.researchText ?? candidate.researchText;
    existing.homepageResearchText = existing.homepageResearchText ?? candidate.homepageResearchText;
    existing.homepageResearchSourceUrl = existing.homepageResearchSourceUrl ?? candidate.homepageResearchSourceUrl;
    existing.researchEvidenceCandidatePages = existing.researchEvidenceCandidatePages ?? candidate.researchEvidenceCandidatePages;
    existing.labHomepageUrl = choosePreferredLabHomepage(existing.labHomepageUrl, candidate.labHomepageUrl);
    existing.labUrl = existing.labHomepageUrl ?? existing.labUrl;
    existing.pdfUrl = existing.pdfUrl ?? candidate.pdfUrl;
    existing.currentMemberCount = existing.currentMemberCount ?? candidate.currentMemberCount;
    existing.memberCountBreakdown = existing.memberCountBreakdown ?? candidate.memberCountBreakdown;
    existing.memberCountSourceUrl = existing.memberCountSourceUrl ?? candidate.memberCountSourceUrl;
    existing.memberCountCrawledAt = existing.memberCountCrawledAt ?? candidate.memberCountCrawledAt;
    existing.memberCountCandidatePages = existing.memberCountCandidatePages ?? candidate.memberCountCandidatePages;
    for (const key of keys) {
      byKey.set(key, existing);
    }
  }
  return uniqueBy([...byKey.values()], (candidate) =>
    `${candidate.professorName ?? ""}|${candidate.email ?? ""}|${candidate.labName ?? ""}|${candidate.labUrl}`,
  );
}

function normalizeUrlKey(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

function mergeKeys(candidate: HanyangLabCandidate): string[] {
  const keys = [
    candidate.email ? `email:${candidate.email}` : undefined,
    candidate.labHomepageUrl && candidate.professorName
      ? `professor-homepage:${candidate.professorName}|${normalizeUrlKey(candidate.labHomepageUrl)}`
      : undefined,
    `name-lab-source:${candidate.professorName ?? ""}|${candidate.labName ?? ""}|${candidate.sourceUrl}`,
  ];
  return [...new Set(keys.filter((key): key is string => Boolean(key)))];
}

function choosePreferredLabHomepage(current: string | undefined, incoming: string | undefined): string | undefined {
  if (!current) {
    return incoming;
  }
  if (!incoming) {
    return current;
  }
  if (isLikelyMisresolvedHanyangExternalUrl(current) && !isLikelyMisresolvedHanyangExternalUrl(incoming)) {
    return incoming;
  }
  return current;
}

function isLikelyMisresolvedHanyangExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "www.grad.hanyang.ac.kr" && /\/graduate\/[^/]+\.[^/]+/.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function extractPrograms(context: BrowserContext, sourceUrl: string): Promise<HanyangGraduateProgram[]> {
  const page = await context.newPage();
  try {
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    const rawPrograms = await page.$$eval(".department_con .part_list", (sections, baseUrl) => {
      const clean = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
      const resolve = (rawUrl: string | null | undefined) => {
        if (!rawUrl || rawUrl.startsWith("javascript:") || rawUrl.startsWith("mailto:") || rawUrl.startsWith("tel:")) {
          return undefined;
        }
        try {
          const trimmed = rawUrl.trim();
          const normalized = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("/")
            ? trimmed
            : /^[^/\s]+\.[^/\s]+/.test(trimmed)
              ? `http://${trimmed}`
              : trimmed;
          return new URL(normalized, String(baseUrl)).toString();
        } catch {
          return undefined;
        }
      };

      return sections.flatMap((section) => {
        const output: Array<{ collegeName: string; name: string; sourceUrl?: string; homepageUrl?: string }> = [];
        let collegeName = "";
        for (const child of [...section.children]) {
          if (child.classList.contains("tit")) {
            collegeName = clean(child.textContent);
            continue;
          }
          if (!child.classList.contains("part_sub")) {
            continue;
          }
          for (const row of [...child.querySelectorAll("li")]) {
            const departmentLink = [...row.querySelectorAll<HTMLAnchorElement>("a[href]")].find((anchor) =>
              /departmentintro_view\.php/.test(anchor.getAttribute("href") ?? ""),
            );
            const homepageLink = row.querySelector<HTMLAnchorElement>("a.homepageBtn[href]");
            output.push({
              collegeName,
              name: clean(departmentLink?.textContent),
              sourceUrl: resolve(departmentLink?.getAttribute("href")),
              homepageUrl: resolve(homepageLink?.getAttribute("href")),
            });
          }
        }
        return output;
      });
    }, sourceUrl);

    const programs = rawPrograms
      .filter((program) => Boolean(program.name && program.sourceUrl))
      .map((program) => ({
        collegeName: program.collegeName,
        name: program.name,
        sourceUrl: program.sourceUrl as string,
        homepageUrl: program.homepageUrl,
      }));

    return uniqueBy(
      programs
        .map((program) => ({
          ...program,
          classification: { matches: [], suggestions: [] },
        })),
      (program) => `${program.collegeName}|${program.name}|${program.sourceUrl}`,
    );
  } finally {
    await page.close();
  }
}

async function extractLabIndexes(context: BrowserContext): Promise<LabIndex[]> {
  const page = await context.newPage();
  try {
    await page.goto(labRootUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    const rawIndexes = await page.$$eval("a[href*='lab_02.php?catcode=']", (links, baseUrl) => {
      const clean = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
      return links.map((link) => {
        const anchor = link as HTMLAnchorElement;
        return {
          collegeName: clean(anchor.innerText || anchor.textContent),
          url: new URL(anchor.getAttribute("href") ?? "", String(baseUrl)).toString(),
        };
      });
    }, labRootUrl);

    return uniqueBy(
      rawIndexes
        .map((index) => ({ collegeName: stripArrow(index.collegeName), url: index.url }))
        .filter((index) => index.collegeName && index.url),
      (index) => index.url,
    );
  } finally {
    await page.close();
  }
}

async function extractLabDepartmentIndexes(context: BrowserContext, labIndex: LabIndex): Promise<LabDepartmentIndex[]> {
  const page = await context.newPage();
  try {
    await page.goto(labIndex.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    const rawDepartments = await page.$$eval("a[href*='lab_03.php?catcode=']", (links, baseUrl) => {
      const clean = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
      return links.map((link) => {
        const anchor = link as HTMLAnchorElement;
        return {
          departmentName: clean(anchor.innerText || anchor.textContent),
          url: new URL(anchor.getAttribute("href") ?? "", String(baseUrl)).toString(),
        };
      });
    }, labIndex.url);

    return uniqueBy(
      rawDepartments
        .map((item) => ({
          collegeName: labIndex.collegeName,
          departmentName: stripArrow(item.departmentName),
          url: item.url,
        }))
        .filter((item) => item.departmentName && item.url),
      (item) => item.url,
    );
  } finally {
    await page.close();
  }
}

async function extractLabsForDepartment(context: BrowserContext, department: LabDepartmentIndex): Promise<HanyangLabCandidate[]> {
  const page = await context.newPage();
  try {
    await page.goto(department.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    const rawLabs = await page.$$eval(".lab_info", (cards, baseUrl) => {
      const clean = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
      const resolve = (rawUrl: string | null | undefined) => {
        if (!rawUrl || rawUrl.startsWith("javascript:") || rawUrl.startsWith("mailto:") || rawUrl.startsWith("tel:")) {
          return undefined;
        }
        try {
          return new URL(rawUrl, String(baseUrl)).toString();
        } catch {
          return undefined;
        }
      };
      const labeledValue = (card: Element, label: string) => {
        const row = [...card.querySelectorAll("li")].find((item) => clean(item.textContent).startsWith(label));
        return clean(row?.textContent).replace(new RegExp(`^${label}\\s*:?\\s*`), "") || undefined;
      };

      return cards.map((card) => {
        const h5 = card.querySelector("h5")?.cloneNode(true) as HTMLElement | undefined;
        h5?.querySelectorAll(".btn,.file_view").forEach((node) => node.remove());
        const labName = clean([...((h5?.childNodes ?? []) as unknown as ChildNode[])]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent)
          .join(" "));
        const researchText = clean(card.querySelector(".cont")?.textContent);
        return {
          departmentName: "",
          labName,
          professorName: labeledValue(card, "담당교수"),
          email: labeledValue(card, "이메일"),
          phone: labeledValue(card, "전화번호"),
          location: clean(card.querySelector(".position")?.textContent) || undefined,
          researchText: researchText || undefined,
          homepageUrl: resolve(card.querySelector<HTMLAnchorElement>("a.homepage[href]")?.getAttribute("href")),
          pdfUrl: resolve(card.querySelector<HTMLAnchorElement>("a.file[href]")?.getAttribute("href")),
        } satisfies RawLab;
      });
    }, department.url);

    return rawLabs
      .filter((lab) => lab.labName || lab.professorName || lab.researchText)
      .map((lab) => {
        const labHomepageUrl = resolveUrl(lab.homepageUrl, department.url);
        const warnings = labHomepageUrl ? [] : ["연구실 홈페이지 없음, fallback 사용"];
        const candidate: HanyangLabCandidate = {
          collegeName: department.collegeName,
          departmentName: department.departmentName,
          labName: cleanText(lab.labName),
          professorName: normalizeProfessorName(lab.professorName),
          email: cleanText(lab.email)?.toLowerCase(),
          phone: cleanText(lab.phone),
          location: cleanText(lab.location),
          researchText: cleanText(lab.researchText),
          labUrl: labHomepageUrl ?? department.url,
          labHomepageUrl,
          sourceUrl: department.url,
          affiliations: [{
            collegeName: department.collegeName,
            departmentName: department.departmentName,
            sourceUrl: department.url,
          }],
          pdfUrl: resolveUrl(lab.pdfUrl, department.url),
          classification: { matches: [], suggestions: [] },
          warnings,
        };
        candidate.classification = classifyLabResearch(candidate);
        return candidate;
      });
  } finally {
    await page.close();
  }
}

async function bodyLines(context: BrowserContext, url: string): Promise<string[]> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    const text = await page.locator("body").innerText();
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } finally {
    await page.close();
  }
}

function isPhone(value: string | undefined): boolean {
  return /^0\d{1,2}-\d{3,4}-\d{4}$/.test(value ?? "");
}

function isEmail(value: string | undefined): boolean {
  return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value ?? "");
}

function isUrl(value: string | undefined): boolean {
  return /^https?:\/\//i.test(value ?? "");
}

function shouldAttemptDepartmentHomepageEnrichment(program: HanyangGraduateProgram): boolean {
  if (!program.homepageUrl) {
    return false;
  }
  try {
    const hostname = new URL(program.homepageUrl).hostname.toLowerCase();
    return verifiedDepartmentHomepageHosts.has(hostname);
  } catch {
    return false;
  }
}

function extractResearchInterestFromDetail(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }
  const match = text.match(/연구(?:관심)?분야\s+([\s\S]*?)(?:\s+주요논문|\s+주요저서|\s+수상경력|\s+학회활동|$)/);
  return cleanResearchScopeText(match?.[1]);
}

async function extractDepartmentHomepageProfessorCards(
  context: BrowserContext,
  facultyUrl: string,
  program: HanyangGraduateProgram,
): Promise<HanyangProfessorCandidate[]> {
  const page = await context.newPage();
  try {
    await page.goto(facultyUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    const rows = await page.$$eval(".hyu-fragment-component-profile", (cards) => {
      const clean = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
      const isUrl = (value: string) => /^https?:\/\//i.test(value);
      return cards.map((card) => {
        const name = clean(card.querySelector(".hyu-profile-info-title-name")?.textContent);
        const titleBlock = clean(card.querySelector(".hyu-profile-info-title")?.textContent);
        const title = clean(titleBlock.replace(name, ""));
        const researchText = clean(card.querySelector(".hyu-profile-info-desc")?.textContent);
        const links = [...card.querySelectorAll<HTMLAnchorElement>("a[href]")].map((link) => ({
          text: clean(link.textContent),
          href: link.href || link.getAttribute("href") || "",
        }));
        const phone = links.find((link) => link.href.startsWith("tel:"))?.text;
        const email = links.find((link) => link.href.startsWith("mailto:"))?.text.toLowerCase();
        const homepageUrl = links.find((link) =>
          isUrl(link.href) && !link.href.includes("#none") && !link.href.startsWith("mailto:") && !link.href.startsWith("tel:"),
        )?.href;
        const profileDetailText = clean(card.querySelector(".more-info-modal")?.textContent);
        return { name, title, researchText, phone, email, homepageUrl, profileDetailText };
      }).filter((row) => row.name && (row.email || row.researchText || row.profileDetailText));
    });

    return rows.map((row) => {
      const detailResearchText = extractResearchInterestFromDetail(row.profileDetailText);
      const researchText = detailResearchText ?? cleanResearchScopeText(row.researchText);
      return {
        collegeName: program.collegeName,
        departmentName: program.name,
        name: row.name.replace(/\/학과장$/, ""),
        title: row.name.includes("학과장") ? "학과장 교수" : cleanText(row.title),
        email: cleanText(row.email)?.toLowerCase(),
        phone: cleanText(row.phone),
        profileUrl: facultyUrl,
        labHomepageUrl: row.homepageUrl,
        researchText,
        profileDetailText: cleanText(row.profileDetailText),
        profileDetailSourceUrl: facultyUrl,
        sourceUrl: facultyUrl,
        classification: classifyResearchText([researchText, program.name].filter(Boolean).join(" | ")),
        warnings: row.profileDetailText ? [] : ["교수 상세 프로필 모달 없음"],
      };
    });
  } finally {
    await page.close();
  }
}

async function extractEeceDepartmentHomepageLabs(
  context: BrowserContext,
  labAllUrl: string,
  program: HanyangGraduateProgram,
): Promise<HanyangLabCandidate[]> {
  const page = await context.newPage();
  try {
    await page.goto(labAllUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    const rows = await page.$$eval("table", (tables) => {
      const clean = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
      const categories = ["반도체", "신호처리", "전기에너지", "제어/로봇", "컴퓨터", "통신", "회로"];
      return tables.flatMap((table, tableIndex) =>
        [...table.querySelectorAll("tbody tr")].map((row) => {
          const cells = [...row.querySelectorAll<HTMLTableCellElement>("td")];
          const labName = clean(cells[0]?.textContent);
          const professorName = clean(cells[1]?.textContent);
          const phone = clean(cells[2]?.textContent);
          const location = clean(cells[3]?.textContent);
          const homepageUrl = cells[0]?.querySelector<HTMLAnchorElement>("a[href]")?.href;
          return {
            category: categories[tableIndex] ?? "",
            labName,
            professorName,
            phone,
            location,
            homepageUrl,
          };
        }),
      ).filter((row) => row.labName && row.professorName);
    });

    return rows.map((row) => {
      const researchText = cleanText([row.category, row.labName].filter(Boolean).join(" | "));
      const candidate: HanyangLabCandidate = {
        collegeName: program.collegeName,
        departmentName: program.name,
        labName: cleanText(row.labName),
        professorName: normalizeProfessorName(row.professorName),
        phone: cleanText(row.phone),
        location: cleanText(row.location),
        localCategory: cleanText(row.category),
        researchText,
        labUrl: row.homepageUrl ?? labAllUrl,
        labHomepageUrl: row.homepageUrl,
        sourceUrl: labAllUrl,
        affiliations: [{
          collegeName: program.collegeName,
          departmentName: program.name,
          sourceUrl: labAllUrl,
        }],
        classification: { matches: [], suggestions: [] },
        warnings: row.homepageUrl
          ? ["학과 홈페이지 연구실 페이지에서 보강"]
          : ["학과 홈페이지 연구실 페이지에서 보강", "외부 연구실 홈페이지 없음"],
      };
      candidate.classification = classifyLabResearch(candidate);
      return candidate;
    });
  } finally {
    await page.close();
  }
}

function parseDepartmentHomepageLab(lines: string[], sourceUrl: string): DepartmentHomepageLab | undefined {
  const professorIndex = lines.findIndex((line) => line === "담당교수");
  const researchIndex = lines.findIndex((line) => line === "연구분야");
  if (professorIndex < 0 || researchIndex < 0) {
    return undefined;
  }

  const labName = lines.find((line) => /연구실|실험실/.test(line) && /\s-\s/.test(line))?.replace(/\s*-\s*.+$/, "")
    ?? lines.find((line, index) => index < professorIndex && /연구실|실험실/.test(line) && line !== "연구실")
    ?? "";
  const location = lines[lines.findIndex((line) => line === "실험실 위치") + 1];
  const phone = lines[lines.findIndex((line) => line === "실험실 전화") + 1];
  const homepageCandidate = lines[lines.findIndex((line) => line === "홈페이지") + 1];
  const researchEnd = lines.findIndex((line, index) => index > researchIndex && line === "연구실 소개");
  const researchText = lines
    .slice(researchIndex + 1, researchEnd > researchIndex ? researchEnd : researchIndex + 8)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    labName,
    professorName: lines[professorIndex + 1] ?? "",
    location,
    phone: isPhone(phone) ? phone : undefined,
    homepageUrl: isUrl(homepageCandidate) ? homepageCandidate : undefined,
    researchText: cleanResearchScopeText(researchText),
    sourceUrl,
  };
}

async function extractDepartmentHomepageFacultyAndLabs(context: BrowserContext, program: HanyangGraduateProgram): Promise<{
  professors: HanyangProfessorCandidate[];
  labs: HanyangLabCandidate[];
}> {
  if (!program.homepageUrl) {
    return { professors: [], labs: [] };
  }
  const homepageUrl = program.homepageUrl;
  const homeSnapshot = await snapshotPlaywrightPage(context, homepageUrl);
  const facultyUrl = homeSnapshot.links.find((link) => /교수진|교수|faculty|professor/i.test(link.text))?.href;
  const labLinks = uniqueBy(
    homeSnapshot.links
      .filter((link) =>
        /연구실|실험실/i.test(link.text)
        && !/^연구실(?:\s*소개)?$/.test(link.text)
        && /fn\.hanyang\.ac\.kr\/-\d+$/.test(link.href),
      )
      .map((link) => ({ label: link.text, url: link.href })),
    (link) => link.url,
  );

  const professorCandidates = facultyUrl
    ? await extractDepartmentHomepageProfessorCards(context, facultyUrl, program)
    : [];

  const hostname = new URL(homepageUrl).hostname.toLowerCase();
  if (hostname === "eece.hanyang.ac.kr") {
    const labAllUrl = homeSnapshot.links.find((link) => /연구실|lab/i.test(link.text) && /\/lab_all(?:$|[?#])/.test(link.href))?.href
      ?? `${new URL(homepageUrl).origin}/lab_all`;
    return {
      professors: professorCandidates,
      labs: await extractEeceDepartmentHomepageLabs(context, labAllUrl, program),
    };
  }

  const departmentHomepageLabs = (await Promise.all(labLinks.map(async (link) => parseDepartmentHomepageLab(await bodyLines(context, link.url), link.url))))
    .filter((lab): lab is DepartmentHomepageLab => Boolean(lab?.labName && lab.professorName));
  const labs: HanyangLabCandidate[] = departmentHomepageLabs.map((lab) => {
    const professor = professorCandidates.find((row) => row.name === lab.professorName);
    const candidate: HanyangLabCandidate = {
      collegeName: program.collegeName,
      departmentName: program.name,
      labName: cleanText(lab.labName),
      professorName: normalizeProfessorName(lab.professorName),
      email: professor?.email,
      phone: lab.phone ?? professor?.phone,
      location: cleanText(lab.location),
      researchText: cleanText(lab.researchText),
      labUrl: lab.homepageUrl ?? lab.sourceUrl,
      labHomepageUrl: lab.homepageUrl,
      sourceUrl: lab.sourceUrl,
      affiliations: [{
        collegeName: program.collegeName,
        departmentName: program.name,
        sourceUrl: lab.sourceUrl,
      }],
      classification: { matches: [], suggestions: [] },
      warnings: lab.homepageUrl ? ["학과 홈페이지 연구실 페이지에서 보강"] : ["학과 홈페이지 연구실 페이지에서 보강", "외부 연구실 홈페이지 없음"],
    };
    candidate.classification = classifyLabResearch(candidate);
    return candidate;
  });

  return { professors: professorCandidates, labs };
}

async function enrichMemberCounts(candidates: HanyangLabCandidate[], maxLabs: number): Promise<void> {
  let enriched = 0;
  for (const candidate of candidates) {
    if (!candidate.labHomepageUrl || enriched >= maxLabs) {
      continue;
    }
    enriched += 1;
    const result = await enrichLabMemberCount(candidate.labHomepageUrl);
    candidate.memberCountCandidatePages = result.candidatePages;
    if (typeof result.count === "number") {
      candidate.currentMemberCount = result.count;
      candidate.memberCountBreakdown = result.breakdown;
      candidate.memberCountSourceUrl = result.sourceUrl;
      candidate.memberCountCrawledAt = new Date().toISOString();
    } else {
      candidate.warnings.push("연구원수 확인 불가");
    }
  }
}

async function enrichResearchEvidence(context: BrowserContext, candidates: HanyangLabCandidate[], maxLabs: number): Promise<void> {
  const enrichable = candidates.filter((candidate) => candidate.labHomepageUrl).slice(0, maxLabs);
  const enrichableSet = new Set(enrichable);
  for (const candidate of candidates) {
    if (!enrichableSet.has(candidate)) {
      candidate.classification = classifyLabResearch(candidate);
    }
  }

  await mapWithConcurrency(enrichable, 5, async (candidate) => {
    const result = await enrichLabResearchEvidence(context, candidate.labHomepageUrl, candidate.labName);
    candidate.researchEvidenceCandidatePages = result.candidatePages;
    if (result.text) {
      candidate.homepageResearchText = cleanResearchScopeText(result.text);
      candidate.homepageResearchSourceUrl = result.sourceUrl;
      if (!candidate.homepageResearchText) {
        candidate.warnings.push("연구실 홈페이지 연구분야 본문 전처리 후 비어 있음");
      }
    } else {
      candidate.warnings.push("연구실 홈페이지 소개/연구분야 본문 확인 불가");
    }
    candidate.warnings.push(...result.warnings);
    candidate.classification = classifyLabResearch(candidate);
  });
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      if (item !== undefined) {
        await worker(item);
      }
    }
  });
  await Promise.all(workers);
}

export async function discoverHanyangGraduateSeeds(context: BrowserContext, options?: {
  sourceUrl?: string;
  maxLabColleges?: number;
  maxLabDepartments?: number;
  maxResearchEnrichmentLabs?: number;
  maxMemberEnrichmentLabs?: number;
}): Promise<HanyangGraduateDiscoveryReport> {
  const sourceUrl = options?.sourceUrl ?? defaultSourceUrl;
  const failedPages: HanyangGraduateDiscoveryReport["failedPages"] = [];
  const departmentSnapshot = await snapshotPlaywrightPage(context, sourceUrl);
  const labRootSnapshot = await snapshotPlaywrightPage(context, labRootUrl);
  const programs = await extractPrograms(context, sourceUrl);
  const labIndexes = (await extractLabIndexes(context)).slice(0, options?.maxLabColleges ?? Number.POSITIVE_INFINITY);
  const labDepartmentIndexes: LabDepartmentIndex[] = [];

  for (const labIndex of labIndexes) {
    try {
      labDepartmentIndexes.push(...await extractLabDepartmentIndexes(context, labIndex));
    } catch (error) {
      failedPages.push({ url: labIndex.url, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const selectedLabDepartments = labDepartmentIndexes.slice(0, options?.maxLabDepartments ?? Number.POSITIVE_INFINITY);
  const labCandidates: HanyangLabCandidate[] = [];
  for (const department of selectedLabDepartments) {
    try {
      labCandidates.push(...await extractLabsForDepartment(context, department));
    } catch (error) {
      failedPages.push({ url: department.url, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const uniqueLabs = mergeDuplicateLabs(labCandidates);

  const maxResearchEnrichmentLabs = options?.maxResearchEnrichmentLabs ?? 0;
  if (maxResearchEnrichmentLabs > 0) {
    await enrichResearchEvidence(context, uniqueLabs, maxResearchEnrichmentLabs);
  } else {
    for (const candidate of uniqueLabs) {
      candidate.classification = classifyLabResearch(candidate);
    }
  }

  const maxMemberEnrichmentLabs = options?.maxMemberEnrichmentLabs ?? 0;
  if (maxMemberEnrichmentLabs > 0) {
    await enrichMemberCounts(uniqueLabs, maxMemberEnrichmentLabs);
  }

  let finalLabCandidates = uniqueLabs;
  let professorCandidates: HanyangProfessorCandidate[] = [];
  const departmentHomepagePrograms = uniqueBy(
    programs
      .filter(shouldAttemptDepartmentHomepageEnrichment)
      .sort((a, b) => {
        const aIsBk21 = /BK21/.test(a.collegeName);
        const bIsBk21 = /BK21/.test(b.collegeName);
        return Number(aIsBk21) - Number(bIsBk21);
      }),
    (program) => program.homepageUrl ?? `${program.collegeName}|${program.name}`,
  );
  for (const program of departmentHomepagePrograms) {
    try {
      const enriched = await extractDepartmentHomepageFacultyAndLabs(context, program);
      professorCandidates = uniqueBy([...professorCandidates, ...enriched.professors], (professor) =>
        professor.email ?? `${professor.departmentName}|${professor.name}`,
      );
      if (enriched.labs.length > 0) {
        finalLabCandidates = [
          ...finalLabCandidates.filter((candidate) => candidate.departmentName !== program.name),
          ...enriched.labs,
        ];
      }
    } catch (error) {
      failedPages.push({
        url: program.homepageUrl ?? program.sourceUrl,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    sourceUrl,
    generatedAt: new Date().toISOString(),
    discoveryReport: buildDiscoveryMetadata(departmentSnapshot, labRootSnapshot, programs, labIndexes),
    programs,
    professorCandidates,
    labCandidates: finalLabCandidates,
    failedPages,
    summary: summarize(programs, labIndexes, selectedLabDepartments, finalLabCandidates, professorCandidates),
  };
}
