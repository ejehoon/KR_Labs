import type { BrowserContext, Page } from "playwright";
import { cleanText, resolveUrl, uniqueBy } from "../core/html.js";
import { enrichLabMemberCount } from "../core/labMetrics.js";
import { classifyResearchText, type ResearchClassification } from "../taxonomy/researchTaxonomy.js";

export type UosGraduateDepartment = {
  category: string;
  name: string;
  phone?: string;
  processes: string[];
  listUrl: string;
  detailUrl?: string;
  homepageUrl?: string;
  facultyUrl?: string;
  labIntroUrl?: string;
  researchText?: string;
  classification: ResearchClassification;
  warnings: string[];
};

export type UosFacultyCandidate = {
  category: string;
  sourceDepartmentName: string;
  affiliation?: string;
  nameKo?: string;
  title?: string;
  email?: string;
  phone?: string;
  office?: string;
  labName?: string;
  labUrl?: string;
  labUrlSource: "external_lab_homepage" | "professor_profile_fallback" | "faculty_page_fallback";
  profileUrl?: string;
  sourceUrl: string;
  sourceParser: string;
  researchText?: string;
  currentMemberCount?: number;
  memberCountBreakdown?: Record<string, number>;
  memberCountSourceUrl?: string;
  memberCountCrawledAt?: string;
  dblpUrl?: string;
  scholarUrl?: string;
  paperCount?: number;
  classification: ResearchClassification;
  warnings: string[];
};

export type UosGraduateDiscoveryReport = {
  sourceUrl: string;
  generatedAt: string;
  departments: UosGraduateDepartment[];
  facultyCandidates: UosFacultyCandidate[];
  failedPages: Array<{ url: string; reason: string }>;
  discovery: {
    categoryCount: number;
    departmentCount: number;
    professorListUrlCount: number;
    professorDetailPattern: string;
    labHomepagePatterns: string[];
    memberPageExploration: string;
    publicationExploration: string;
    difficulties: string[];
    adapterDesign: string[];
  };
  summary: {
    departmentCount: number;
    professorCount: number;
    labUrlCount: number;
    externalLabUrlCount: number;
    fallbackLabUrlCount: number;
    memberCountKnown: number;
    memberCountUnknown: number;
    dblpUrlCount: number;
    scholarUrlCount: number;
    taxonomyMatchCounts: Record<string, number>;
    uncategorizedCount: number;
    manualReviewCount: number;
    countsByCategory: Record<string, number>;
    countsByDepartment: Record<string, number>;
    countsByParser: Record<string, number>;
  };
};

type RawDepartment = {
  category: string;
  name: string;
  phone?: string;
  processes: string[];
  detailArgs: string[];
  externalDetailUrl?: string;
};

type RawFaculty = {
  nameKo?: string;
  title?: string;
  affiliation?: string;
  email?: string;
  phone?: string;
  office?: string;
  researchText?: string;
  homepageUrl?: string;
  labName?: string;
  profileUrl?: string;
  sourceParser: string;
};

const defaultSourceUrl = "https://graduate.uos.ac.kr/graduateNew/deptIntro/human/list.do?menuid=3000001003001000000&identified=anonymous&";
const userAgent = process.env.CRAWLER_USER_AGENT ?? "KR-Labs-Crawler/0.1 contact@example.com";

function hasText(value: string | undefined): value is string {
  return Boolean(cleanText(value));
}

function countBy<T>(items: T[], getKey: (item: T) => string | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = getKey(item);
    if (!key) {
      continue;
    }
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function normalizeName(value: string | undefined): string | undefined {
  return cleanText(value)
    ?.replace(/\s*\([^)]*(?:학과장|전공주임|주임)[^)]*\)\s*/g, "")
    .replace(/\s*(?:교수|부교수|조교수|석좌교수|명예교수)\s*$/g, "")
    .replace(/\s+/g, "");
}

function profileUrlFromOnclick(onclick: string | undefined): string | undefined {
  if (!onclick) {
    return undefined;
  }
  const direct = onclick.match(/https?:\/\/www\.uos\.ac\.kr\/prof\/(\d+)/i)?.[1];
  const encoded = onclick.match(/encodeURIComponent\('(\d+)'\)/i)?.[1];
  const view = onclick.match(/professorView2\('(\d+)'/i)?.[1];
  const id = direct ?? encoded ?? view;
  return id ? `https://www.uos.ac.kr/prof/${id}` : undefined;
}

function profileId(url: string | undefined): string | undefined {
  return url?.match(/\/prof\/(\d+)/)?.[1];
}

function cleanEmail(value: string | undefined): string | undefined {
  const text = cleanText(value)
    ?.replace(/E-?mail\s*(?:복사|Copy)?/gi, "")
    .replace(/주소복사/g, "")
    .replace(/유오에스닷씨오닷케이알/g, "@uos.ac.kr")
    .trim();
  if (!text || text === "-") {
    return undefined;
  }
  const direct = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (direct) {
    return direct.toLowerCase();
  }
  const local = text.match(/[A-Z0-9._%+-]{2,}/i)?.[0];
  if (!local || /^https?$|^homepage$/i.test(local)) {
    return undefined;
  }
  return `${local.toLowerCase()}@uos.ac.kr`;
}

function isUsableExternalLabUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    if (/^(?:mailto|tel|javascript):/i.test(url)) {
      return false;
    }
    if (/uos\.ac\.kr\/prof\/\d+/i.test(url)) {
      return false;
    }
    if (/\.(?:jpe?g|png|gif|webp|svg|pdf|hwp|docx?)(?:$|[?#])/i.test(parsed.pathname)) {
      return false;
    }
    if (/^https?:\/\/econ\.uos\.ac\.kr\//i.test(url)) {
      return false;
    }
    if (/themewant\.com\/products\/wordpress\/unipix/i.test(url)) {
      return false;
    }
    if (/^https?:\/\/(?:www\.)?uos\.ac\.kr\/?(?:#.*)?$/i.test(url)) {
      return false;
    }
    if (/^https?:\/\/(?:www\.)?uos\.ac\.kr\/-(?:$|[?#])/i.test(url)) {
      return false;
    }
    if (/\/prof\/list\.do(?:$|[?#])/i.test(url)) {
      return false;
    }
    if (/lifesci\.uos\.ac\.kr\/research\/faculty(?:$|[?#])/i.test(url)) {
      return false;
    }
    if (/lifesci\.uos\.ac\.kr\/research\/lab(?:$|[?#/])/i.test(url)) {
      return false;
    }
    if (/lifesci\.uos\.ac\.kr\/en(?:$|[?#/])/i.test(url)) {
      return false;
    }
    if (/lifesci\.uos\.ac\.kr\/webdata\//i.test(url)) {
      return false;
    }
    if (/#none$/i.test(url)) {
      return false;
    }
    if (/scholar\.google|dblp\.org/i.test(url)) {
      return false;
    }
    if (/orcid\.org/i.test(url)) {
      return false;
    }
    if (/pure\.uos\.ac\.kr/i.test(url)) {
      return false;
    }
    if (/uos\.ac\.kr\/(?:main|eng|kor\/main)\.do/i.test(url)) {
      return false;
    }
    if (/graduate\.uos\.ac\.kr\/graduateNew\/deptIntro/i.test(url)) {
      return false;
    }
    if (/\/web\/contents\/prolist\d*(?:$|[?#])/i.test(url)) {
      return false;
    }
    if (/\/(?:notice|board|korNotice|korReply|korFree|korGallery|login|main)\.do(?:$|[?#])/i.test(url)) {
      return false;
    }
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function repairMalformedExternalUrl(url: string | undefined): string | undefined {
  const text = cleanText(url);
  if (!text) {
    return undefined;
  }
  const malformedUosRelative = text.match(/^https?:\/\/www\.uos\.ac\.kr\/(www\.[^?#\s]+(?:[?#].*)?)$/i)?.[1];
  if (malformedUosRelative) {
    return `https://${malformedUosRelative}`;
  }
  return text;
}

function externalLinksFromText(text: string | undefined): string[] {
  return [...(text ?? "").matchAll(/https?:\/\/[^\s)]+/gi)]
    .map((match) => match[0]?.replace(/[.,;]+$/, ""))
    .filter((url): url is string => Boolean(url));
}

function cleanResearchText(value: string | undefined): string | undefined {
  const text = cleanText(value);
  if (!text) {
    return undefined;
  }
  const stop = text.search(/\s(?:[가-힣]+관\s*[\d-]+호|\d{2,3}-\d{3,4}-\d{4}|[A-Z0-9._%+-]+@uos\.ac\.kr|E-?mail|Homepage|Detail|주소복사)/i);
  return cleanText(stop >= 0 ? text.slice(0, stop) : text);
}

async function openPage(context: BrowserContext, url: string, timeoutMs = 20_000): Promise<Page> {
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(timeoutMs);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined);
  return page;
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function extractCategoryUrls(context: BrowserContext, sourceUrl: string): Promise<Array<{ category: string; url: string }>> {
  const page = await openPage(context, sourceUrl);
  try {
    return await page.evaluate(() =>
      [...document.querySelectorAll("#contents .new2023-tab1 a[href]")]
        .map((anchor) => ({
          category: anchor.textContent?.replace(/\s+/g, " ").trim() ?? "",
          url: new URL(anchor.getAttribute("href") ?? "", location.href).toString(),
        }))
        .filter((item) => item.category && item.url),
    );
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function extractDepartmentList(context: BrowserContext, category: string, listUrl: string): Promise<RawDepartment[]> {
  const page = await openPage(context, listUrl);
  try {
    return await page.evaluate((categoryName) => {
      const clean = (value: string | undefined | null) => value?.replace(/\s+/g, " ").trim() || "";
      return [...document.querySelectorAll("#contents .gray-box")].map((box) => {
        const detailButton = [...box.querySelectorAll("button")].find((button) => clean(button.textContent).includes("자세히"));
        const detailOnclick = detailButton?.getAttribute("onclick") ?? "";
        const detailArgs = [...detailOnclick.matchAll(/'([^']*)'/g)].map((match) => match[1] ?? "");
        const externalDetailUrl = detailOnclick.match(/window\.open\('([^']+)'/i)?.[1];
        const phoneText = clean([...box.querySelectorAll("li")].find((li) => /학과전화/.test(li.textContent ?? ""))?.textContent);
        return {
          category: categoryName,
          name: clean(box.querySelector("strong")?.textContent),
          phone: phoneText.replace(/^학과전화\s*:?/, "").trim(),
          processes: [...box.querySelectorAll("button")]
            .map((button) => clean(button.textContent))
            .filter((text) => text && !text.includes("자세히")),
          detailArgs,
          externalDetailUrl,
        };
      }).filter((item) => item.name);
    }, category);
  } finally {
    await page.close().catch(() => undefined);
  }
}

function detailUrlFromArgs(args: string[]): string | undefined {
  if (args.length < 3 || !args[0]) {
    return undefined;
  }
  return `https://graduate.uos.ac.kr/graduateNew/deptIntro/${args[0]}/view.do?code=${args[1] ?? ""}&cate_id2=${args[2] ?? ""}&tab_id=1`;
}

async function enrichDepartmentDetail(context: BrowserContext, raw: RawDepartment, listUrl: string): Promise<UosGraduateDepartment> {
  const detailUrl = detailUrlFromArgs(raw.detailArgs);
  const warnings: string[] = [];
  let homepageUrl: string | undefined;
  let facultyUrl: string | undefined;
  let labIntroUrl: string | undefined;
  let researchText: string | undefined;

  if (!detailUrl && !raw.externalDetailUrl) {
    warnings.push("학과 상세 URL 없음");
  } else {
    const page = await openPage(context, (detailUrl ?? raw.externalDetailUrl) as string).catch(() => undefined);
    if (!page) {
      warnings.push("학과 상세 페이지 접근 실패");
    } else {
      try {
        const detail = await page.evaluate(() => {
          const clean = (value: string | undefined | null) => value?.replace(/\s+/g, " ").trim() || "";
          const anchors = [...document.querySelectorAll("#contents a[href]")].map((anchor) => ({
            text: clean(anchor.textContent || anchor.querySelector("img")?.getAttribute("alt")),
            title: anchor.getAttribute("title") ?? "",
            href: (anchor as HTMLAnchorElement).href,
          }));
          const rows = [...document.querySelectorAll("#contents tr")].map((tr) =>
            [...tr.querySelectorAll("th,td")].map((cell) => clean(cell.textContent)).filter(Boolean),
          );
          return {
            anchors,
            researchText: rows.find((row) => /^연구\s*분야$/.test(row[0] ?? ""))?.[1],
          };
        });
        homepageUrl = detail.anchors.find((anchor) => /홈페이지/.test(`${anchor.text} ${anchor.title}`))?.href ?? raw.externalDetailUrl;
        facultyUrl = detail.anchors.find((anchor) => /교수소개|전임\s*교수|current[-\s]?faculty/i.test(`${anchor.text} ${anchor.title} ${anchor.href}`))?.href;
        labIntroUrl = detail.anchors.find((anchor) => /연구실소개|연구실/.test(`${anchor.text} ${anchor.title}`))?.href;
        researchText = cleanText(detail.researchText);
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  }

  if (raw.name === "경제학과") {
    homepageUrl = homepageUrl ?? raw.externalDetailUrl ?? "https://econ.uos.ac.kr/graduate-admissions";
    facultyUrl = facultyUrl ?? "https://econ.uos.ac.kr/current-faculty";
  }
  if (raw.name === "조형디자인학과") {
    homepageUrl = homepageUrl ?? "https://www.uos.ac.kr/artandsport/sculpture/main.do";
    facultyUrl = facultyUrl ?? "https://www.uos.ac.kr/artandsport/design/prof/list.do?cate=1";
  }

  if (!facultyUrl) {
    warnings.push("교수소개 URL 없음");
  }

  const classification = classifyResearchText([raw.category, raw.name, researchText].filter(hasText).join(" | "));
  return {
    category: raw.category,
    name: raw.name,
    phone: cleanText(raw.phone),
    processes: raw.processes,
    listUrl,
    detailUrl,
    homepageUrl,
    facultyUrl,
    labIntroUrl,
    researchText,
    classification,
    warnings,
  };
}

function buildCandidate(input: RawFaculty, department: UosGraduateDepartment): UosFacultyCandidate | undefined {
  const nameKo = normalizeName(input.nameKo);
  if (!nameKo || !/^[가-힣]{2,5}$/.test(nameKo)) {
    return undefined;
  }
  if (
    department.name.includes("바이오헬스")
    && input.sourceParser === "uos-faculty-table"
    && !input.profileUrl
    && !input.homepageUrl
  ) {
    return undefined;
  }

  const homepageCandidates = [
    input.homepageUrl,
    ...externalLinksFromText(input.researchText),
  ]
    .map(repairMalformedExternalUrl)
    .filter((url): url is string => isUsableExternalLabUrl(url));
  const externalLabUrl = homepageCandidates[0];
  const profileUrl = input.profileUrl;
  const labUrl = externalLabUrl ?? profileUrl ?? department.facultyUrl;
  const labUrlSource = externalLabUrl
    ? "external_lab_homepage"
    : profileUrl
      ? "professor_profile_fallback"
      : "faculty_page_fallback";
  const warnings = externalLabUrl ? [] : ["연구실 홈페이지 없음, fallback 사용"];
  const evidence = [
    cleanResearchText(input.researchText),
    input.labName,
    department.researchText,
    department.name,
  ].filter(hasText).join(" | ");

  return {
    category: department.category,
    sourceDepartmentName: department.name,
    affiliation: cleanText(input.affiliation),
    nameKo,
    title: cleanText(input.title),
    email: cleanEmail(input.email),
    phone: cleanText(input.phone),
    office: cleanText(input.office),
    labName: cleanText(input.labName),
    labUrl,
    labUrlSource,
    profileUrl,
    sourceUrl: department.facultyUrl ?? department.detailUrl ?? department.listUrl,
    sourceParser: input.sourceParser,
    researchText: cleanResearchText(input.researchText),
    classification: classifyResearchText(evidence),
    warnings,
  };
}

function facultyUrlsForDepartment(department: UosGraduateDepartment): string[] {
  if (department.name === "경제학과") {
    return ["https://econ.uos.ac.kr/current-faculty"];
  }
  if (department.name === "조형디자인학과") {
    return [
      "https://www.uos.ac.kr/artandsport/design/prof/list.do?cate=1",
      "https://www.uos.ac.kr/artandsport/design/prof/list.do?cate=2",
      "https://www.uos.ac.kr/artandsport/sculpture/prof/list.do?cate=1",
    ];
  }
  return department.facultyUrl ? [department.facultyUrl] : [];
}

async function extractSingleFacultyPage(context: BrowserContext, department: UosGraduateDepartment, facultyUrl: string): Promise<UosFacultyCandidate[]> {
  const page = await openPage(context, facultyUrl).catch(() => undefined);
  if (!page) {
    return [];
  }

  try {
    const rows = await page.evaluate(() => {
      const clean = (value: string | undefined | null) => value?.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() || "";
      const byLabel = (text: string, label: RegExp) => {
        const match = text.match(label);
        if (!match?.index) {
          return "";
        }
        const tail = text.slice(match.index + match[0].length);
        const stop = tail.search(/\s(?:연구분야|교수연구실|연구실|전화번호|Homepage|E-?mail|Detail|상세보기)\s*:?/i);
        return clean(stop >= 0 ? tail.slice(0, stop) : tail);
      };
      const profileFrom = (root: Element) => {
        const href = [...root.querySelectorAll("a[href]")].map((a) => (a as HTMLAnchorElement).href).find((value) => /\/prof\/\d+/.test(value));
        if (href) return href;
        const onclick = [...root.querySelectorAll("[onclick]")].map((el) => el.getAttribute("onclick") ?? "").find((value) => /prof\/|professorView2|encodeURIComponent/.test(value));
        const id = onclick?.match(/\/prof\/(\d+)/)?.[1] ?? onclick?.match(/encodeURIComponent\('(\d+)'\)/)?.[1] ?? onclick?.match(/professorView2\('(\d+)'/)?.[1];
        return id ? `https://www.uos.ac.kr/prof/${id}` : "";
      };
      const emailFrom = (root: Element, text: string) => {
        const copied = [...root.querySelectorAll("[onclick]")].map((el) => el.getAttribute("onclick") ?? "").join(" ").match(/[A-Z0-9._%+-]+@uos\.ac\.kr/i)?.[0];
        if (copied) return copied;
        return text.match(/[A-Z0-9._%+-]+@uos\.ac\.kr/i)?.[0] ?? text.match(/E-?mail\s*:?\s*([A-Z0-9._%+-]+)/i)?.[1] ?? "";
      };
      const homepageFrom = (root: Element, text: string) => {
        const href = [...root.querySelectorAll("a[href]")]
          .map((a) => (a as HTMLAnchorElement).href)
          .find((value) =>
            /^https?:\/\//i.test(value)
            && !/\/prof\/\d+/.test(value)
            && !/\/prof\/list\.do/i.test(value)
            && !/[?#](?:none|n|a|menu|content02)?$/i.test(value)
            && !/\/(?:main|welcome|introduct|history|course)\.do/i.test(value)
          );
        return href ?? text.match(/https?:\/\/[^\s)]+/i)?.[0] ?? "";
      };

      const standard = [...document.querySelectorAll(".teacher-list > ul > li")].map((item) => {
        const text = clean(item.textContent);
        const name = clean(item.querySelector(".tc-name")?.textContent) || clean(item.querySelector("img[alt*='교수']")?.getAttribute("alt")).replace(/\s*교수님.*$/, "");
        return {
          nameKo: name,
          email: emailFrom(item, text),
          phone: byLabel(text, /전화번호\s*:\s*/i),
          office: byLabel(text, /(?:교수연구실|연구실)\s*:\s*/i),
          researchText: byLabel(text, /연구분야\s*:\s*/i),
          homepageUrl: homepageFrom(item, text),
          profileUrl: profileFrom(item),
          sourceParser: "uos-standard-teacher-list",
        };
      });

      const business = [...document.querySelectorAll(".proList > li.professor")].map((item) => {
        const text = clean(item.textContent);
        return {
          nameKo: clean(item.querySelector(".info li[style*='font-weight']")?.textContent) || text.match(/^([가-힣]{2,5})\s/)?.[1] || "",
          email: emailFrom(item, text),
          phone: byLabel(text, /전화번호\s*:\s*/i),
          office: byLabel(text, /교수연구실\s*:\s*/i),
          researchText: byLabel(text, /연구분야\s*:\s*/i),
          homepageUrl: homepageFrom(item, text),
          profileUrl: profileFrom(item),
          sourceParser: "uos-business-pro-list",
        };
      });

      const economics = [...document.querySelectorAll(".team-item")].map((item) => {
        const text = clean(item.textContent);
        const anchors = [...item.querySelectorAll("a[href]")].map((anchor) => ({
          text: clean(anchor.textContent),
          href: (anchor as HTMLAnchorElement).href,
        }));
        const profileUrl = anchors.find((anchor) => /자세히/.test(anchor.text))?.href ?? "";
        const homepageUrl = anchors.find((anchor) => /개인\s*웹사이트|website|homepage/i.test(anchor.text))?.href ?? "";
        const email = text.match(/[A-Z0-9._%+-]+@uos\.ac\.kr/i)?.[0] ?? "";
        const phone = text.match(/\b0\d{1,2}-\d{3,4}-\d{4}\b/)?.[0] ?? "";
        const office = text.match(/[가-힣A-Za-z]+관\s*\d{3,4}호/)?.[0] ?? "";
        const researchText = clean(text
          .replace(/^([가-힣]{2,5})\s*/, "")
          .replace(office, "")
          .replace(phone, "")
          .replace(email, "")
          .replace(/개인\s*웹사이트/g, "")
          .replace(/자세히\s*보기/g, ""));
        return {
          nameKo: text.match(/^([가-힣]{2,5})\s/)?.[1] ?? "",
          email,
          phone,
          office,
          researchText,
          homepageUrl,
          profileUrl,
          sourceParser: "uos-econ-team-item",
        };
      });

      const lifeScience = [...document.querySelectorAll(".card.h-100, .card")].map((item) => {
        const text = clean(item.textContent);
        const nameNode = item.querySelector(".name");
        const nameText = clean(nameNode?.childNodes[0]?.textContent ?? nameNode?.textContent);
        const title = clean(nameNode?.querySelector("span")?.textContent);
        const labAnchor = item.querySelector("a.homepy") as HTMLAnchorElement | null;
        const profileAnchor = item.querySelector("a[href*='faculty?mode=view']") as HTMLAnchorElement | null;
        return {
          nameKo: nameText,
          title,
          labName: clean(labAnchor?.textContent),
          researchText: clean(item.querySelector(".keyword")?.textContent)?.replace(/#/g, ""),
          homepageUrl: labAnchor?.href ?? "",
          profileUrl: profileAnchor?.href ?? "",
          sourceParser: "uos-lifesci-card",
        };
      }).filter((item) => item.nameKo);

      const tables = [...document.querySelectorAll(".contents table tbody tr, #contents table tbody tr, table tbody tr")].flatMap((tr) => {
        const cells = [...tr.querySelectorAll("td")].map((cell) => clean(cell.textContent));
        if (cells.length < 2 || !cells.some((cell) => /교수|[가-힣]{2,5}/.test(cell))) {
          return [];
        }
        let affiliation = "";
        let nameCell = cells[0] ?? "";
        let researchText = cells[1] ?? "";
        if (cells.length >= 3) {
          affiliation = cells[0] ?? "";
          nameCell = cells[1] ?? "";
          researchText = cells[2] ?? "";
        }
        const nameMatch = nameCell.match(/([가-힣]{2,5})\s*(?:교수)?(?:\(([^)]*)\))?/);
        if (!nameMatch) {
          return [];
        }
        return [{
          nameKo: nameMatch[1],
          affiliation: nameMatch[2] ?? affiliation,
          researchText,
          profileUrl: profileFrom(tr),
          sourceParser: "uos-faculty-table",
        }];
      });

      return [...standard, ...business, ...economics, ...lifeScience, ...tables];
    });

    return uniqueBy(
      rows
        .map((row) => buildCandidate(row, department))
        .filter((candidate): candidate is UosFacultyCandidate => Boolean(candidate)),
      (candidate) => `${candidate.sourceDepartmentName}|${candidate.nameKo}|${candidate.profileUrl ?? ""}|${candidate.researchText ?? ""}`,
    );
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function extractFacultyPage(context: BrowserContext, department: UosGraduateDepartment): Promise<UosFacultyCandidate[]> {
  const facultyUrls = facultyUrlsForDepartment(department);
  if (facultyUrls.length === 0) {
    return [];
  }
  const pages = await mapLimit(facultyUrls, 1, async (facultyUrl) => extractSingleFacultyPage(context, department, facultyUrl));
  return uniqueBy(pages.flat(), (candidate) =>
    candidate.profileUrl
      ? `${candidate.sourceDepartmentName}|${profileId(candidate.profileUrl) ?? candidate.profileUrl}`
      : `${candidate.sourceDepartmentName}|${candidate.nameKo}|${candidate.researchText ?? ""}`,
  );
}

async function enrichProfileLinks(context: BrowserContext, candidate: UosFacultyCandidate): Promise<UosFacultyCandidate> {
  if (!candidate.profileUrl) {
    return candidate;
  }
  const page = await openPage(context, candidate.profileUrl, 12_000).catch(() => undefined);
  if (!page) {
    return candidate;
  }
  try {
    const profile = await page.evaluate(() => {
      const clean = (value: string | undefined | null) => value?.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() || "";
      const text = clean(document.body?.innerText);
      const links = [...document.querySelectorAll("a[href]")].map((anchor) => ({
        text: clean(anchor.textContent),
        href: (anchor as HTMLAnchorElement).href,
      }));
      const detailItems = [...document.querySelectorAll(".detail li")].map((item) => clean(item.textContent));
      return { text, links, detailItems };
    });
    const explicitScholar = profile.links.find((link) => /scholar\.google|google scholar/i.test(`${link.href} ${link.text}`))?.href;
    const explicitDblp = profile.links.find((link) => /dblp\.org/i.test(`${link.href} ${link.text}`))?.href;
    const explicitHomepage = profile.links
      .filter((link) => /home\s*page|website|개인\s*웹사이트|홈페이지|연구실|실험실|\blab\b/i.test(`${link.text} ${link.href}`))
      .map((link) => repairMalformedExternalUrl(link.href))
      .find((href) => isUsableExternalLabUrl(href));
    const profileResearch = profile.detailItems.find((item) => /^연구분야\s*:/.test(item))?.replace(/^연구분야\s*:\s*/, "");
    const profileOffice = profile.detailItems.find((item) => /^(?:교수연구실|연구실)\s*:/.test(item))?.replace(/^(?:교수연구실|연구실)\s*:\s*/, "");
    const profilePhone = profile.detailItems.find((item) => /^전화번호\s*:/.test(item))?.replace(/^전화번호\s*:\s*/, "");

    const next = { ...candidate };
    next.scholarUrl = candidate.scholarUrl ?? explicitScholar;
    next.dblpUrl = candidate.dblpUrl ?? explicitDblp;
    next.researchText = candidate.researchText ?? cleanText(profileResearch);
    next.office = candidate.office ?? cleanText(profileOffice);
    next.phone = candidate.phone ?? cleanText(profilePhone);
    if (explicitHomepage && candidate.labUrlSource !== "external_lab_homepage") {
      next.labUrl = explicitHomepage;
      next.labUrlSource = "external_lab_homepage";
      next.warnings = next.warnings.filter((warning) => warning !== "연구실 홈페이지 없음, fallback 사용");
    }
    next.classification = classifyResearchText([next.researchText, next.labName, next.sourceDepartmentName].filter(hasText).join(" | "));
    return next;
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function enrichMemberCounts(candidates: UosFacultyCandidate[], limit: number): Promise<UosFacultyCandidate[]> {
  const labUrlCandidates = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.labUrlSource === "external_lab_homepage" && isUsableExternalLabUrl(candidate.labUrl))
    .slice(0, limit);
  const enriched = [...candidates];
  await mapLimit(labUrlCandidates, 3, async ({ candidate, index }) => {
    const result = await enrichLabMemberCount(candidate.labUrl);
    const sameHost = result.sourceUrl && candidate.labUrl
      ? new URL(result.sourceUrl).hostname === new URL(candidate.labUrl).hostname
      : false;
    if (result.count && result.sourceUrl && sameHost) {
      enriched[index] = {
        ...candidate,
        currentMemberCount: result.count,
        memberCountBreakdown: result.breakdown,
        memberCountSourceUrl: result.sourceUrl,
        memberCountCrawledAt: new Date().toISOString(),
      };
    }
  });
  return enriched;
}

function buildSummary(departments: UosGraduateDepartment[], facultyCandidates: UosFacultyCandidate[]): UosGraduateDiscoveryReport["summary"] {
  const taxonomyMatchCounts: Record<string, number> = {};
  for (const candidate of facultyCandidates) {
    for (const match of candidate.classification.matches) {
      taxonomyMatchCounts[match.labelKo] = (taxonomyMatchCounts[match.labelKo] ?? 0) + 1;
    }
  }

  return {
    departmentCount: departments.length,
    professorCount: facultyCandidates.length,
    labUrlCount: facultyCandidates.filter((candidate) => candidate.labUrl).length,
    externalLabUrlCount: facultyCandidates.filter((candidate) => candidate.labUrlSource === "external_lab_homepage").length,
    fallbackLabUrlCount: facultyCandidates.filter((candidate) => candidate.labUrlSource !== "external_lab_homepage").length,
    memberCountKnown: facultyCandidates.filter((candidate) => typeof candidate.currentMemberCount === "number").length,
    memberCountUnknown: facultyCandidates.filter((candidate) => typeof candidate.currentMemberCount !== "number").length,
    dblpUrlCount: facultyCandidates.filter((candidate) => candidate.dblpUrl).length,
    scholarUrlCount: facultyCandidates.filter((candidate) => candidate.scholarUrl).length,
    taxonomyMatchCounts: Object.fromEntries(Object.entries(taxonomyMatchCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    uncategorizedCount: facultyCandidates.filter((candidate) => candidate.classification.matches.length === 0).length,
    manualReviewCount: facultyCandidates.filter((candidate) => candidate.warnings.length > 0 || candidate.classification.matches.length === 0).length,
    countsByCategory: countBy(facultyCandidates, (candidate) => candidate.category),
    countsByDepartment: countBy(facultyCandidates, (candidate) => candidate.sourceDepartmentName),
    countsByParser: countBy(facultyCandidates, (candidate) => candidate.sourceParser),
  };
}

export async function discoverUosGraduateSeeds(context: BrowserContext, options?: {
  sourceUrl?: string;
  maxDepartments?: number;
  maxProfiles?: number;
  maxMemberEnrich?: number;
}): Promise<UosGraduateDiscoveryReport> {
  const sourceUrl = options?.sourceUrl ?? defaultSourceUrl;
  const categoryUrls = await extractCategoryUrls(context, sourceUrl);
  const rawDepartments = (await mapLimit(categoryUrls, 1, async (category) => extractDepartmentList(context, category.category, category.url))).flat();
  const selectedRawDepartments = rawDepartments.slice(0, options?.maxDepartments ?? rawDepartments.length);
  const failedPages: UosGraduateDiscoveryReport["failedPages"] = [];
  const departments = await mapLimit(selectedRawDepartments, 1, async (raw) => {
    const listUrl = categoryUrls.find((item) => item.category === raw.category)?.url ?? sourceUrl;
    try {
      return await enrichDepartmentDetail(context, raw, listUrl);
    } catch (error) {
      failedPages.push({ url: listUrl, reason: error instanceof Error ? error.message : String(error) });
      return {
        category: raw.category,
        name: raw.name,
        phone: raw.phone,
        processes: raw.processes,
        listUrl,
        detailUrl: detailUrlFromArgs(raw.detailArgs),
        classification: classifyResearchText(`${raw.category} ${raw.name}`),
        warnings: ["학과 상세 파싱 실패"],
      };
    }
  });

  const rawFaculty = (await mapLimit(departments, 1, async (department) => {
    try {
      return await extractFacultyPage(context, department);
    } catch (error) {
      if (department.facultyUrl) {
        failedPages.push({ url: department.facultyUrl, reason: error instanceof Error ? error.message : String(error) });
      }
      return [];
    }
  })).flat();

  const dedupedFaculty = uniqueBy(rawFaculty, (candidate) =>
    candidate.profileUrl
      ? `${candidate.sourceDepartmentName}|${profileId(candidate.profileUrl) ?? candidate.profileUrl}`
      : `${candidate.sourceDepartmentName}|${candidate.nameKo}|${candidate.researchText ?? ""}`,
  );
  const profileLimit = options?.maxProfiles ?? dedupedFaculty.length;
  const profileEnriched = await mapLimit(dedupedFaculty, 4, async (candidate, index) =>
    index < profileLimit ? enrichProfileLinks(context, candidate) : candidate,
  );
  const memberEnriched = await enrichMemberCounts(profileEnriched, options?.maxMemberEnrich ?? profileEnriched.length);

  return {
    sourceUrl,
    generatedAt: new Date().toISOString(),
    departments,
    facultyCandidates: memberEnriched,
    failedPages,
    discovery: {
      categoryCount: categoryUrls.length,
      departmentCount: departments.length,
      professorListUrlCount: departments.filter((department) => department.facultyUrl).length,
      professorDetailPattern: "https://www.uos.ac.kr/prof/{numericProfessorId}",
      labHomepagePatterns: [
        "교수 목록 Homepage 필드의 외부 URL",
        "생명과학과 card의 a.homepy 연구실 홈페이지",
        "교수 상세 페이지의 명시적 외부 링크",
      ],
      memberPageExploration: "외부 연구실 홈페이지에서 Members/People/Team/Students/구성원/학생/연구원 링크와 일반 경로 후보만 추적했습니다.",
      publicationExploration: "교수 상세/연구실 페이지에 명시된 DBLP 또는 Scholar 링크만 저장하고, 이름 검색 기반 추정은 하지 않았습니다.",
      difficulties: [
        "학과 상세는 list.do의 button onclick으로 code/cate_id2를 제출하는 구조입니다.",
        "교수 목록은 일반대학원 내부 목록, 단과대 표준 teacher-list, 경영대 proList, 생명과학 card, 협동과정 table 등으로 갈라집니다.",
        "일부 학과(경제학과, 조형디자인학과 등)는 TARGET_URL에서 상세/교수소개 링크가 누락되거나 교수 목록이 별도 사이트에서 표준 구조가 아닙니다.",
        "교수 목록 Homepage 값이 이메일 ID, 학교 메인 URL, 빈 값인 경우가 많아 연구실 URL로 확정하지 않았습니다.",
      ],
      adapterDesign: [
        "계열/학과 discovery는 UOS graduate list 전용 parser로 분리합니다.",
        "학과 상세 parser는 홈페이지/교수소개/연구실소개 링크와 연구분야만 추출합니다.",
        "교수 parser는 selector map(teacher-list, business proList, life-science card, faculty table)으로 분기합니다.",
        "연구원수는 공통 enrichLabMemberCount 유틸로 외부 연구실 홈페이지에서만 계산합니다.",
      ],
    },
    summary: buildSummary(departments, memberEnriched),
  };
}
