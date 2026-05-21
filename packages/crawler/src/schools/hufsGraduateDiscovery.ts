import type { BrowserContext, Page } from "playwright";
import { enrichLabMemberCount } from "../core/labMetrics.js";
import { classifyResearchText, type ResearchClassification } from "../taxonomy/researchTaxonomy.js";

export type HufsGraduateDepartment = {
  collegeName: string;
  name: string;
  homepageUrl?: string;
  email?: string;
  location?: string;
  phone?: string;
  facultyListUrl?: string;
  facultyListPattern?: string;
  facultyCount?: number;
  discoveryWarnings: string[];
  classification: ResearchClassification;
};

export type HufsFacultyCandidate = {
  departmentName: string;
  collegeName: string;
  nameKo?: string;
  nameEn?: string;
  title?: string;
  email?: string;
  office?: string;
  homepageUrl?: string;
  profileUrl?: string;
  labUrl?: string;
  labUrlType: "external_lab_or_homepage" | "profile_fallback" | "faculty_page_fallback";
  fallbackReason?: string;
  researchText?: string;
  publicationCount?: number;
  publicationCountSourceUrl?: string;
  scholarUrl?: string;
  dblpUrl?: string;
  currentMemberCount?: number;
  memberCountBreakdown?: Record<string, number>;
  memberCountSourceUrl?: string;
  memberCountCrawledAt?: string;
  sourceUrl: string;
  classification: ResearchClassification;
  classificationSource: "research_text" | "department_fallback" | "unclassified";
  warnings: string[];
};

export type HufsGraduateDiscoveryReport = {
  sourceUrl: string;
  generatedAt: string;
  departments: HufsGraduateDepartment[];
  facultyCandidates: HufsFacultyCandidate[];
  failedPages: Array<{ url: string; stage: string; message: string }>;
  summary: {
    departmentCount: number;
    departmentsWithHomepage: number;
    departmentsWithFacultyList: number;
    professorCount: number;
    labUrlCount: number;
    externalLabUrlCount: number;
    fallbackLabUrlCount: number;
    memberCountKnown: number;
    dblpUrlCount: number;
    scholarUrlCount: number;
    publicationCountKnown: number;
    taxonomyMatchCounts: Record<string, number>;
    uncategorizedCount: number;
    countsByCollege: Record<string, number>;
    manualReviewCount: number;
  };
};

type RawDepartmentRow = {
  collegeName?: string;
  name?: string;
  homepageUrl?: string;
  email?: string;
  location?: string;
  phone?: string;
};

type PageSnapshot = {
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  links: Array<{ text: string; href: string; className?: string }>;
};

type FacultyCard = {
  nameKo?: string;
  nameEn?: string;
  title?: string;
  email?: string;
  office?: string;
  homepageUrl?: string;
  profileUrl?: string;
  researchText?: string;
  rawText: string;
};

const defaultSourceUrl = "https://gra.hufs.ac.kr/gra/6634/subview.do";
const pageTimeoutMs = Number(process.env.HUFS_PAGE_TIMEOUT_MS ?? 12_000);
const pageDelayMs = Number(process.env.HUFS_DELAY_MS ?? 250);
const bibliographicUrlPattern = /(?:scholar\.google|dblp\.org|orcid\.org|researchgate\.net|scopus\.com|publons\.com|webofscience|semanticscholar\.org)/i;
const nonLabHomepagePattern = /(?:^https?:\/\/(?:m\.)?blog\.naver\.com|^https?:\/\/terms\.naver\.com|youtube\.com|youtu\.be|instagram\.com|facebook\.com|linkedin\.com|(?:^|\/\/)x\.com|twitter\.com|press|news|article|postview|wikipedia\.org)/i;
const scholarUrlPattern = /scholar\.google\.[^/]+\/citations/i;
const dblpUrlPattern = /dblp\.org/i;
const leadingFacultyTitlePattern = /^(?:명예교수|석좌교수|초빙교수|겸임교수|객원교수|특임교수|교수님?|부교수|조교수)\s+/;
const facultyTitlePattern = /명예교수|석좌교수|초빙교수|겸임교수|객원교수|특임교수|부교수|조교수|교수/;
const invalidExternalLabUrlReasons: Record<string, string> = {
  "https://lab.hufs.ac.kr/pmi": "외부 연구실 홈페이지가 Playwright 검증에서 Not Found/404로 확인되어 연구실 홈페이지 없음, 교수 상세 페이지 fallback 사용",
};

const verifiedMemberCountsByLabUrl: Record<string, {
  count: number;
  breakdown: Record<string, number>;
  sourceUrl: string;
  note: string;
}> = {
  "https://sites.google.com/hufs.ac.kr/linclab": {
    count: 7,
    breakdown: { doctoral_or_integrated: 4, master_or_linked: 3 },
    sourceUrl: "https://sites.google.com/hufs.ac.kr/linclab/students",
    note: "Playwright 수동 검증: STUDENTS 페이지에서 석사 졸업 1명을 제외하고 현재 과정 재학생만 집계",
  },
  "https://sites.google.com/view/jaesson": {
    count: 5,
    breakdown: { phd_candidate: 2, phd: 2, master: 1 },
    sourceUrl: "https://sites.google.com/view/jaesson/advisees-alumni",
    note: "Playwright 수동 검증: Advisees & Alumni 페이지의 Current Students 섹션만 집계",
  },
  "https://www.imshufs.com/": {
    count: 3,
    breakdown: { graduate: 1, undergraduate: 1, postdoc: 1 },
    sourceUrl: "https://www.imshufs.com/people",
    note: "Playwright 수동 검증: Alumni - Researchers 이후 항목 제외",
  },
  "https://rtg.hufs.ac.kr/": {
    count: 2,
    breakdown: { undergraduate: 2 },
    sourceUrl: "https://rtg.hufs.ac.kr/people/",
    note: "Playwright 수동 검증: Former Undergraduates 섹션 제외",
  },
  "https://sites.google.com/hufs.ac.kr/shannon": {
    count: 3,
    breakdown: { undergraduate: 3 },
    sourceUrl: "https://sites.google.com/hufs.ac.kr/shannon/members",
    note: "Playwright 수동 검증: Members 페이지의 현재 표시 이름만 집계",
  },
  "https://sites.google.com/view/limseungho": {
    count: 5,
    breakdown: { undergraduate: 5 },
    sourceUrl: "https://sites.google.com/view/limseungho/members",
    note: "Playwright 수동 검증: Alumni 섹션 이전 Undergraduate Students만 집계",
  },
  "https://labhai.hufs.ac.kr/": {
    count: 14,
    breakdown: { doctoral_or_integrated: 7, master: 2, undergraduate: 5 },
    sourceUrl: "https://labhai.hufs.ac.kr/people.html",
    note: "Playwright 수동 검증: PEOPLE 페이지의 RESEARCHERS 섹션만 집계하고 ALUMNI 제외",
  },
  "https://mi.hufs.ac.kr/": {
    count: 9,
    breakdown: { postdoc: 1, doctoral_or_integrated: 4, undergraduate: 4 },
    sourceUrl: "https://mi.hufs.ac.kr/?c=people",
    note: "Playwright 수동 검증: Researchers 페이지에서 Alumni 이전 현재 구성원만 집계",
  },
  "https://sites.google.com/hufs.ac.kr/bel": {
    count: 5,
    breakdown: { master: 2, undergraduate_intern: 3 },
    sourceUrl: "https://sites.google.com/hufs.ac.kr/bel/members",
    note: "Playwright 수동 검증: Members 페이지의 Master's Student와 Undergraduate Intern만 집계",
  },
  "https://sites.google.com/view/nanelshin/": {
    count: 3,
    breakdown: { undergraduate: 3 },
    sourceUrl: "https://sites.google.com/view/nanelshin/members",
    note: "Playwright 수동 검증: CURRENT MEMBERS 섹션만 집계하고 ALUMNI 제외",
  },
  "https://sites.google.com/view/prismlab414": {
    count: 6,
    breakdown: { master: 1, undergraduate_researcher: 5 },
    sourceUrl: "https://sites.google.com/view/prismlab414/member",
    note: "Playwright 수동 검증: Member 페이지의 현재 M.S. Student와 Undergraduate Researcher만 집계",
  },
  "https://afmlab.hufs.ac.kr/": {
    count: 5,
    breakdown: { graduate: 5 },
    sourceUrl: "https://afmlab.hufs.ac.kr/member",
    note: "Playwright 수동 검증: Graduate Students 섹션만 집계하고 Alumni 제외",
  },
};

function cleanText(input: string | undefined | null): string | undefined {
  const value = input?.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return value || undefined;
}

function normalizeResearchSegment(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[|,;:·ㆍ\-.()[\]{}]/g, "")
    .trim();
}

function isResearchNoiseSegment(input: string): boolean {
  const value = cleanText(input);
  if (!value) {
    return true;
  }
  if (/^(?:전화번호|연락처|이메일|email|e-mail|홈페이지|homepage|website|연구실|office|위치|주요 연구|주요연구|연구비수주\/수상내역)$/i.test(value)) {
    return true;
  }
  if (/(?:전화번호|연락처|Tel\.?|Phone)\s*[:：|]?\s*\+?\d[\d\s().-]{5,}/i.test(value)) {
    return true;
  }
  if (/(?:이메일|Email|E-mail)\s*[:：|]?\s*[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) {
    return true;
  }
  if (/^(?:\+?\d[\d\s().-]{5,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})$/i.test(value)) {
    return true;
  }
  if (/^(?:tel|fax)\.?$/i.test(value)) {
    return true;
  }
  return false;
}

function cleanResearchText(...inputs: Array<string | undefined>): string | undefined {
  const seen = new Set<string>();
  const segments: string[] = [];

  for (const input of inputs) {
    for (const rawSegment of (input ?? "").split(/\s*\|\s*/)) {
      const segment = cleanText(
        rawSegment
          .replace(/\b(?:전화번호|Tel\.?|Phone|연락처)\b\s*[:：]?\s*\+?\d[\d\s().-]{5,}/gi, " ")
          .replace(/\b(?:이메일|Email|E-mail)\b\s*[:：]?\s*[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " "),
      );
      if (!segment || isResearchNoiseSegment(segment)) {
        continue;
      }
      const key = normalizeResearchSegment(segment);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      segments.push(segment);
    }
  }

  return cleanText(segments.join(" | "));
}

function normalizeDepartmentName(input: string | undefined): string | undefined {
  return cleanText(input?.replace(/\s+/g, " "));
}

function resolveUrl(rawUrl: string | undefined, baseUrl: string): string | undefined {
  const cleaned = cleanText(rawUrl);
  if (!cleaned || cleaned === "-" || /^mailto:|^tel:|^javascript:/i.test(cleaned)) {
    return undefined;
  }

  try {
    return new URL(cleaned, baseUrl).toString();
  } catch {
    return undefined;
  }
}

async function delay() {
  if (pageDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, pageDelayMs));
  }
}

async function safeGoto(page: Page, url: string) {
  await delay();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: pageTimeoutMs });
  await page.waitForLoadState("networkidle", { timeout: 2_000 }).catch(() => undefined);
}

async function snapshotPage(context: BrowserContext, url: string): Promise<PageSnapshot> {
  const page = await context.newPage();
  try {
    await safeGoto(page, url);
    return await page.evaluate(() => {
      const clean = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
      return {
        url: location.href,
        finalUrl: location.href,
        title: document.title,
        text: clean(document.body.innerText),
        links: [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
          .map((anchor) => ({
            text: clean(anchor.textContent),
            href: anchor.href,
            className: anchor.className,
          }))
          .filter((link) => link.href),
      };
    });
  } finally {
    await page.close();
  }
}

function parseDepartmentCells(cells: string[], previousCollegeName: string): RawDepartmentRow | undefined {
  if (cells.length < 4 || cells[0] === "계열") {
    return undefined;
  }

  const firstCell = cleanText(cells[0]);
  const hasCollegeCell = Boolean(firstCell?.endsWith("계열") || firstCell === "학과간 협동과정");
  const collegeName = hasCollegeCell ? firstCell : previousCollegeName;
  const offset = hasCollegeCell ? 1 : 0;
  const name = normalizeDepartmentName(cells[offset]);

  if (!name || !collegeName) {
    return undefined;
  }

  return {
    collegeName,
    name,
    email: cleanText(cells[offset + 1] === "homepage" ? cells[offset + 2] : cells[offset + 1]),
    location: cleanText(cells[offset + 1] === "homepage" ? cells[offset + 3] : cells[offset + 2]),
    phone: cleanText(cells[offset + 1] === "homepage" ? cells[offset + 4] : cells[offset + 3]),
  };
}

export async function discoverHufsDepartments(context: BrowserContext, sourceUrl = defaultSourceUrl): Promise<HufsGraduateDepartment[]> {
  const page = await context.newPage();
  try {
    await safeGoto(page, sourceUrl);
    const rawRows = await page.evaluate(() => {
      const clean = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
      return [...document.querySelectorAll("table tr")]
        .map((row) => ({
          cells: [...row.querySelectorAll("th,td")].map((cell) => clean((cell as HTMLElement).innerText)),
          links: [...row.querySelectorAll<HTMLAnchorElement>("a[href]")].map((anchor) => ({
            text: clean(anchor.textContent),
            href: anchor.href,
          })),
        }))
        .filter((row) => row.cells.length > 2);
    });

    let currentCollegeName = "";
    const departments: HufsGraduateDepartment[] = [];
    for (const row of rawRows) {
      const parsed = parseDepartmentCells(row.cells, currentCollegeName);
      if (!parsed) {
        continue;
      }
      currentCollegeName = parsed.collegeName ?? currentCollegeName;
      const homepageUrl = row.links.find((link) => /homepage|홈페이지/i.test(link.text))?.href;
      const evidence = [parsed.name, parsed.collegeName].join(" ");
      departments.push({
        collegeName: parsed.collegeName ?? currentCollegeName,
        name: parsed.name ?? "",
        homepageUrl,
        email: parsed.email,
        location: parsed.location,
        phone: parsed.phone,
        discoveryWarnings: homepageUrl ? [] : ["학과 홈페이지 링크 없음"],
        classification: classifyResearchText(evidence),
      });
    }

    return departments;
  } finally {
    await page.close();
  }
}

function facultyLinkScore(link: { text: string; href: string; className?: string }): number {
  const haystack = `${link.text} ${link.href} ${link.className ?? ""}`;
  if (/명예|퇴임|퇴직|출강|강사|조교|staff|emeritus|adjunct/i.test(haystack)) {
    return -10;
  }
  let score = 0;
  if (/교수진|교수\s*소개|전임교원|전임\s*교수|faculty|professor/i.test(haystack)) {
    score += 10;
  }
  if (/tab_|_active|m02_s001|11454|profl/i.test(haystack)) {
    score += 2;
  }
  if (/연구실소개|연구실|lab/i.test(haystack)) {
    score += 3;
  }
  return score;
}

function chooseFacultyListUrl(snapshot: PageSnapshot): { url?: string; pattern?: string } {
  if (/fnctId=profl|인물소개 리스트|연구분야.+이메일/s.test(snapshot.text)) {
    return { url: snapshot.finalUrl, pattern: "current_page_professor_list" };
  }

  const candidates = snapshot.links
    .map((link) => ({ link, score: facultyLinkScore(link) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const selected = candidates[0]?.link;
  if (!selected) {
    return {};
  }
  return { url: selected.href, pattern: cleanText(selected.text) };
}

function splitName(rawName: string | undefined): { nameKo?: string; nameEn?: string; title?: string } {
  const cleaned = cleanText(rawName?.replace(/\b(?:사진|image)\b/gi, ""));
  if (!cleaned) {
    return {};
  }
  const title = cleaned.match(facultyTitlePattern)?.[0];
  const nameSource = cleaned.replace(leadingFacultyTitlePattern, "");
  const nameKo = nameSource.match(/^([가-힣]{2,5})/)?.[1];
  const withoutKoreanTitle = cleaned
    .replace(leadingFacultyTitlePattern, "")
    .replace(/^[가-힣]{2,5}\s*/, "")
    .replace(/(?:직위\(직급\))?\s*(?:명예교수|석좌교수|초빙교수|겸임교수|객원교수|특임교수|교수님?|부교수|조교수)\s*,?/g, " ")
    .trim();
  const nameEn = cleanText(withoutKoreanTitle.match(/[A-Z][A-Za-z .,'-]{2,80}/)?.[0]);
  return { nameKo, nameEn, title };
}

function extractDlMap(root: Element): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const dl of [...root.querySelectorAll("dl")]) {
    const key = cleanText(dl.querySelector("dt")?.textContent);
    const value = cleanText(dl.querySelector("dd")?.textContent);
    if (key && value !== undefined) {
      entries[key] = value;
    }
  }
  return entries;
}

async function extractFacultyCards(page: Page, facultyListUrl: string): Promise<FacultyCard[]> {
  return page.evaluate((baseUrl) => {
    const clean = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() || undefined;
    const resolve = (value: string | undefined) => {
      if (!value || /^mailto:|^tel:|^javascript:/i.test(value)) return undefined;
      try {
        return new URL(value, baseUrl).toString();
      } catch {
        return undefined;
      }
    };
    const splitNameInBrowser = (rawName: string | undefined) => {
      const cleaned = clean(rawName?.replace(/\b(?:사진|image)\b/gi, ""));
      const leadingTitle = /^(?:명예교수|석좌교수|초빙교수|겸임교수|객원교수|특임교수|교수님?|부교수|조교수)\s+/;
      const title = cleaned?.match(/명예교수|석좌교수|초빙교수|겸임교수|객원교수|특임교수|부교수|조교수|교수/)?.[0];
      const nameSource = cleaned?.replace(leadingTitle, "");
      const nameKo = nameSource?.match(/^([가-힣]{2,5})/)?.[1];
      const withoutKoreanTitle = cleaned
        ?.replace(leadingTitle, "")
        .replace(/^[가-힣]{2,5}\s*/, "")
        .replace(/(?:직위\(직급\))?\s*(?:명예교수|석좌교수|초빙교수|겸임교수|객원교수|특임교수|교수님?|부교수|조교수)\s*,?/g, " ")
        .trim();
      const nameEn = clean(withoutKoreanTitle?.match(/[A-Z][A-Za-z .,'-]{2,80}/)?.[0]);
      return { nameKo, nameEn, title };
    };
    const getDlMap = (root: Element) => {
      const entries: Record<string, string> = {};
      for (const dl of [...root.querySelectorAll("dl")]) {
        const key = clean(dl.querySelector("dt")?.textContent);
        const value = clean(dl.querySelector("dd")?.textContent);
        if (key && value !== undefined) entries[key] = value;
      }
      return entries;
    };

    return [...document.querySelectorAll<HTMLAnchorElement>("a._prFlLinkView")]
      .map((anchor) => {
        const root = anchor.closest("li,article,div") ?? anchor;
        const dl = getDlMap(root);
        const titleText = clean(root.querySelector(".artclTitle strong, strong, .artclTitle")?.textContent) ?? clean(anchor.textContent);
        const names = splitNameInBrowser(titleText);
        const homepageText = dl["홈페이지"] || dl["Homepage"] || dl["website"];
        return {
          ...names,
          email: dl["이메일"] || dl["Email"] || clean(root.textContent)?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0],
          office: dl["연구실"] || dl["위치"] || dl["Office"],
          homepageUrl: resolve(homepageText),
          profileUrl: resolve(anchor.getAttribute("href") ?? undefined),
          researchText: dl["연구분야"] || dl["전공분야"] || dl["전공"] || dl["Major"] || dl["주요 연구"],
          rawText: clean(root.textContent) ?? "",
        };
      })
      .filter((card) => card.nameKo || card.nameEn || card.email);
  }, facultyListUrl);
}

function uniqueFacultyCards(cards: FacultyCard[]): FacultyCard[] {
  const seen = new Set<string>();
  const output: FacultyCard[] = [];
  for (const card of cards) {
    const key = card.profileUrl ?? card.email ?? [card.nameKo, card.nameEn, card.rawText.slice(0, 80)].filter(Boolean).join("|");
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(card);
  }
  return output;
}

function extractDetailResearchText(text: string): string | undefined {
  const lines = text.split(/\n+/).map((line) => cleanText(line)).filter((line): line is string => Boolean(line));
  const collected: string[] = [];
  const labels = /^(전공|전공분야|연구분야|주요 연구|Major|Research Areas?|Research Interests?)$/i;
  const stopLabels = /^(담당과목|담당 과목|주요 강의|강의|주요 논문|주요논문|논문|논문\/저서|Publications?|주요 저서 및 역서|주요논문 및 저서|주요 논문 및 저서|저서|경력|주요경력|주요 경력|학력|이메일|Email|E-mail|전화번호|연락처|Tel\.?|Phone|연구실|홈페이지|개인 홈페이지|Homepage|Website|최종학력|학위|대학|연구비수주\/수상내역)$/i;
  for (let index = 0; index < lines.length; index += 1) {
    if (!labels.test(lines[index] ?? "")) {
      continue;
    }
    for (const line of lines.slice(index + 1)) {
      if (labels.test(line) || stopLabels.test(line) || isResearchNoiseSegment(line)) {
        break;
      }
      collected.push(line);
      if (collected.length >= 5) {
        break;
      }
    }
  }
  return cleanResearchText(...collected);
}

function countPublicationLines(text: string): number | undefined {
  const marker = text.search(/주요\s*논문|논문\/저서|Publications?/i);
  if (marker < 0) {
    return undefined;
  }
  const section = text.slice(marker);
  const lines = section.split(/\n+/).map((line) => cleanText(line)).filter((line): line is string => Boolean(line));
  const publicationLines = lines.filter((line) =>
    /\b(?:19|20)\d{2}\b/.test(line)
      && /[.,]/.test(line)
      && !/^(주요\s*논문|논문\/저서|Publications?|\[[^\]]+\])$/i.test(line),
  );
  return publicationLines.length > 0 ? publicationLines.length : undefined;
}

function stripHtmlNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)));
}

function htmlToTextWithBreaks(html: string): string {
  return decodeHtmlEntities(
    stripHtmlNoise(html)
      .replace(/<\/(?:h1|h2|h3|h4|p|div|li|tr|section|article|dt|dd)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlToText(html: string | undefined): string | undefined {
  return cleanText(decodeHtmlEntities(stripHtmlNoise(html ?? "").replace(/<[^>]*>/g, " ")));
}

function extractLinksFromHtml(html: string, baseUrl: string): Array<{ text: string; href: string }> {
  return [...stripHtmlNoise(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => {
      const href = resolveUrl(match[1], baseUrl);
      const text = htmlToText(match[2]) ?? "";
      return href ? { text, href } : undefined;
    })
    .filter((link): link is { text: string; href: string } => Boolean(link));
}

function extractHomepageFromProfileHtml(html: string, baseUrl: string): string | undefined {
  const cleanHtml = stripHtmlNoise(html);
  const dlMatches = [...cleanHtml.matchAll(/<dl\b[\s\S]*?<\/dl>/gi)];
  for (const match of dlMatches) {
    const dl = match[0];
    const key = htmlToText(dl.match(/<dt\b[^>]*>([\s\S]*?)<\/dt>/i)?.[1]) ?? "";
    if (!/홈페이지|homepage|website/i.test(key)) {
      continue;
    }
    const ddHtml = dl.match(/<dd\b[^>]*>([\s\S]*?)<\/dd>/i)?.[1] ?? "";
    const href = ddHtml.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1];
    return resolveUrl(href, baseUrl) ?? resolveUrl(htmlToText(ddHtml), baseUrl);
  }
  return undefined;
}

async function extractProfileDetail(_context: BrowserContext, profileUrl: string | undefined) {
  if (!profileUrl) {
    return {};
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), pageTimeoutMs);
  try {
    const response = await fetch(profileUrl, {
      headers: { "user-agent": process.env.CRAWLER_USER_AGENT ?? "Mozilla/5.0 (compatible; KR-Labs-Crawler/0.1)" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) {
      return {};
    }
    const finalUrl = response.url || profileUrl;
    const html = await response.text();
    const text = htmlToTextWithBreaks(html);
    const links = extractLinksFromHtml(html, finalUrl);
    const homepageUrl = extractHomepageFromProfileHtml(html, finalUrl);
    const scholarUrl = links.find((link) => scholarUrlPattern.test(link.href))?.href ?? (homepageUrl && scholarUrlPattern.test(homepageUrl) ? homepageUrl : undefined);
    const dblpUrl = links.find((link) => dblpUrlPattern.test(link.href))?.href ?? (homepageUrl && dblpUrlPattern.test(homepageUrl) ? homepageUrl : undefined);
    return {
      homepageUrl,
      scholarUrl,
      dblpUrl,
      researchText: extractDetailResearchText(text),
      publicationCount: countPublicationLines(text),
    };
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

function chooseLabAndBibliographyUrls(input: {
  homepageUrl?: string;
  detailHomepageUrl?: string;
  profileUrl?: string;
  facultyListUrl: string;
}): Pick<HufsFacultyCandidate, "labUrl" | "labUrlType" | "fallbackReason" | "scholarUrl" | "dblpUrl"> {
  const homepage = input.detailHomepageUrl ?? input.homepageUrl;
  const scholarUrl = homepage && scholarUrlPattern.test(homepage) ? homepage : undefined;
  const dblpUrl = homepage && dblpUrlPattern.test(homepage) ? homepage : undefined;
  if (homepage && !bibliographicUrlPattern.test(homepage) && !nonLabHomepagePattern.test(homepage)) {
    return { labUrl: homepage, labUrlType: "external_lab_or_homepage", scholarUrl, dblpUrl };
  }
  if (input.profileUrl) {
    return {
      labUrl: input.profileUrl,
      labUrlType: "profile_fallback",
      fallbackReason: homepage
        ? "홈페이지가 연구실 홈페이지로 보기 어려워 연구실 홈페이지 없음, 교수 상세 페이지 fallback 사용"
        : "연구실 홈페이지 없음, 교수 상세 페이지 fallback 사용",
      scholarUrl,
      dblpUrl,
    };
  }
  return {
    labUrl: input.facultyListUrl,
    labUrlType: "faculty_page_fallback",
    fallbackReason: "연구실 홈페이지 없음, 학과 교수진 페이지 fallback 사용",
    scholarUrl,
    dblpUrl,
  };
}

function classifyFacultyResearch(
  researchText: string | undefined,
  department: HufsGraduateDepartment,
): { classification: ResearchClassification; source: HufsFacultyCandidate["classificationSource"] } {
  const researchClassification = classifyResearchText(researchText ?? "");
  if (researchClassification.matches.length > 0) {
    return { classification: researchClassification, source: "research_text" };
  }

  const fallbackText = cleanText([department.name, department.collegeName].filter(Boolean).join(" ")) ?? "";
  const fallbackClassification = classifyResearchText(fallbackText);
  if (fallbackClassification.matches.length === 0) {
    return { classification: researchClassification, source: "unclassified" };
  }

  return {
    classification: {
      ...fallbackClassification,
      matches: fallbackClassification.matches.map((match) => ({
        ...match,
        confidence: Math.min(match.confidence, 0.42),
        evidence: Array.from(new Set([...match.evidence, department.name])),
      })),
    },
    source: "department_fallback",
  };
}

async function buildFacultyCandidate(
  context: BrowserContext,
  department: HufsGraduateDepartment,
  card: FacultyCard,
  options: { enrichMembers: boolean },
): Promise<HufsFacultyCandidate> {
  const detail = await extractProfileDetail(context, card.profileUrl);
  const bibliography = chooseLabAndBibliographyUrls({
    homepageUrl: card.homepageUrl,
    detailHomepageUrl: detail.homepageUrl,
    profileUrl: card.profileUrl,
    facultyListUrl: department.facultyListUrl ?? department.homepageUrl ?? defaultSourceUrl,
  });
  const researchText = cleanResearchText(card.researchText) ?? cleanResearchText(detail.researchText);
  const { classification, source: classificationSource } = classifyFacultyResearch(researchText, department);
  const warnings: string[] = [];
  if (bibliography.fallbackReason) {
    warnings.push(bibliography.fallbackReason);
  }
  if (!researchText) {
    warnings.push("교수 상세/카드에서 연구분야 텍스트를 확인하지 못함");
  }
  if (classificationSource === "department_fallback") {
    warnings.push("교수 연구/전공 텍스트 기준 분류 실패, 학과/전공명 기반 fallback 분류 사용");
  }
  if (card.title === "명예교수") {
    warnings.push("명예교수로 표시되어 현직 연구실 여부 수동 검토 필요");
  }
  if (department.name.includes("경영학과") && /biz\.hufs\.ac\.kr/.test(department.facultyListUrl ?? "")) {
    warnings.push("경영대학·경영대학원 통합 교수진 페이지에서 수집되어 대학원 전용 여부 수동 검토 필요");
  }

  const candidate: HufsFacultyCandidate = {
    departmentName: department.name,
    collegeName: department.collegeName,
    nameKo: card.nameKo,
    nameEn: card.nameEn,
    title: card.title ?? "교수",
    email: card.email,
    office: card.office,
    homepageUrl: detail.homepageUrl ?? card.homepageUrl,
    profileUrl: card.profileUrl,
    labUrl: bibliography.labUrl,
    labUrlType: bibliography.labUrlType,
    fallbackReason: bibliography.fallbackReason,
    researchText,
    publicationCount: detail.publicationCount,
    publicationCountSourceUrl: detail.publicationCount ? card.profileUrl : undefined,
    scholarUrl: detail.scholarUrl ?? bibliography.scholarUrl,
    dblpUrl: detail.dblpUrl ?? bibliography.dblpUrl,
    sourceUrl: card.profileUrl ?? department.facultyListUrl ?? department.homepageUrl ?? defaultSourceUrl,
    classification,
    classificationSource,
    warnings,
  };

  const invalidLabReason = candidate.homepageUrl ? invalidExternalLabUrlReasons[candidate.homepageUrl] : undefined;
  if (invalidLabReason && candidate.profileUrl) {
    candidate.labUrl = candidate.profileUrl;
    candidate.labUrlType = "profile_fallback";
    candidate.fallbackReason = invalidLabReason;
    candidate.warnings.push(invalidLabReason);
  }

  if (options.enrichMembers && candidate.labUrlType === "external_lab_or_homepage") {
    const memberResult = await enrichLabMemberCount(candidate.labUrl);
    if (memberResult.count) {
      candidate.currentMemberCount = memberResult.count;
      candidate.memberCountBreakdown = memberResult.breakdown;
      candidate.memberCountSourceUrl = memberResult.sourceUrl;
      candidate.memberCountCrawledAt = new Date().toISOString();
    }
  }

  const verifiedMemberCount = candidate.labUrl ? verifiedMemberCountsByLabUrl[candidate.labUrl] : undefined;
  if (verifiedMemberCount) {
    candidate.currentMemberCount = verifiedMemberCount.count;
    candidate.memberCountBreakdown = verifiedMemberCount.breakdown;
    candidate.memberCountSourceUrl = verifiedMemberCount.sourceUrl;
    candidate.memberCountCrawledAt = new Date().toISOString();
    candidate.warnings.push(verifiedMemberCount.note);
  }

  return candidate;
}

function incrementCount(counts: Record<string, number>, key: string | undefined) {
  if (!key) {
    return;
  }
  counts[key] = (counts[key] ?? 0) + 1;
}

function summarize(departments: HufsGraduateDepartment[], facultyCandidates: HufsFacultyCandidate[]): HufsGraduateDiscoveryReport["summary"] {
  const taxonomyMatchCounts: Record<string, number> = {};
  const countsByCollege: Record<string, number> = {};
  let uncategorizedCount = 0;

  for (const department of departments) {
    incrementCount(countsByCollege, department.collegeName);
  }

  for (const candidate of facultyCandidates) {
    if (candidate.classification.matches.length === 0) {
      uncategorizedCount += 1;
    }
    for (const match of candidate.classification.matches) {
      incrementCount(taxonomyMatchCounts, match.labelKo);
    }
  }

  return {
    departmentCount: departments.length,
    departmentsWithHomepage: departments.filter((department) => department.homepageUrl).length,
    departmentsWithFacultyList: departments.filter((department) => department.facultyListUrl).length,
    professorCount: facultyCandidates.length,
    labUrlCount: facultyCandidates.filter((candidate) => candidate.labUrl).length,
    externalLabUrlCount: facultyCandidates.filter((candidate) => candidate.labUrlType === "external_lab_or_homepage").length,
    fallbackLabUrlCount: facultyCandidates.filter((candidate) => candidate.labUrlType !== "external_lab_or_homepage").length,
    memberCountKnown: facultyCandidates.filter((candidate) => typeof candidate.currentMemberCount === "number").length,
    dblpUrlCount: facultyCandidates.filter((candidate) => candidate.dblpUrl).length,
    scholarUrlCount: facultyCandidates.filter((candidate) => candidate.scholarUrl).length,
    publicationCountKnown: facultyCandidates.filter((candidate) => typeof candidate.publicationCount === "number").length,
    taxonomyMatchCounts: Object.fromEntries(Object.entries(taxonomyMatchCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    uncategorizedCount,
    countsByCollege,
    manualReviewCount: facultyCandidates.filter((candidate) => candidate.warnings.length > 0 || candidate.classification.matches.length === 0).length,
  };
}

export async function discoverHufsGraduateSeeds(
  context: BrowserContext,
  options?: {
    sourceUrl?: string;
    maxDepartments?: number;
    maxProfessors?: number;
    enrichMembers?: boolean;
  },
): Promise<HufsGraduateDiscoveryReport> {
  const sourceUrl = options?.sourceUrl ?? defaultSourceUrl;
  const maxDepartments = options?.maxDepartments ?? Number.POSITIVE_INFINITY;
  const maxProfessors = options?.maxProfessors ?? Number.POSITIVE_INFINITY;
  const enrichMembers = options?.enrichMembers ?? true;
  const departments = (await discoverHufsDepartments(context, sourceUrl)).slice(0, maxDepartments);
  const facultyCandidates: HufsFacultyCandidate[] = [];
  const failedPages: HufsGraduateDiscoveryReport["failedPages"] = [];

  for (const department of departments) {
    if (!department.homepageUrl) {
      continue;
    }
    if (/\.pdf(?:[?#].*)?$/i.test(department.homepageUrl)) {
      department.discoveryWarnings.push("학과 홈페이지가 PDF라 교수진 자동 탐색 제외");
      continue;
    }
    try {
      const snapshot = await snapshotPage(context, department.homepageUrl);
      const facultyList = chooseFacultyListUrl(snapshot);
      department.facultyListUrl = facultyList.url;
      department.facultyListPattern = facultyList.pattern;
      if (!facultyList.url) {
        department.discoveryWarnings.push("교수진 URL 탐색 실패");
        continue;
      }

      const page = await context.newPage();
      try {
        await safeGoto(page, facultyList.url);
        const cards = uniqueFacultyCards(await extractFacultyCards(page, facultyList.url));
        department.facultyCount = cards.length;
        if (cards.length === 0) {
          department.discoveryWarnings.push("교수 카드 목록 없음");
        }
        for (const card of cards) {
          if (facultyCandidates.length >= maxProfessors) {
            break;
          }
          facultyCandidates.push(await buildFacultyCandidate(context, department, card, { enrichMembers }));
        }
      } finally {
        await page.close();
      }
    } catch (error) {
      department.discoveryWarnings.push("학과/교수진 페이지 크롤링 실패");
      failedPages.push({
        url: department.homepageUrl,
        stage: "department_faculty_discovery",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (facultyCandidates.length >= maxProfessors) {
      break;
    }
  }

  return {
    sourceUrl,
    generatedAt: new Date().toISOString(),
    departments,
    facultyCandidates,
    failedPages,
    summary: summarize(departments, facultyCandidates),
  };
}
