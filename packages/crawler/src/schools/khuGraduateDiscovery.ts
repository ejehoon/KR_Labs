import type { BrowserContext } from "playwright";
import { cleanText, resolveUrl, textFromHtml, uniqueBy } from "../core/html.js";
import { enrichLabMemberCount } from "../core/labMetrics.js";
import { classifyResearchText, type ResearchClassification } from "../taxonomy/researchTaxonomy.js";

export type KhuGraduateSchoolSeed = {
  name: string;
  homepageUrl: string;
  sourceUrl: string;
  professorSearchCode?: string;
  facultyUrls: string[];
  departmentUrls: string[];
};

export type KhuFacultyCandidate = {
  graduateSchoolName: string;
  departmentName?: string;
  nameKo?: string;
  nameEn?: string;
  title?: string;
  email?: string;
  phone?: string;
  profileUrl?: string;
  labName?: string;
  labUrl?: string;
  labUrlKind: "external_home" | "external_lab" | "fallback_profile" | "fallback_faculty_page";
  sourceUrl: string;
  sourceParser: string;
  researchText?: string;
  classification: ResearchClassification;
  currentMemberCount?: number;
  memberCountBreakdown?: Record<string, number>;
  memberCountSourceUrl?: string;
  memberCountCrawledAt?: string;
  memberCountMethod?: string;
  dblpUrl?: string;
  scholarUrl?: string;
  scopusUrl?: string;
  pureUrl?: string;
  warnings: string[];
};

export type KhuGraduateDiscoveryReport = {
  sourceUrl: string;
  generatedAt: string;
  schools: KhuGraduateSchoolSeed[];
  facultyCandidates: KhuFacultyCandidate[];
  skippedPages: Array<{ url: string; reason: string }>;
  sampleVerifications?: KhuSampleVerification[];
  summary: {
    graduateSchoolCount: number;
    departmentCount: number;
    professorCount: number;
    labUrlCount: number;
    labUrlFallbackCount: number;
    memberCountKnown: number;
    memberCountUnknown: number;
    dblpUrlCount: number;
    scholarUrlCount: number;
    taxonomyClassifiedCount: number;
    taxonomyUnclassifiedCount: number;
    countsByGraduateSchool: Record<string, number>;
    taxonomyMatchCounts: Record<string, number>;
    suggestionCount: number;
  };
};

export type KhuSampleVerification = {
  name?: string;
  graduateSchoolName: string;
  checkedUrl?: string;
  status: "ok" | "needs_review" | "failed";
  evidence: string;
  title?: string;
};

const defaultSourceUrl = "https://www.khu.ac.kr/kor/user/contents/view.do?menuNo=200014";
const professorListUrl = "https://professor.khu.ac.kr/professor_kor/user/professor/list.do?menuNo=200015";
const professorViewUrl = "https://professor.khu.ac.kr/professor_kor/user/professor/view.do";
const requestHeaders = {
  "user-agent": process.env.CRAWLER_USER_AGENT ?? "KR-Labs-Crawler/0.1 contact@example.com",
};

const professorSearchCodes: Record<string, string> = {
  "일반대학원": "00025",
  "간호대학원": "000188",
  "경영대학원": "00026",
  "공공대학원": "00029",
  "관광대학원": "00030",
  "교육대학원": "00031",
  "국제대학원": "00032",
  "동서의학대학원": "00033",
  "미디어커뮤니케이션대학원": "00037",
  "법무대학원": "00034",
  "법학전문대학원": "00035",
  "아트퓨전디자인대학원": "00036",
  "의학전문대학원": "00038",
  "체육대학원": "00039",
  "치의학전문대학원": "00040",
  "테크노경영대학원": "00041",
  "평화복지대학원": "00042",
};

const knownFacultyUrls: Record<string, string[]> = {
  "일반대학원": [
    "https://professor.khu.ac.kr/professor_kor/user/professor/list.do?menuNo=200015",
  ],
  "경영대학원": ["https://khmba.khu.ac.kr/khmba_kor/user/bbs/BMSR00060/list.do?menuNo=10800217"],
  "공공대학원": ["https://pnc.khu.ac.kr/pnc/user/bbs/BMSR00047/list.do?menuNo=800053"],
  "관광대학원": ["https://tourism.khu.ac.kr/s1/s1_5.php"],
  "국제대학원": ["https://gsp.khu.ac.kr/gsp/user/bbs/BMSR00047/list.do?menuNo=1500033"],
  "동서의학대학원": ["http://gsm.khu.ac.kr/src/GS4010.php"],
  "미디어커뮤니케이션대학원": ["https://communication.khu.ac.kr/goods/goods.php"],
  "법학전문대학원": ["https://law.khu.ac.kr/06/01.php"],
  "법무대학원": ["https://law.khu.ac.kr/06/01.php"],
  "아트퓨전디자인대학원": ["http://afd.khu.ac.kr/02/01.php"],
  "의학전문대학원": ["https://khusm.khu.ac.kr/professor/reg_intro.php", "https://khusm.khu.ac.kr/professor/clinic_intro.php"],
  "체육대학원": [
    "http://gradsport.khu.ac.kr/02/01_01_02.php",
    "http://gradsport.khu.ac.kr/02/01_02_02.php",
    "http://gradsport.khu.ac.kr/02/01_03_02.php",
    "http://gradsport.khu.ac.kr/02/01_04_02.php",
    "http://gradsport.khu.ac.kr/02/01_05_02.php",
  ],
  "치의학전문대학원": [
    "https://dental.khu.ac.kr/dental_kor/user/bbs/BMSR00047/list.do?menuNo=16700025",
    "https://dental.khu.ac.kr/dental_kor/user/bbs/BMSR00047/list.do?menuNo=16700026",
  ],
  "테크노경영대학원": ["http://gstm.khu.ac.kr/sub/introduce_college/faculty/index.php?mid=ap"],
  "평화복지대학원": ["https://gip.khu.ac.kr/gip/user/bbs/BMSR00047/list.do?menuNo=3300022"],
};

const knownDepartmentUrls: Record<string, string[]> = {
  "일반대학원": [
    "https://gskh.khu.ac.kr/gskh_kor/user/contents/view.do?menuNo=13100086",
    "https://gskh.khu.ac.kr/gskh_kor/user/contents/view.do?menuNo=13100120",
  ],
  "공공대학원": ["https://pnc.khu.ac.kr/pnc/user/contents/view.do?menuNo=800072"],
  "관광대학원": ["https://tourism.khu.ac.kr/s1/s1_5.php"],
  "동서의학대학원": ["http://gsm.khu.ac.kr/src/ED1010.php"],
  "체육대학원": ["http://gradsport.khu.ac.kr/02/01_01_01.php"],
  "테크노경영대학원": ["http://gstm.khu.ac.kr/sub/master_course/global/introduce.php"],
};

function decode(input: string | undefined): string | undefined {
  return textFromHtml(input)?.replace(/^null\s+null$/i, "") || undefined;
}

function stripNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");
}

function htmlToTextWithBreaks(html: string): string {
  return stripNoise(html)
    .replace(/<\/(?:h[1-6]|p|div|li|tr|td|dl|dt|dd)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractHrefByText(html: string, baseUrl: string, pattern: RegExp): string | undefined {
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ href: resolveUrl(match[1], baseUrl), text: textFromHtml(match[2]) ?? "" }))
    .filter((link): link is { href: string; text: string } => Boolean(link.href));
  return links.find((link) => pattern.test(`${link.text} ${link.href}`))?.href;
}

function isExternalResearchUrl(url: string | undefined): boolean {
  if (!url) return false;
  return !/professor\.khu\.ac\.kr|khu\.elsevierpure\.com|scopus\.com|scival\.com|mail\.khu\.ac\.kr|apply\.khu\.ac\.kr|info21\.khu\.ac\.kr/i.test(url);
}

function isFormerProfessor(text: string): boolean {
  return /명예교수|고황명예|퇴직교수|emeritus/i.test(text);
}

function extractEmail(text: string): string | undefined {
  return cleanText(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0])?.toLowerCase();
}

function extractPhone(text: string): string | undefined {
  return cleanText(text.match(/(?:\+82[-\s]?)?0\d{1,2}[-.)\s]?\d{3,4}[-\s]?\d{4}/)?.[0]);
}

function labelValue(text: string, labels: string[]): string | undefined {
  const joined = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = text.match(new RegExp(`(?:${joined})\\s*[:：]?\\s*(.+?)(?=\\s+(?:영문명|소속|보\\s*직|전화|전\\s*화|TEL|E-mail|E-MAIL|이메일|연구실명|연구실|전공분야|전공|학력|직책)\\s*[:：]?|$)`, "i"));
  return cleanText(match?.[1]);
}

function cleanDepartmentName(input: string | undefined): string | undefined {
  return cleanText(
    input
      ?.replace(/\s*,\s*/g, " / ")
      .replace(/\s+보\s*직\b[\s\S]*$/i, "")
      .replace(/\s+(?:전화|전\s*화|TEL|E-mail|E-MAIL|이메일)\b[\s\S]*$/i, ""),
  );
}

function extractKoreanName(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, " ").trim();
  return cleanText(
    normalized.match(/^([가-힣]{2,5})\s*(?:교수|부교수|조교수|전임|원장|학과장)/)?.[1]
      ?? normalized.match(/([가-힣]{2,5})\s*(?:교수|부교수|조교수)/)?.[1],
  );
}

function cleanProfessorName(input: string | undefined): string | undefined {
  return cleanText(input?.replace(/\s+(?:겸직|겸임|학술연구|객원|초빙|특임|석좌|명예).*$/i, ""));
}

function extractTitle(text: string): string | undefined {
  return cleanText(text.match(/(고황명예교수|명예교수|부교수|조교수|교수|전임)/)?.[1]);
}

function extractKhusmProfessorName(text: string): string | undefined {
  return cleanText(
    text
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\s+/g, " ")
      .match(/^([가-힣]{2,5})(?:\s|$)/)?.[1],
  );
}

function centralProfileUrl(code: string): string {
  return `${professorViewUrl}?professorCode=${encodeURIComponent(code)}&menuNo=200015`;
}

function normalizeProfessorShortUrl(rawUrl: string | undefined): string | undefined {
  const cleaned = cleanText(rawUrl);
  if (!cleaned) {
    return undefined;
  }
  if (/^professor\.khu\.ac\.kr\//i.test(cleaned)) {
    return `https://${cleaned}`;
  }
  return resolveUrl(cleaned, "https://professor.khu.ac.kr/");
}

async function fetchText(url: string, init?: RequestInit): Promise<string | undefined> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...requestHeaders,
        ...(init?.headers ?? {}),
      },
      redirect: "follow",
    });
    if (!response.ok) {
      return undefined;
    }
    return await response.text();
  } catch {
    return undefined;
  }
}

async function discoverGraduateSchoolsFromTarget(context: BrowserContext, sourceUrl: string): Promise<KhuGraduateSchoolSeed[]> {
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  try {
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 7_000 }).catch(() => undefined);
    const rows = await page.evaluate(() => {
      const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
      return [...document.querySelectorAll("a[href]")]
        .filter((anchor) => clean(anchor.textContent).toUpperCase() === "GO")
        .map((anchor) => {
          const parentText = clean(anchor.closest("li, tr, div, p")?.textContent);
          const label = parentText.replace(/\bGO\b.*$/i, "").trim();
          return {
            name: label,
            homepageUrl: (anchor as HTMLAnchorElement).href,
          };
        })
        .filter((row) => row.name && row.homepageUrl);
    });

    return uniqueBy(
      rows.map((row) => ({
        name: row.name,
        homepageUrl: row.homepageUrl,
        sourceUrl,
        professorSearchCode: professorSearchCodes[row.name],
        facultyUrls: knownFacultyUrls[row.name] ?? [],
        departmentUrls: knownDepartmentUrls[row.name] ?? [],
      })),
      (row) => row.name,
    );
  } finally {
    await page.close();
  }
}

function parseCentralListItems(html: string): Array<{ code: string; nameKo?: string; nameEn?: string; title?: string; email?: string; departmentName?: string; phone?: string }> {
  type CentralListItem = { code: string; nameKo?: string; nameEn?: string; title?: string; email?: string; departmentName?: string; phone?: string };
  const output: CentralListItem[] = [];
  for (const chunk of html.split(/<li class="item">/i).slice(1)) {
    const block = chunk.split(/<li class="item">/i)[0] ?? chunk;
    const code = block.match(/javascript:view\('([^']+)'\)/)?.[1];
    const text = htmlToTextWithBreaks(block).replace(/\n+/g, " ");
    if (!code || isFormerProfessor(text)) {
      continue;
    }
    output.push({
      code,
      nameKo: decode(block.match(/<p class="name">\s*<strong>([\s\S]*?)<\/strong>/i)?.[1]),
      title: decode(block.match(/<p class="name">[\s\S]*?<\/strong>\s*([^<]+)<\/p>/i)?.[1]),
      nameEn: labelValue(text, ["영 문 명"]),
      departmentName: cleanDepartmentName(labelValue(text, ["소 속"])),
      phone: labelValue(text, ["전 화 번 호"]),
      email: extractEmail(text),
    });
  }
  return output;
}

function parseCentralDetail(html: string, profileUrl: string) {
  const text = htmlToTextWithBreaks(html).replace(/\n+/g, " ");
  const homeUrl = extractHrefByText(html, profileUrl, /^Home\b/i);
  const scopusUrl = extractHrefByText(html, profileUrl, /scopus/i);
  const pureUrl = extractHrefByText(html, profileUrl, /^Pure\b/i);
  const scholarUrl = extractHrefByText(html, profileUrl, /scholar\.google/i);
  const dblpUrl = extractHrefByText(html, profileUrl, /dblp\.org/i);
  const researchMatch = html.match(/<h3[^>]*>\s*연구분야\s*<\/h3>[\s\S]*?<div class="view-det">([\s\S]*?)<\/div>/i);
  const researchText = textFromHtml(researchMatch?.[1]);
  const shortProfile = html.match(/copyUrl\('([^']+)'\)/)?.[1];
  const resolvedShortProfile = normalizeProfessorShortUrl(shortProfile);
  return {
    profileUrl: resolvedShortProfile ?? profileUrl,
    labUrl: isExternalResearchUrl(homeUrl) ? homeUrl : undefined,
    scopusUrl,
    pureUrl,
    scholarUrl,
    dblpUrl,
    researchText,
    text,
  };
}

async function discoverCentralProfessors(school: KhuGraduateSchoolSeed): Promise<KhuFacultyCandidate[]> {
  if (!school.professorSearchCode) {
    return [];
  }
  const output: KhuFacultyCandidate[] = [];
  const seenCodes = new Set<string>();

  for (let pageIndex = 1; pageIndex <= 20; pageIndex += 1) {
    const params = new URLSearchParams({
      menuNo: "200015",
      pageIndex: String(pageIndex),
      searchTab: "",
      searchUniv: school.professorSearchCode,
      searchDept: "",
      searchMj: "",
      searchjbfmNm: "전임교원",
      searchCondition: "1",
      searchKeyword: "",
    });
    const html = await fetchText(professorListUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params,
    });
    if (!html) {
      break;
    }
    const rows = parseCentralListItems(html).filter((row) => !seenCodes.has(row.code));
    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      seenCodes.add(row.code);
      const rawProfileUrl = centralProfileUrl(row.code);
      const detailHtml = await fetchText(rawProfileUrl);
      const detail = detailHtml ? parseCentralDetail(detailHtml, rawProfileUrl) : undefined;
      const labUrl = detail?.labUrl ?? detail?.profileUrl ?? rawProfileUrl;
      const labUrlKind = detail?.labUrl ? "external_home" : "fallback_profile";
      const researchText = cleanText([detail?.researchText, row.departmentName].filter(Boolean).join(" | "));
      const warnings = labUrlKind === "fallback_profile" ? ["연구실 홈페이지 없음, fallback 사용"] : [];
      output.push({
        graduateSchoolName: school.name,
        departmentName: row.departmentName,
        nameKo: row.nameKo,
        nameEn: row.nameEn,
        title: row.title,
        email: row.email,
        phone: row.phone,
        profileUrl: detail?.profileUrl ?? rawProfileUrl,
        labUrl,
        labUrlKind,
        sourceUrl: detail?.profileUrl ?? rawProfileUrl,
        sourceParser: "khu_professor_central",
        researchText,
        classification: classifyResearchText(researchText ?? ""),
        scopusUrl: detail?.scopusUrl,
        pureUrl: detail?.pureUrl,
        scholarUrl: detail?.scholarUrl,
        dblpUrl: detail?.dblpUrl,
        warnings,
      });
    }
  }

  return output;
}

async function extractFacultyCards(context: BrowserContext, url: string, school: KhuGraduateSchoolSeed): Promise<KhuFacultyCandidate[]> {
  const page = await context.newPage();
  page.setDefaultTimeout(18_000);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    const rows = await page.evaluate(() => {
      const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
      const selectors = [
        "li.item",
        ".professor-wrap",
        ".bbs-professor li",
        ".prof_list li",
        ".member_list li",
        ".professor_list li",
        ".staff_list li",
        "td",
        "tr",
      ];
      const nodes = [...document.querySelectorAll(selectors.join(","))];
      return nodes
        .map((node) => {
          const text = clean((node as HTMLElement).innerText);
          if (!/@/.test(text) || !/(교수|Professor|전임|전공|연구실|E-mail|E-MAIL|이메일|TEL)/i.test(text) || text.length > 1800) {
            return undefined;
          }
          const firstStrong = clean(node.querySelector("h3, .name strong, strong.t, p.tit, .tit, .name")?.textContent);
          const links = [...node.querySelectorAll("a[href]")].map((anchor) => ({
            href: (anchor as HTMLAnchorElement).href,
            text: clean(anchor.textContent),
          }));
          return { text, firstStrong, links };
        })
        .filter(Boolean);
    });

    const candidates = rows.map((row: any): KhuFacultyCandidate | undefined => {
        const nameKo = cleanProfessorName(row.firstStrong?.replace(/\s*(교수|부교수|조교수|전임).*$/, "")) ?? extractKoreanName(row.text);
        if (!nameKo || isFormerProfessor(row.text)) {
          return undefined;
        }
        const email = extractEmail(row.text);
        const profileUrl = (row.links as Array<{ href: string; text: string }>).find((link) =>
          link.href !== url && !/^javascript:/i.test(link.href) && !/mailto:|tel:|#$/i.test(link.href),
        )?.href;
        const externalLink = (row.links as Array<{ href: string; text: string }>).find((link) =>
          isExternalResearchUrl(link.href) && /home|homepage|website|lab|laboratory|연구실|research/i.test(`${link.text} ${link.href}`),
        )?.href;
        const labName = labelValue(row.text, ["연구실명", "연구실"]);
        const researchText = cleanText([
          labelValue(row.text, ["연구분야", "전공분야", "전공"]),
          labName && !/^\d/.test(labName) ? labName : undefined,
        ].filter(Boolean).join(" | "));
        const labUrl = externalLink ?? profileUrl ?? url;
        const labUrlKind = externalLink
          ? (/lab|laboratory|연구실/i.test(`${externalLink} ${labName ?? ""}`) ? "external_lab" : "external_home")
          : profileUrl
            ? "fallback_profile"
            : "fallback_faculty_page";
        return {
          graduateSchoolName: school.name,
          departmentName: school.name,
          nameKo,
          title: extractTitle(row.text),
          email,
          phone: extractPhone(row.text),
          profileUrl,
          labName,
          labUrl,
          labUrlKind,
          sourceUrl: profileUrl ?? url,
          sourceParser: "khu_official_faculty_page",
          researchText,
          classification: classifyResearchText(researchText ?? ""),
          warnings: labUrlKind.startsWith("fallback") ? ["연구실 홈페이지 없음, fallback 사용"] : [],
        } satisfies KhuFacultyCandidate;
      }).filter((row): row is KhuFacultyCandidate => Boolean(row));

    return uniqueBy(
      candidates,
      (row) => row.email ?? `${row.graduateSchoolName}|${row.nameKo}|${row.sourceUrl}`,
    );
  } finally {
    await page.close();
  }
}

async function discoverKhusmDepartmentBoardUrls(context: BrowserContext, indexUrl: string): Promise<string[]> {
  const page = await context.newPage();
  page.setDefaultTimeout(18_000);
  try {
    await page.goto(indexUrl, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    const urls = await page.evaluate(() => {
      return [...document.querySelectorAll("a[href]")]
        .map((anchor) => (anchor as HTMLAnchorElement).href)
        .filter((href) => /\/bbs\/board\.php\?bo_table=s2_1_[12]&sca=/i.test(href));
    });
    return [...new Set(urls)];
  } finally {
    await page.close();
  }
}

async function extractKhusmFacultyBoard(context: BrowserContext, url: string, school: KhuGraduateSchoolSeed): Promise<KhuFacultyCandidate[]> {
  const page = await context.newPage();
  page.setDefaultTimeout(18_000);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    const rows = await page.evaluate(() => {
      const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
      const params = new URL(window.location.href).searchParams;
      const departmentName = params.get("sca") ?? "";
      const bodyText = clean(document.body.innerText);
      const intro = clean(bodyText.match(/교실 소개\s+(.+?)\s+교수진 소개/s)?.[1]);
      return [...document.querySelectorAll("table tr")]
        .map((row) => {
          const cells = [...row.querySelectorAll("th,td")].map((cell) => clean((cell as HTMLElement).innerText));
          const rowText = cells.join(" ");
          const email = rowText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
          if (!email || cells.length < 3 || /행정실|의학교육실|E-mail/i.test(cells[0] ?? "")) {
            return undefined;
          }
          return {
            departmentName,
            intro,
            nameText: cells[0],
            phone: cells.find((cell) => /(?:\+82[-\s]?)?0\d{1,2}[-.)\s]?\d{3,4}[-\s]?\d{4}/.test(cell)),
            email,
            rowText,
          };
        })
        .filter(Boolean);
    });

    const candidates = rows.map((row: any): KhuFacultyCandidate | undefined => {
      const nameKo = extractKhusmProfessorName(row.nameText);
      if (!nameKo || isFormerProfessor(row.rowText)) {
        return undefined;
      }
      const departmentName = cleanText(row.departmentName);
      const researchText = cleanText([departmentName, row.intro].filter(Boolean).join(" | "));
      return {
        graduateSchoolName: school.name,
        departmentName,
        nameKo,
        email: extractEmail(row.email),
        phone: row.phone ? extractPhone(row.phone) : undefined,
        labName: departmentName,
        labUrl: url,
        labUrlKind: "fallback_faculty_page",
        sourceUrl: url,
        sourceParser: "khu_khusm_department_board",
        researchText,
        classification: classifyResearchText(researchText ?? ""),
        warnings: ["연구실 홈페이지 없음, fallback 사용"],
      } satisfies KhuFacultyCandidate;
    }).filter((row): row is KhuFacultyCandidate => Boolean(row));

    return uniqueBy(
      candidates,
      (row) => row.email ?? `${row.graduateSchoolName}|${row.departmentName}|${row.nameKo}`,
    );
  } finally {
    await page.close();
  }
}

function mergeCandidate(existing: KhuFacultyCandidate, next: KhuFacultyCandidate): KhuFacultyCandidate {
  const preferredLab = !existing.labUrlKind.startsWith("fallback") ? existing : next;
  const mergedResearch = cleanText([existing.researchText, next.researchText].filter(Boolean).join(" | "));
  const mergedDepartmentName = cleanText(
    [...new Set(
      [existing.departmentName, next.departmentName]
        .filter((value): value is string => Boolean(value))
        .flatMap((value) => value.split(/\s+\/\s+/))
        .map((value) => value.trim())
        .filter(Boolean),
    )].join(" / "),
  );
  return {
    ...existing,
    departmentName: mergedDepartmentName ?? existing.departmentName ?? next.departmentName,
    nameEn: existing.nameEn ?? next.nameEn,
    title: existing.title ?? next.title,
    phone: existing.phone ?? next.phone,
    profileUrl: existing.profileUrl ?? next.profileUrl,
    labName: existing.labName ?? next.labName,
    labUrl: preferredLab.labUrl ?? existing.labUrl ?? next.labUrl,
    labUrlKind: preferredLab.labUrlKind ?? existing.labUrlKind,
    sourceUrl: existing.sourceParser === "khu_professor_central" ? existing.sourceUrl : next.sourceUrl,
    researchText: mergedResearch,
    classification: classifyResearchText(mergedResearch ?? ""),
    dblpUrl: existing.dblpUrl ?? next.dblpUrl,
    scholarUrl: existing.scholarUrl ?? next.scholarUrl,
    scopusUrl: existing.scopusUrl ?? next.scopusUrl,
    pureUrl: existing.pureUrl ?? next.pureUrl,
    warnings: [...new Set([...existing.warnings, ...next.warnings])].filter((warning) =>
      preferredLab.labUrlKind.startsWith("fallback") || warning !== "연구실 홈페이지 없음, fallback 사용",
    ),
  };
}

function mergeCandidates(candidates: KhuFacultyCandidate[]): KhuFacultyCandidate[] {
  const byKey = new Map<string, KhuFacultyCandidate>();
  for (const candidate of candidates) {
    const key = candidate.email ?? `${candidate.graduateSchoolName}|${candidate.nameKo ?? ""}|${candidate.nameEn ?? ""}`;
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeCandidate(existing, candidate) : candidate);
  }
  return [...byKey.values()].sort((a, b) =>
    a.graduateSchoolName.localeCompare(b.graduateSchoolName, "ko") || (a.nameKo ?? "").localeCompare(b.nameKo ?? "", "ko"),
  );
}

async function scanExternalProfileLinks(candidate: KhuFacultyCandidate): Promise<KhuFacultyCandidate> {
  if (!candidate.labUrl || candidate.labUrlKind.startsWith("fallback")) {
    return candidate;
  }
  const html = await fetchText(candidate.labUrl);
  if (!html) {
    return { ...candidate, warnings: [...new Set([...candidate.warnings, "external_lab_url_fetch_failed"])] };
  }
  return {
    ...candidate,
    dblpUrl: candidate.dblpUrl ?? extractHrefByText(html, candidate.labUrl, /dblp\.org/i),
    scholarUrl: candidate.scholarUrl ?? extractHrefByText(html, candidate.labUrl, /scholar\.google/i),
  };
}

async function mapLimit<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const output: R[] = [];
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(items[index] as T, index);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, run));
  return output;
}

async function enrichCandidate(candidate: KhuFacultyCandidate): Promise<KhuFacultyCandidate> {
  const withLinks = await scanExternalProfileLinks(candidate);
  if (!withLinks.labUrl || withLinks.labUrlKind.startsWith("fallback")) {
    return withLinks;
  }

  const memberResult = await enrichLabMemberCount(withLinks.labUrl);
  const sameHostMemberSource = (() => {
    if (!memberResult.sourceUrl) {
      return false;
    }
    try {
      return new URL(memberResult.sourceUrl).hostname === new URL(withLinks.labUrl as string).hostname;
    } catch {
      return false;
    }
  })();
  if (!memberResult.count) {
    return {
      ...withLinks,
      warnings: [...new Set([...withLinks.warnings, "연구원수 확인 불가"])],
    };
  }
  if (!sameHostMemberSource) {
    return {
      ...withLinks,
      warnings: [...new Set([...withLinks.warnings, "연구원수 출처 host 불일치로 제외", "연구원수 확인 불가"])],
    };
  }

  return {
    ...withLinks,
    currentMemberCount: memberResult.count,
    memberCountBreakdown: memberResult.breakdown,
    memberCountSourceUrl: memberResult.sourceUrl,
    memberCountCrawledAt: new Date().toISOString(),
    memberCountMethod: memberResult.method,
  };
}

function buildSummary(schools: KhuGraduateSchoolSeed[], candidates: KhuFacultyCandidate[]): KhuGraduateDiscoveryReport["summary"] {
  const countsByGraduateSchool: Record<string, number> = {};
  const taxonomyMatchCounts: Record<string, number> = {};
  const departments = new Set<string>();
  let suggestionCount = 0;

  for (const candidate of candidates) {
    countsByGraduateSchool[candidate.graduateSchoolName] = (countsByGraduateSchool[candidate.graduateSchoolName] ?? 0) + 1;
    if (candidate.departmentName) {
      departments.add(candidate.departmentName);
    }
    suggestionCount += candidate.classification.suggestions.length;
    for (const match of candidate.classification.matches) {
      taxonomyMatchCounts[match.labelKo] = (taxonomyMatchCounts[match.labelKo] ?? 0) + 1;
    }
  }

  return {
    graduateSchoolCount: schools.length,
    departmentCount: departments.size,
    professorCount: candidates.length,
    labUrlCount: candidates.filter((candidate) => candidate.labUrl && !candidate.labUrlKind.startsWith("fallback")).length,
    labUrlFallbackCount: candidates.filter((candidate) => candidate.labUrlKind.startsWith("fallback")).length,
    memberCountKnown: candidates.filter((candidate) => typeof candidate.currentMemberCount === "number").length,
    memberCountUnknown: candidates.filter((candidate) => typeof candidate.currentMemberCount !== "number").length,
    dblpUrlCount: candidates.filter((candidate) => candidate.dblpUrl).length,
    scholarUrlCount: candidates.filter((candidate) => candidate.scholarUrl).length,
    taxonomyClassifiedCount: candidates.filter((candidate) => candidate.classification.matches.length > 0).length,
    taxonomyUnclassifiedCount: candidates.filter((candidate) => candidate.classification.matches.length === 0).length,
    countsByGraduateSchool,
    taxonomyMatchCounts: Object.fromEntries(Object.entries(taxonomyMatchCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    suggestionCount,
  };
}

export async function discoverKhuGraduateSeeds(
  context: BrowserContext,
  options?: {
    sourceUrl?: string;
    maxSchools?: number;
    maxFacultyPages?: number;
    enrichMembers?: boolean;
    enrichConcurrency?: number;
  },
): Promise<KhuGraduateDiscoveryReport> {
  const sourceUrl = options?.sourceUrl ?? defaultSourceUrl;
  const schools = (await discoverGraduateSchoolsFromTarget(context, sourceUrl)).slice(0, options?.maxSchools ?? Number.POSITIVE_INFINITY);
  const skippedPages: KhuGraduateDiscoveryReport["skippedPages"] = [];
  const candidates: KhuFacultyCandidate[] = [];

  for (const school of schools) {
    candidates.push(...await discoverCentralProfessors(school));
    for (const facultyUrl of school.facultyUrls.slice(0, options?.maxFacultyPages ?? Number.POSITIVE_INFINITY)) {
      if (facultyUrl.includes("professor.khu.ac.kr")) {
        continue;
      }
      try {
        if (/khusm\.khu\.ac\.kr\/professor\/(?:reg|clinic)_intro\.php/i.test(facultyUrl)) {
          const departmentBoardUrls = await discoverKhusmDepartmentBoardUrls(context, facultyUrl);
          for (const boardUrl of departmentBoardUrls) {
            try {
              candidates.push(...await extractKhusmFacultyBoard(context, boardUrl, school));
            } catch (error) {
              skippedPages.push({ url: boardUrl, reason: error instanceof Error ? error.message : String(error) });
            }
          }
          continue;
        }
        if (/khusm\.khu\.ac\.kr\/bbs\/board\.php\?bo_table=s2_1_[12]/i.test(facultyUrl)) {
          candidates.push(...await extractKhusmFacultyBoard(context, facultyUrl, school));
          continue;
        }
        candidates.push(...await extractFacultyCards(context, facultyUrl, school));
      } catch (error) {
        skippedPages.push({ url: facultyUrl, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  let facultyCandidates = mergeCandidates(candidates);
  if (options?.enrichMembers ?? true) {
    facultyCandidates = await mapLimit(facultyCandidates, options?.enrichConcurrency ?? 3, enrichCandidate);
  }

  return {
    sourceUrl,
    generatedAt: new Date().toISOString(),
    schools,
    facultyCandidates,
    skippedPages,
    summary: buildSummary(schools, facultyCandidates),
  };
}

export async function verifyKhuSamples(
  context: BrowserContext,
  candidates: KhuFacultyCandidate[],
  limit = 12,
): Promise<KhuSampleVerification[]> {
  const selected = candidates
    .filter((candidate) => candidate.labUrl)
    .sort((a, b) => Number(a.labUrlKind.startsWith("fallback")) - Number(b.labUrlKind.startsWith("fallback")))
    .slice(0, limit);
  const output: KhuSampleVerification[] = [];

  for (const candidate of selected) {
    const page = await context.newPage();
    try {
      const response = await page.goto(candidate.labUrl as string, { waitUntil: "domcontentloaded", timeout: 18_000 });
      await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined);
      const title = cleanText(await page.title().catch(() => ""));
      const text = cleanText(await page.locator("body").innerText({ timeout: 3_000 }).catch(() => ""));
      const hasName = candidate.nameKo ? text?.includes(candidate.nameKo) : false;
      const hasResearch = candidate.researchText
        ? candidate.researchText.split(/[|,]/).some((part) => part.trim().length >= 3 && text?.includes(part.trim()))
        : false;
      output.push({
        name: candidate.nameKo,
        graduateSchoolName: candidate.graduateSchoolName,
        checkedUrl: page.url(),
        status: response?.ok() && (hasName || hasResearch || !candidate.labUrlKind.startsWith("fallback")) ? "ok" : "needs_review",
        title,
        evidence: [
          `http=${response?.status() ?? "unknown"}`,
          candidate.labUrlKind,
          hasName ? "name_found" : "name_not_found",
          hasResearch ? "research_text_found" : "research_text_not_found",
          typeof candidate.currentMemberCount === "number" ? `member_count=${candidate.currentMemberCount}` : "member_count_unknown",
        ].join("; "),
      });
    } catch (error) {
      output.push({
        name: candidate.nameKo,
        graduateSchoolName: candidate.graduateSchoolName,
        checkedUrl: candidate.labUrl,
        status: "failed",
        evidence: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await page.close();
    }
  }

  return output;
}
