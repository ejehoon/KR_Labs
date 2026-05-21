import "dotenv/config";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import type { BrowserContext } from "playwright";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";

type ResearchClassification = {
  matches?: Array<{ labelKo: string; evidence?: string[] }>;
  suggestions?: Array<{ suggestedLabel: string; evidence?: string[] }>;
};

type SogangFacultyCandidate = {
  sourceProgramName: string;
  affiliation?: string;
  nameKo?: string;
  researchText?: string;
  labUrl?: string;
  sourceUrl: string;
  sourceParser?: string;
  classification: ResearchClassification;
  currentMemberCount?: number;
  memberCountBreakdown?: Record<string, number>;
  memberCountSourceUrl?: string;
  memberCountCrawledAt?: string;
  scholarUrl?: string;
  dblpUrl?: string;
  dblpAuthorName?: string;
  paperCount?: number;
  paperCountSource?: "dblp" | "publication_page";
  paperCountSourceUrl?: string;
  enrichedAt?: string;
  enrichmentWarnings?: string[];
};

type SogangDiscoveryReport = {
  sourceUrl: string;
  generatedAt: string;
  programs: unknown[];
  facultyCandidates: SogangFacultyCandidate[];
  summary: Record<string, unknown>;
};

type PageData = {
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  links: Array<{ href: string; text: string; context?: string }>;
};

type MemberCountResult = {
  count?: number;
  breakdown?: Record<string, number>;
  sourceUrl?: string;
};

type MetricOverride = {
  currentMemberCount?: number;
  memberCountBreakdown?: Record<string, number>;
  memberCountSourceUrl?: string;
  scholarUrl?: string | null;
  paperCount?: number;
  paperCountSource?: "dblp" | "publication_page";
  paperCountSourceUrl?: string;
};

type DblpAuthorHit = {
  info?: {
    author?: string;
    url?: string;
  };
};

const userAgent = process.env.CRAWLER_USER_AGENT ?? "Mozilla/5.0 (compatible; KR-Labs-Crawler/0.1)";
const httpTimeoutMs = Number(process.env.ENRICH_HTTP_TIMEOUT_MS ?? 10_000);
const candidateTimeoutMs = Number(process.env.ENRICH_CANDIDATE_TIMEOUT_MS ?? 45_000);
const maxAutomaticMemberCount = Number(process.env.ENRICH_MAX_MEMBER_COUNT ?? 35);
const execFileAsync = promisify(execFile);
const pageCache = new Map<string, Promise<PageData | undefined>>();
const dblpAuthorCache = new Map<string, Promise<{ authorName?: string; url?: string; paperCount?: number } | undefined>>();
const sogangDblpOverrides: Record<string, { authorName: string; url: string; paperCount: number }> = {
  "컴퓨터공학과|김세준": { authorName: "Saejoon Kim", url: "https://dblp.org/pid/10/1669", paperCount: 36 },
  "인공지능학과|김세준": { authorName: "Saejoon Kim", url: "https://dblp.org/pid/10/1669", paperCount: 36 },
  "컴퓨터공학과|김영재": { authorName: "Youngjae Kim 0001", url: "https://dblp.org/pid/19/5848", paperCount: 135 },
  "인공지능학과|김영재": { authorName: "Youngjae Kim 0001", url: "https://dblp.org/pid/19/5848", paperCount: 135 },
  "컴퓨터공학과|최준석": { authorName: "Junsuk Choe", url: "https://dblp.org/pid/169/7682", paperCount: 55 },
  "인공지능학과|최준석": { authorName: "Junsuk Choe", url: "https://dblp.org/pid/169/7682", paperCount: 55 },
};
const sogangLabUrlOverrides: Record<string, string> = {
  "컴퓨터공학과|김세준": "http://fml.sogang.ac.kr/",
  "인공지능학과|김세준": "http://fml.sogang.ac.kr/",
  "국어국문학과|김한별": "https://hanseoulo.ivyro.net/",
  "수학과|임경수": "http://fourier.sogang.ac.kr/",
  "인공지능학과|임경수": "http://fourier.sogang.ac.kr/",
};
const sogangMetricOverrides: Record<string, MetricOverride> = {
  "컴퓨터공학과|김세준": {
    currentMemberCount: 4,
    memberCountBreakdown: { phd: 2, master: 2 },
    memberCountSourceUrl: "http://fml.sogang.ac.kr/students.html",
  },
  "인공지능학과|김세준": {
    currentMemberCount: 4,
    memberCountBreakdown: { phd: 2, master: 2 },
    memberCountSourceUrl: "http://fml.sogang.ac.kr/students.html",
  },
  "수학과|임경수": {
    currentMemberCount: 6,
    memberCountBreakdown: { phd: 2, master: 3, undergraduate_or_intern: 1 },
    memberCountSourceUrl: "http://fourier.sogang.ac.kr/",
    scholarUrl: null,
    paperCount: 35,
    paperCountSource: "publication_page",
    paperCountSourceUrl: "http://fourier.sogang.ac.kr/",
  },
  "인공지능학과|임경수": {
    currentMemberCount: 6,
    memberCountBreakdown: { phd: 2, master: 3, undergraduate_or_intern: 1 },
    memberCountSourceUrl: "http://fourier.sogang.ac.kr/",
    scholarUrl: null,
    paperCount: 35,
    paperCountSource: "publication_page",
    paperCountSourceUrl: "http://fourier.sogang.ac.kr/",
  },
  "물리학과|박정혁": {
    currentMemberCount: 5,
    memberCountBreakdown: { phd: 3, master: 1, undergraduate_or_intern: 1 },
    memberCountSourceUrl: "https://lab7616.sogang.ac.kr/lab7616/1098.html",
  },
  "물리학과|정명화": {
    currentMemberCount: 13,
    memberCountBreakdown: { phd: 7, undergraduate_or_intern: 6 },
    memberCountSourceUrl: "https://eqml.sogang.ac.kr/eqml/665.html",
  },
  "화학과|정근홍": {
    currentMemberCount: 6,
    memberCountBreakdown: { phd: 1, master: 5 },
    memberCountSourceUrl: "https://stalwart-cassata-0d784a.netlify.app/members",
  },
  "전자공학과|송성혁": {
    currentMemberCount: 11,
    memberCountSourceUrl: "https://airo.sogang.ac.kr/member",
  },
  "전자공학과|최용": {
    currentMemberCount: 14,
    memberCountBreakdown: { researcher: 2, phd: 4, master: 8 },
    memberCountSourceUrl: "https://mirelab.sogang.ac.kr/mirelab/1645.html",
  },
  "화공생명공학과|조현석": {
    currentMemberCount: 20,
    memberCountBreakdown: { researcher: 2, master: 14, undergraduate_or_intern: 4 },
    memberCountSourceUrl: "https://www.electrochemengrnd.com/about-1",
  },
  "기계공학과|박정열": {
    currentMemberCount: 4,
    memberCountBreakdown: { phd: 2, master: 2 },
    memberCountSourceUrl: "https://nbsm.sogang.ac.kr/nbsm/2268.html",
  },
  "인공지능학과|박운상": {
    currentMemberCount: 14,
    memberCountBreakdown: { phd: 2, master: 12 },
    memberCountSourceUrl: "https://cviplab.sogang.ac.kr/cviplab/1249.html",
  },
  "인공지능학과|최용": {
    currentMemberCount: 14,
    memberCountBreakdown: { researcher: 2, phd: 4, master: 8 },
    memberCountSourceUrl: "https://mirelab.sogang.ac.kr/mirelab/1645.html",
  },
  "인공지능학과|김태훈": {
    currentMemberCount: 8,
    memberCountBreakdown: { phd: 4, master: 2, undergraduate_or_intern: 2 },
    memberCountSourceUrl: "https://mimic-lab.com/members/",
  },
};
const unreliableMemberSourcePatterns = [
  /#role-member-pages$/i,
  /(?:cs|scc)\.sogang\.ac\.kr\/cs\/cs04_3(?:\.html)?$/i,
  /(?:korea|scc)\.sogang\.ac\.kr\/korea\/korea01_5(?:_\d+)?\.html/i,
  /philosophy\.sogang\.ac\.kr\/philosophy\/philosophy01_5(?:_\d+)?\.html/i,
  /sogang\.ac\.kr\/ko\/home/i,
  /scc\.sogang\.ac\.kr\/math\/math02_1_\d+\.html/i,
  /math\.sogang\.ac\.kr\/math\/math02_1_\d+\.html/i,
  /chemistry\.sogang\.ac\.kr\/chemistry\/chemistry02_\d+(?:\.html)?/i,
  /chemistry\.sogang\.ac\.kr\/chemistry\/chemistry04_1_\d+\.html/i,
  /chemistry\.sogang\.ac\.kr\/chemistry\/chemistry_06_1_\d+\.html/i,
  /sggks\.sogang\.ac\.kr\/sggks\//i,
  /scc\.sogang\.ac\.kr\/math\//i,
  /math\.sogang\.ac\.kr\/math\//i,
  /physics\.sogang\.ac\.kr\/physics\//i,
  /airo\.sogang\.ac\.kr\/professor/i,
  /jaegeonryu\.owlstown\.net\/?$/i,
  /cs\.sogang\.ac\.kr\/cs\/cs02_1(?:\.html)?$/i,
  /ai\.sogang\.ac\.kr\/ai\/ai06_1\.html/i,
  /eastern\.edu\//i,
];
const unreliablePublicationSourcePatterns = [
  /scc\.sogang\.ac\.kr\/math\/math04_7\.html/i,
  /math\.sogang\.ac\.kr\/math\/math04_7\.html/i,
  /sociology\.sogang\.ac\.kr\/sociology\/sociology04_5\.html/i,
  /gsedu\.sogang\.ac\.kr\/gsedu\/gsedu05_04\.html/i,
  /scc\.sogang\.ac\.kr\/sieas\/sieas05_1_4\.html/i,
  /\/front\/cmsboardlist\.do\?/i,
  /philpapers\.org\/rec\//i,
  /\/doi\/abs\//i,
  /services\.conferences\.computer\.org/i,
  /\/news\//i,
  /board\.php\?bo_table=sub5/i,
];

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
  console.log(`Usage: pnpm enrich:sogang-grad [--report=reports/sogang-grad-discovery.json] [--offset=0] [--max-candidates=496] [--program=인공지능학과] [--concurrency=4]

Enriches Sogang graduate discovery candidates with member counts, Scholar links,
DBLP author URLs, and DBLP publication counts when reliable evidence exists.
`);
}

function cleanText(input: string | undefined): string | undefined {
  const value = input?.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return value || undefined;
}

function normalizeName(input: string): string {
  return input.toLowerCase().replace(/[^a-z가-힣]/g, "");
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shellQuote(input: string): string {
  return `'${input.replace(/'/g, "'\\''")}'`;
}

function resolveUrl(rawUrl: string | undefined, baseUrl: string): string | undefined {
  if (!rawUrl || rawUrl.startsWith("mailto:") || rawUrl.startsWith("tel:") || rawUrl.startsWith("javascript:")) {
    return undefined;
  }
  try {
    return new URL(rawUrl, baseUrl).toString();
  } catch {
    return undefined;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchPageData(context: BrowserContext, url: string): Promise<PageData | undefined> {
  const cached = pageCache.get(url);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(15_000);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
      return await page.evaluate(() => {
        document.querySelectorAll("script, style, noscript, svg, nav, footer").forEach((node) => node.remove());
        const links = Array.from(document.querySelectorAll("a[href]"))
          .map((anchor) => ({
            href: (anchor as HTMLAnchorElement).href || anchor.getAttribute("href") || "",
            text: anchor.textContent?.replace(/\s+/g, " ").trim() ?? "",
            context: anchor.closest("tr, li, p, dl, table, section, article, div")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 500) ?? "",
          }))
          .filter((link) => link.href);
        return {
          url: location.href,
          finalUrl: location.href,
          title: document.title?.replace(/\s+/g, " ").trim() ?? "",
          text: document.body?.innerText?.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() ?? "",
          links,
        };
      });
    } catch {
      return undefined;
    } finally {
      await page.close().catch(() => undefined);
    }
  })();

  pageCache.set(url, promise);
  return promise;
}

function findExternalProfileLinks(page: PageData | undefined) {
  const links = page?.links ?? [];
  const homepageUrl = isSogangDepartmentProfilePage(page)
    ? links.find((link) => isLikelyPersonalHomepage(link, page?.finalUrl))?.href
    : undefined;
  return {
    scholarUrl: links.find((link) => /scholar\.google\.[^/]+\/citations\?/i.test(link.href))?.href,
    dblpUrl: links.find((link) => /dblp\.org\/pid\//i.test(link.href))?.href,
    homepageUrl,
  };
}

function isSogangDepartmentProfilePage(page: PageData | undefined): boolean {
  if (!page) {
    return false;
  }
  const haystack = `${page.finalUrl}\n${page.title}\n${page.text.slice(0, 2_000)}`;
  return /sogang\.ac\.kr/i.test(page.finalUrl)
    && /교수|professor/i.test(haystack)
    && /전\s*공|연구실|이메일|홈페이지|website|homepage|research\s+interest/i.test(haystack);
}

function isLikelyPersonalHomepage(link: { href: string; text: string; context?: string }, sourceUrl: string | undefined): boolean {
  const haystack = `${link.href} ${link.text} ${link.context ?? ""}`;
  const explicitHomepageSignal = /홈페이지|website|homepage|personal|lab|research\s+group|연구실|sites\.google\.com|github\.io|ivyro\.net/i.test(haystack);
  if (!/^https?:\/\//i.test(link.href)) {
    return false;
  }
  if (/scholar\.google|dblp\.org|orcid\.org|mailto:|arxiv\.org|doi\.org|dl\.acm\.org|ieee\.org|springer|sciencedirect|researchgate\.net|linkedin\.com|facebook\.com|twitter\.com|x\.com/i.test(link.href)) {
    return false;
  }
  if (/sis109\.sogang\.ac\.kr|saint\.sogang\.ac\.kr|sap\/bc\/webdynpro|zcmw9016|portal\.design|cyber\.sogang\.ac\.kr|\/ilos\/|mail\.sogang\.ac\.kr|scloud\.sogang\.ac\.kr|gsinfo\.sogang\.ac\.kr/i.test(link.href)) {
    return false;
  }
  if (/(?:cs|scc)\.sogang\.ac\.kr\/cs\/cs04_3(?:\.html)?$/i.test(link.href)) {
    return false;
  }
  try {
    const linkUrl = new URL(link.href);
    const sourceHost = sourceUrl ? new URL(sourceUrl).hostname : "";
    if (linkUrl.hostname === sourceHost && !explicitHomepageSignal) {
      return false;
    }
    if (
      sourceHost.endsWith("sogang.ac.kr")
      && linkUrl.hostname.endsWith("sogang.ac.kr")
      && linkUrl.hostname !== sourceHost
      && !/^(?:www|cs|ai|gradsch|scc)\.sogang\.ac\.kr$/i.test(linkUrl.hostname)
    ) {
      return explicitHomepageSignal;
    }
  } catch {
    return false;
  }
  return explicitHomepageSignal;
}

function scoreCandidateLink(link: { href: string; text: string }, kind: "members" | "publications") {
  const haystack = `${link.href} ${link.text}`.toLowerCase();
  if (kind === "members") {
    let score = 0;
    if (/members?|people|team|students?|group|current|구성원|멤버|학생|연구원|사람|재학생/i.test(haystack)) score += 10;
    if (/\/(?:member|members|student|students)(?:\/|$|\?)|group member|current|students?|재학생/i.test(haystack)) score += 8;
    if (/\bph\.?\s*d\b|\bphd\b|doctoral|doctorate|박사|\bm\.?\s*s\b|\bms\b|master|석사|undergraduate|학부|assistant|\bintern\b|인턴|postdoc|post-doc|researcher|연구원/i.test(haystack)) score += 20;
    if (/faculty|professor|교수|교수진|전임|fulltime|profile/i.test(haystack)) score -= 10;
    if (/alumni|former|졸업|동문/i.test(haystack)) score -= 6;
    if (/news|awards?|board|posts?|공지|소식|수상|선정|장학생|accept(?:ed)?|논문상|경진대회/i.test(haystack)) score -= 14;
    return score;
  }
  let score = 0;
  if (/publications?|papers?|research output|논문|연구성과|실적/i.test(haystack)) score += 10;
  if (/patent|award|press/i.test(haystack)) score -= 3;
  return score;
}

function candidateLinks(page: PageData | undefined, kind: "members" | "publications") {
  if (!page) {
    return [];
  }
  return page.links
    .map((link) => ({ ...link, score: scoreCandidateLink(link, kind) }))
    .filter((link) => link.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, kind === "members" ? 12 : 6);
}

function isUnreliableMemberSource(url: string | undefined): boolean {
  return unreliableMemberSourcePatterns.some((pattern) => pattern.test(url ?? ""));
}

function isUnreliablePublicationSource(url: string | undefined): boolean {
  return unreliablePublicationSourcePatterns.some((pattern) => pattern.test(url ?? ""));
}

function clearUnreliableExistingMetrics(candidate: SogangFacultyCandidate): SogangFacultyCandidate {
  const next = { ...candidate };
  if (isUnreliableMemberSource(next.memberCountSourceUrl)) {
    delete next.currentMemberCount;
    delete next.memberCountBreakdown;
    delete next.memberCountSourceUrl;
    delete next.memberCountCrawledAt;
  }
  if (next.paperCountSource === "publication_page" && isUnreliablePublicationSource(next.paperCountSourceUrl)) {
    delete next.paperCount;
    delete next.paperCountSource;
    delete next.paperCountSourceUrl;
  }
  return next;
}

function applyMetricOverride(candidate: SogangFacultyCandidate, override: MetricOverride | undefined): SogangFacultyCandidate {
  if (!override) {
    return candidate;
  }
  const next = { ...candidate };
  if (typeof override.currentMemberCount === "number") {
    next.currentMemberCount = override.currentMemberCount;
    next.memberCountBreakdown = override.memberCountBreakdown;
    next.memberCountSourceUrl = override.memberCountSourceUrl;
    next.memberCountCrawledAt = new Date().toISOString();
  }
  if ("scholarUrl" in override) {
    next.scholarUrl = override.scholarUrl ?? undefined;
  }
  if (typeof override.paperCount === "number") {
    next.paperCount = override.paperCount;
    next.paperCountSource = override.paperCountSource;
    next.paperCountSourceUrl = override.paperCountSourceUrl;
  }
  return next;
}

function extractSection(text: string, startPattern: RegExp, stopPattern: RegExp) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const start = lines.findIndex((line) => startPattern.test(line));
  if (start < 0) {
    return undefined;
  }
  const sectionLines = [];
  for (const line of lines.slice(start + 1)) {
    if (stopPattern.test(line) && sectionLines.length > 0) {
      break;
    }
    sectionLines.push(line);
    if (sectionLines.length > 300) {
      break;
    }
  }
  return sectionLines.join("\n");
}

function extractLastSection(text: string, startPattern: RegExp, stopPattern: RegExp) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const starts = lines.map((line, index) => (startPattern.test(line) ? index : -1)).filter((index) => index >= 0);
  for (const start of starts.reverse()) {
    const sectionLines = [];
    for (const line of lines.slice(start + 1)) {
      if (stopPattern.test(line) && sectionLines.length > 0) {
        break;
      }
      sectionLines.push(line);
      if (sectionLines.length > 300) {
        break;
      }
    }
    const section = sectionLines.join("\n");
    if (section) {
      return section;
    }
  }
  return undefined;
}

function classifyMemberRole(line: string): string | undefined {
  if (/ph\.?\s*d|doctoral|doctorate|박사/i.test(line)) return "phd";
  if (/\bm\.?\s*s\b|master|석사/i.test(line)) return "master";
  if (/undergraduate|학부|intern|인턴/i.test(line)) return "undergraduate_or_intern";
  if (/researcher|postdoc|연구원|post-doc/i.test(line)) return "researcher";
  if (/student|학생/i.test(line)) return "student";
  return undefined;
}

function memberRoleFromLink(link: { href: string; text: string }): string | undefined {
  const haystack = `${link.href} ${link.text}`;
  if (/\bph\.?\s*d\b|\bphd\b|doctoral|doctorate|박사/i.test(haystack)) return "phd";
  if (/\bm\.?\s*s\b|\bms\b|master|석사/i.test(haystack)) return "master";
  if (/undergraduate|학부/i.test(haystack)) return "undergraduate_or_intern";
  if (/assistant|\bintern\b|인턴/i.test(haystack)) return "undergraduate_or_intern";
  if (/postdoc|post-doc|researcher|연구원/i.test(haystack)) return "researcher";
  return undefined;
}

function isRoleSpecificMemberLink(link: { href: string; text: string }): boolean {
  return Boolean(memberRoleFromLink(link));
}

function isLikelyMemberSectionHeading(line: string): boolean {
  const normalized = line.replace(/\s+/g, " ").trim();
  if (normalized.length > 60) {
    return false;
  }
  return /^(?:current\s+)?(?:group\s+|lab\s+|research\s+)?(?:members?|people|team|students?|researchers?|구성원|멤버|학생|연구원|재학생)$/i.test(normalized)
    || /^(?:[A-Z0-9& -]+\s+)?(?:members?|people|team|students?|researchers?)$/i.test(normalized)
    || /^(?:ph\.?\s*d|phd|m\.?\s*s|ms|undergraduate|assistant|postdoc|researcher|박사|석사|학부|인턴|연구원)$/i.test(normalized);
}

function isFormerMemberBoundary(line: string): boolean {
  return /^(?:former|alumni|past|graduates?|ph\.?\s*d\.?\s+graduates?|m\.?\s*s\.?\s+graduates?|졸업|동문|이전\s+구성원)\b/i.test(line.trim());
}

function shouldIgnoreMemberLine(line: string): boolean {
  return /@|copyright|all rights reserved|publication|journal|conference|doi|abstract|논문|특허|course|lecture|강의|수업|education|experience|appointment|activity|committee|society|editorial|award|honors/i.test(line)
    || /professor|faculty|principal investigator|\bPI\b|지도교수|교수님|교수\s*$/i.test(line)
    || /^콘텐츠로\s*건너뛰기?$/.test(line);
}

function extractLikelyMemberCount(text: string, strictSectionOnly: boolean): MemberCountResult {
  const section =
    extractLastSection(text, /^(?:current\s+)?(?:people|students?|researchers?|구성원|멤버|학생|연구원|재학생)\s*$/i, /^(publications?|papers?|research|projects?|contact|teaching|news|논문|연구|연락|강의|프로젝트)\b/i)
    ?? extractLastSection(text, /^(?:current\s+)?(?:group\s+|lab\s+|research\s+)?(?:members?|people|team|students?|researchers?|구성원|멤버|학생|연구원|재학생)\s*$/i, /^(publications?|papers?|research|projects?|contact|teaching|news|논문|연구|연락|강의|프로젝트)\b/i)
    ?? (!strictSectionOnly ? text : undefined);

  if (!section) {
    return {};
  }

  const sectionResult = countMemberLines(section);
  if (sectionResult.count || strictSectionOnly || section === text) {
    return sectionResult;
  }
  return countMemberLines(text);
}

function countMemberLines(text: string): MemberCountResult {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => line.length <= 120)
    .filter((line) => !isLikelyMemberSectionHeading(line))
    .filter((line) => !shouldIgnoreMemberLine(line));

  const people = new Set<string>();
  const breakdown: Record<string, number> = {};
  for (const line of lines) {
    if (isFormerMemberBoundary(line)) {
      break;
    }
    const role = classifyMemberRole(line);
    const koreanName = line.match(/(?:^|[\s:·,-])([가-힣]{2,4})(?:\s|$|[,/()·-])/u)?.[1];
    const englishName = line.match(/\b([A-Z][a-z]+(?:[-'][A-Z][a-z]+)?\s+[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?)\b/)?.[1];
    if (!role && !koreanName && !englishName) {
      continue;
    }
    const key = cleanText(koreanName ?? englishName ?? line);
    if (!key || /^(members?|people|team|students?|researchers?|구성원|멤버|학생|연구원)$/i.test(key)) {
      continue;
    }
    people.add(key);
    if (role) {
      breakdown[role] = (breakdown[role] ?? 0) + 1;
    }
  }

  return people.size > 0 ? { count: people.size, breakdown } : {};
}

function isLikelyFacultyDirectory(page: PageData | undefined) {
  const haystack = `${page?.title ?? ""} ${page?.finalUrl ?? ""} ${page?.text.slice(0, 800) ?? ""}`;
  return /faculty|professor|교수진|전임교원|교원소개|fulltime/i.test(haystack)
    && !/members?|students?|lab|laboratory|group|연구실|학생|연구원/i.test(haystack);
}

function safeMemberCount(result: MemberCountResult, sourceUrl: string | undefined): MemberCountResult {
  if (!result.count) {
    return {};
  }
  if (isUnreliableMemberSource(sourceUrl)) {
    return {};
  }
  if (result.count > maxAutomaticMemberCount) {
    return {};
  }
  return { ...result, sourceUrl };
}

async function enrichMemberCount(context: BrowserContext, rootPage: PageData | undefined): Promise<MemberCountResult> {
  if (!rootPage) {
    return {};
  }

  const links = candidateLinks(rootPage, "members");
  const genericMemberLinks = links.filter((link) => !isRoleSpecificMemberLink(link));
  for (const link of genericMemberLinks) {
    const page = await fetchPageData(context, link.href);
    if (isLikelyFacultyDirectory(page)) {
      continue;
    }
    const result = extractLikelyMemberCount(page?.text ?? "", true);
    if (result.count) {
      const safe = safeMemberCount(result, page?.finalUrl ?? link.href);
      if (safe.count) {
        return safe;
      }
    }
  }

  const aggregate: MemberCountResult = { count: 0, breakdown: {} };
  const seenRoleUrls = new Set<string>();
  for (const link of links.filter(isRoleSpecificMemberLink)) {
    if (seenRoleUrls.has(link.href) || /alumni|former|졸업|동문/i.test(`${link.href} ${link.text}`)) {
      continue;
    }
    seenRoleUrls.add(link.href);
    const page = await fetchPageData(context, link.href);
    if (isLikelyFacultyDirectory(page)) {
      continue;
    }
    const result = extractLikelyMemberCount(page?.text ?? "", false);
    if (!result.count) {
      continue;
    }
    const role = memberRoleFromLink(link);
    aggregate.count = (aggregate.count ?? 0) + result.count;
    if (role) {
      aggregate.breakdown = {
        ...(aggregate.breakdown ?? {}),
        [role]: (aggregate.breakdown?.[role] ?? 0) + result.count,
      };
    } else {
      for (const [key, value] of Object.entries(result.breakdown ?? {})) {
        aggregate.breakdown = {
          ...(aggregate.breakdown ?? {}),
          [key]: (aggregate.breakdown?.[key] ?? 0) + value,
        };
      }
    }
  }
  const safeAggregate = safeMemberCount(aggregate, `${rootPage.finalUrl}#role-member-pages`);
  if (safeAggregate.count && !isUnreliableMemberSource(safeAggregate.sourceUrl)) {
    return safeAggregate;
  }

  if (isLikelyFacultyDirectory(rootPage)) {
    return {};
  }
  const rootLooksLikeMemberPage = /members?|people|team|students?|구성원|멤버|학생|연구원/i.test(`${rootPage.title} ${rootPage.finalUrl}`);
  const rootResult = extractLikelyMemberCount(rootPage.text, !rootLooksLikeMemberPage);
  return safeMemberCount(rootResult, rootPage.finalUrl);
}

function extractPublicationPageCount(text: string): number | undefined {
  const section = extractSection(text, /^(publications?|papers?|selected publications|논문|연구성과)\b/i, /^(members?|people|team|students?|contact|teaching|news|구성원|연락|강의)\b/i) ?? text;
  const lines = section.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const publicationLines = lines.filter((line) =>
    line.length >= 25
    && line.length <= 500
    && /(?:19|20)\d{2}|CVPR|ICCV|ECCV|NeurIPS|ICML|ACL|EMNLP|AAAI|CHI|SIGIR|SIGMOD|VLDB|IEEE|ACM|Journal|Conference|doi/i.test(line)
    && !/copyright|all rights reserved/i.test(line),
  );
  const unique = new Set(publicationLines.map((line) => line.replace(/\s+/g, " ").toLowerCase()));
  return unique.size > 0 ? unique.size : undefined;
}

async function fetchText(url: string): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), httpTimeoutMs);
  try {
    const response = await fetch(url, { headers: { "user-agent": userAgent }, signal: controller.signal });
    if (!response.ok) {
      return undefined;
    }
    return response.text();
  } catch {
    try {
      const command = [
        "curl",
        "-L",
        "--silent",
        "--show-error",
        "--max-time",
        String(Math.ceil(httpTimeoutMs / 1000)),
        "-A",
        shellQuote(userAgent),
        shellQuote(url),
      ].join(" ");
      const { stdout } = await execFileAsync("/bin/zsh", ["-lc", command], { maxBuffer: 10 * 1024 * 1024 });
      return stdout || undefined;
    } catch {
      return undefined;
    }
  } finally {
    clearTimeout(timer);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

function extractDblpPid(url: string | undefined): string | undefined {
  const match = url?.match(/dblp\.org\/pid\/([^?#.]+(?:\/[^?#.]+)?)/i);
  return match?.[1];
}

async function fetchDblpPublicationCount(dblpUrl: string): Promise<number | undefined> {
  const pid = extractDblpPid(dblpUrl);
  if (!pid) {
    return undefined;
  }
  const xml = await fetchText(`https://dblp.org/pid/${pid}.xml`) ?? await fetchText(`https://dblp.uni-trier.de/pid/${pid}.xml`);
  const n = xml?.match(/<dblpperson\b[^>]*\bn=["'](\d+)["']/i)?.[1];
  if (n) {
    return Number(n);
  }
  const matches = xml?.match(/<r>/g);
  return matches?.length;
}

function extractEnglishNameCandidates(candidate: SogangFacultyCandidate, page: PageData | undefined): string[] {
  const names = new Set<string>();
  if (candidate.nameKo && /^[A-Za-z][A-Za-z .'-]{2,60}$/.test(candidate.nameKo)) {
    names.add(candidate.nameKo);
  }

  const text = `${page?.title ?? ""}\n${page?.text.slice(0, 3000) ?? ""}`;
  const fallbackTitleNames = new Set<string>();
  const titleNames = page?.title.match(/\b[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?\s+[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?\b/g) ?? [];
  for (const titleName of titleNames) {
    if (!/University|Laboratory|Systems|Machine|Learning|Research|Group|Google|Scholar|Sogang|Computer|Science|Engineering|Data|Homepage/i.test(titleName)) {
      fallbackTitleNames.add(titleName);
    }
  }
  if (candidate.nameKo && /^[가-힣]{2,4}$/.test(candidate.nameKo)) {
    const escapedName = escapeRegExp(candidate.nameKo);
    const englishName = String.raw`([A-Z][a-z]+(?:[-'][A-Z][a-z]+)?\s+[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?)`;
    const bilingualPatterns = [
      new RegExp(`${englishName}\\s*[\\(\\[]\\s*${escapedName}\\s*[\\)\\]]`, "g"),
      new RegExp(`${escapedName}\\s*[\\(\\[]\\s*${englishName}\\s*[\\)\\]]`, "g"),
      new RegExp(`${englishName}\\s*[,/|·-]\\s*${escapedName}`, "g"),
      new RegExp(`${escapedName}\\s*[,/|·-]\\s*${englishName}`, "g"),
    ];
    for (const pattern of bilingualPatterns) {
      for (const match of text.matchAll(pattern)) {
        const value = match[1];
        if (value && !/Sogang University|Google Scholar/i.test(value)) {
          names.add(value);
        }
      }
    }
  }

  const patterns = [
    /\b(?:Professor|Prof\.|Dr\.)\s+([A-Z][a-z]+(?:[-'][A-Z][a-z]+)?\s+[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?)\b/g,
    /\b([A-Z][a-z]+(?:[-'][A-Z][a-z]+)?\s+[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?)\s+(?:Professor|Prof\.|Ph\.?D)\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1] && !/Seoul National|Sogang University|Google Scholar/i.test(match[1])) {
        names.add(match[1]);
      }
    }
  }

  const canUsePageTitleFallback = !candidate.nameKo || /^[A-Za-z][A-Za-z .'-]{2,60}$/.test(candidate.nameKo);
  if (canUsePageTitleFallback) {
    for (const fallbackName of fallbackTitleNames) {
      names.add(fallbackName);
    }
  }

  return [...names].slice(0, 5);
}

async function resolveDblpAuthor(name: string) {
  const key = normalizeName(name);
  const cached = dblpAuthorCache.get(key);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const url = `https://dblp.uni-trier.de/search/author/api?q=${encodeURIComponent(name)}&format=json`;
    const jsonText = await fetchText(url);
    if (!jsonText) {
      return undefined;
    }
    const json = JSON.parse(jsonText) as { result?: { hits?: { hit?: DblpAuthorHit | DblpAuthorHit[] } } };
    const rawHits = json.result?.hits?.hit;
    const hits = Array.isArray(rawHits) ? rawHits : rawHits ? [rawHits] : [];
    const exact = hits.find((hit) => hit.info?.author && normalizeName(hit.info.author) === key && hit.info.url);
    const authorUrl = exact?.info?.url;
    if (!authorUrl) {
      return undefined;
    }
    return {
      authorName: exact?.info?.author,
      url: authorUrl,
      paperCount: await fetchDblpPublicationCount(authorUrl),
    };
  })();

  dblpAuthorCache.set(key, promise);
  return promise;
}

async function enrichDblp(candidate: SogangFacultyCandidate, rootPage: PageData | undefined) {
  const override = sogangDblpOverrides[`${candidate.sourceProgramName}|${candidate.nameKo ?? ""}`];
  if (override) {
    return {
      dblpUrl: override.url,
      paperCount: override.paperCount,
      dblpAuthorName: override.authorName,
    };
  }

  const external = findExternalProfileLinks(rootPage);
  if (external.dblpUrl) {
    return {
      dblpUrl: external.dblpUrl,
      paperCount: await fetchDblpPublicationCount(external.dblpUrl),
      dblpAuthorName: undefined,
    };
  }

  for (const name of extractEnglishNameCandidates(candidate, rootPage)) {
    const result = await resolveDblpAuthor(name);
    if (result?.url) {
      return {
        dblpUrl: result.url,
        paperCount: result.paperCount,
        dblpAuthorName: result.authorName,
      };
    }
  }

  return {};
}

async function enrichPublicationPageCount(context: BrowserContext, rootPage: PageData | undefined) {
  if (!rootPage) {
    return {};
  }
  const links = candidateLinks(rootPage, "publications");
  for (const link of links) {
    if (isUnreliablePublicationSource(link.href)) {
      continue;
    }
    const page = await fetchPageData(context, link.href);
    const count = extractPublicationPageCount(page?.text ?? "");
    if (count) {
      return { paperCount: count, paperCountSourceUrl: page?.finalUrl ?? link.href };
    }
  }
  const rootLooksLikePublicationPage = /publications?|papers?|논문|연구성과/i.test(`${rootPage.title} ${rootPage.finalUrl}`);
  if (rootLooksLikePublicationPage) {
    if (isUnreliablePublicationSource(rootPage.finalUrl)) {
      return {};
    }
    const count = extractPublicationPageCount(rootPage.text);
    if (count) {
      return { paperCount: count, paperCountSourceUrl: rootPage.finalUrl };
    }
  }
  return {};
}

async function enrichCandidate(context: BrowserContext, candidate: SogangFacultyCandidate): Promise<SogangFacultyCandidate> {
  const warnings: string[] = [];
  const sanitizedCandidate = clearUnreliableExistingMetrics(candidate);
  const overrideKey = `${candidate.sourceProgramName}|${candidate.nameKo ?? ""}`;
  const labUrlOverride = sogangLabUrlOverrides[overrideKey];
  const metricOverride = sogangMetricOverrides[overrideKey];
  const rootUrl = labUrlOverride ?? candidate.labUrl ?? candidate.sourceUrl;
  const rootPage = rootUrl ? await fetchPageData(context, rootUrl) : undefined;
  if (!rootPage) {
    warnings.push("lab_or_profile_page_fetch_failed");
  }

  const profileExternalLinks = findExternalProfileLinks(rootPage);
  const promotedLabUrl = labUrlOverride ?? profileExternalLinks.homepageUrl ?? candidate.labUrl;
  const promotedPage = profileExternalLinks.homepageUrl ? await fetchPageData(context, profileExternalLinks.homepageUrl) : undefined;
  const effectivePage = promotedPage ?? rootPage;
  const effectiveExternalLinks = findExternalProfileLinks(effectivePage);
  const externalLinks = {
    scholarUrl: effectiveExternalLinks.scholarUrl ?? profileExternalLinks.scholarUrl,
    dblpUrl: effectiveExternalLinks.dblpUrl ?? profileExternalLinks.dblpUrl,
  };
  const memberCount = await enrichMemberCount(context, effectivePage);
  const dblp = await enrichDblp(candidate, effectivePage);
  const publicationPage = dblp.paperCount ? {} : await enrichPublicationPageCount(context, effectivePage);
  const paperCount = dblp.paperCount ?? publicationPage.paperCount;

  return applyMetricOverride({
    ...sanitizedCandidate,
    labUrl: promotedLabUrl,
    currentMemberCount: metricOverride?.currentMemberCount ?? memberCount.count,
    memberCountBreakdown: metricOverride?.memberCountBreakdown ?? memberCount.breakdown,
    memberCountSourceUrl: metricOverride?.memberCountSourceUrl ?? memberCount.sourceUrl,
    memberCountCrawledAt: metricOverride?.currentMemberCount || memberCount.count ? new Date().toISOString() : undefined,
    scholarUrl: metricOverride && "scholarUrl" in metricOverride ? (metricOverride.scholarUrl ?? undefined) : externalLinks.scholarUrl,
    dblpUrl: dblp.dblpUrl,
    dblpAuthorName: dblp.dblpAuthorName,
    paperCount: metricOverride?.paperCount ?? paperCount,
    paperCountSource: metricOverride?.paperCountSource ?? (dblp.paperCount ? "dblp" : paperCount ? "publication_page" : undefined),
    paperCountSourceUrl: metricOverride?.paperCountSourceUrl ?? dblp.dblpUrl ?? publicationPage.paperCountSourceUrl,
    enrichedAt: new Date().toISOString(),
    enrichmentWarnings: warnings.length > 0 ? warnings : undefined,
  }, metricOverride);
}

function updateSummary(report: SogangDiscoveryReport) {
  report.summary = {
    ...report.summary,
    enrichment: {
      facultyCandidates: report.facultyCandidates.length,
      withMemberCount: report.facultyCandidates.filter((row) => typeof row.currentMemberCount === "number").length,
      withScholarUrl: report.facultyCandidates.filter((row) => row.scholarUrl).length,
      withDblpUrl: report.facultyCandidates.filter((row) => row.dblpUrl).length,
      withPaperCount: report.facultyCandidates.filter((row) => typeof row.paperCount === "number").length,
      withDblpPaperCount: report.facultyCandidates.filter((row) => row.paperCountSource === "dblp").length,
      withPublicationPagePaperCount: report.facultyCandidates.filter((row) => row.paperCountSource === "publication_page").length,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const reportPath = String(args.get("report") ?? "reports/sogang-grad-discovery.json");
  const offset = Number(args.get("offset") ?? 0);
  const maxCandidatesArg = args.get("max-candidates");
  const maxCandidates = maxCandidatesArg ? Number(maxCandidatesArg) : undefined;
  const programFilter = args.get("program");
  const concurrency = Number(args.get("concurrency") ?? 4);
  const report = JSON.parse(await readFile(reportPath, "utf8")) as SogangDiscoveryReport;
  const indexedCandidates = report.facultyCandidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ index }) => index >= offset)
    .filter(({ candidate }) => typeof programFilter !== "string" || candidate.sourceProgramName === programFilter)
    .slice(0, maxCandidates ?? report.facultyCandidates.length);
  const browser = await createBrowserManager();

  try {
    const enriched = await mapLimit(indexedCandidates, concurrency, async ({ candidate, index: sourceIndex }, index) => {
      let result: SogangFacultyCandidate;
      try {
        result = await withTimeout(
          enrichCandidate(browser.context, candidate),
          candidateTimeoutMs,
          `candidate_enrichment_timeout:${candidate.sourceProgramName}:${candidate.nameKo ?? "unknown"}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "candidate_enrichment_failed";
        const overrideKey = `${candidate.sourceProgramName}|${candidate.nameKo ?? ""}`;
        result = {
          ...applyMetricOverride(clearUnreliableExistingMetrics(candidate), sogangMetricOverrides[overrideKey]),
          enrichedAt: new Date().toISOString(),
          enrichmentWarnings: [...(candidate.enrichmentWarnings ?? []), message],
        };
      }
      if ((index + 1) % 25 === 0 || index === indexedCandidates.length - 1) {
        console.error(`Enriched ${index + 1}/${indexedCandidates.length}`);
      }
      return { sourceIndex, result };
    });

    for (const { sourceIndex, result } of enriched) {
      report.facultyCandidates[sourceIndex] = result;
    }
    updateSummary(report);
    await mkdir("reports", { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    const enrichedPath = join("reports", `${basename(reportPath).replace(/\.json$/i, "")}-enriched.json`);
    await writeFile(enrichedPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ reportPath, enrichedPath, summary: report.summary.enrichment }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
