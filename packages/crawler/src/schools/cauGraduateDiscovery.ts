import type { BrowserContext } from "playwright";
import { classifyResearchText, type ResearchClassification } from "../taxonomy/researchTaxonomy.js";

export type CauDepartment = {
  name: string;
  collegeName?: string;
  homepageUrl?: string;
  facultyUrl?: string;
  sourceUrl: string;
};

export type CauLabCandidate = {
  universityName: "중앙대학교";
  departmentName: string;
  professorName?: string;
  professorTitle?: string;
  email?: string;
  labName?: string;
  labUrl?: string;
  profileUrl?: string;
  researchText?: string;
  sourceUrl: string;
  sourceParser: string;
  classification: ResearchClassification;
  currentMemberCount?: number;
  memberCountBreakdown?: Record<string, number>;
  memberCountSourceUrl?: string;
  memberCountCrawledAt?: string;
  scholarUrl?: string;
  dblpUrl?: string;
  paperCount?: number;
  paperCountSourceUrl?: string;
  validationWarnings?: string[];
};

export type CauDiscoveryReport = {
  sourceUrls: string[];
  generatedAt: string;
  departments: CauDepartment[];
  facultyCandidates: CauLabCandidate[];
  discovery: {
    departmentDirectory: {
      sourceUrl: string;
      departmentCount: number;
      facultyUrlCount: number;
      notes: string[];
    };
    targetPages: Array<{
      id: string;
      sourceUrl: string;
      pageKind: string;
      professorListUrls: string[];
      labUrlPattern: string;
      memberPagePattern: string;
      publicationPattern: string;
      structureNotes: string[];
    }>;
    adapterDesign: string[];
  };
  summary: {
    departmentCount: number;
    facultyCandidateCount: number;
    labUrlCount: number;
    fallbackUrlCount: number;
    memberCountKnown: number;
    scholarUrlCount: number;
    dblpUrlCount: number;
    taxonomyMatchCounts: Record<string, number>;
    warningCounts: Record<string, number>;
  };
};

type DiscoverOptions = {
  enrichMemberCounts?: boolean;
  maxLabHomepages?: number;
  enrichConcurrency?: number;
};

type PageSnapshot = {
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  links: Array<{ text: string; href: string; className?: string }>;
  memberBlocks: Array<{ text: string; categoryHint: string; isAlumniSection: boolean }>;
};

const sourceUrls = [
  "http://graduate.cau.ac.kr/graduate/department/department.do",
  "https://cse.cau.ac.kr/sub03/sub0302.php",
  "https://me.cau.ac.kr/bbs/content.php?co_id=sub4_2",
  "https://aigs.cau.ac.kr/sub04/sub0402.php",
  "https://e3home.cau.ac.kr/dm/dm_3.php",
];

const pageTimeoutMs = 25_000;
const externalPageTimeoutMs = 15_000;
const alumniPattern = /alumni|former|past members?|graduates?|graduated|졸업|졸업생|동문|OB|Alumn/i;
const memberLinkPattern = /members?|people|team|students?|personnel|구성원|멤버|연구원|학생|팀/i;
const publicationPattern = /publications?|papers?|research|논문|연구성과|dblp|scholar/i;
const cseLabProfessorOverrides: Record<string, string> = {
  "컴퓨터 네트워크 연구실": "박창윤",
  "패턴인식 및 휴먼 인터페이스 연구실": "박재화",
  "초지능 컴퓨팅 및 통신 네트워크 연구실": "조성래",
  "실시간 소프트웨어공학 연구실": "이찬근",
  "비주얼라이제이션 연구실": "이창하",
  "가상현실 연구실": "손봉수",
  "지식공학 연구실": "정재은",
  "네트워크 시스템 연구실": "백정엽",
  "컴퓨터 시스템 연구실": "박상오",
  "데이터지능 연구실": "김무철",
  "암호 연구실": "이형태",
  "고성능 컴퓨팅 연구실": "김진성",
  "인간-컴퓨터 상호작용 연구실": "박은지",
  "인간-인공지능 상호작용 연구실": "문희승",
};

function cleanText(input: string | undefined): string | undefined {
  const value = input?.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return value || undefined;
}

function normalizeName(input: string | undefined): string | undefined {
  const value = cleanText(input?.replace(/\s*(?:교수님|교수|부교수|조교수|명예교수)\s*$/g, ""));
  return value || undefined;
}

function resolveUrl(rawUrl: string | undefined, baseUrl: string): string | undefined {
  if (!rawUrl || rawUrl.startsWith("mailto:") || rawUrl.startsWith("tel:") || rawUrl.startsWith("javascript:")) {
    return undefined;
  }
  try {
    const url = new URL(rawUrl, baseUrl);
    if (url.hash && !url.pathname.replace(/\/$/, "")) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string | undefined): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

function addWarning(candidate: CauLabCandidate, warning: string): CauLabCandidate {
  return { ...candidate, validationWarnings: [...new Set([...(candidate.validationWarnings ?? []), warning])] };
}

function buildCandidate(input: Omit<CauLabCandidate, "universityName" | "classification">): CauLabCandidate {
  const researchText = cleanText(input.researchText);
  return {
    universityName: "중앙대학교",
    ...input,
    professorName: normalizeName(input.professorName),
    labName: cleanText(input.labName),
    researchText,
    classification: classifyResearchText([input.labName, researchText].filter(Boolean).join(" ")),
  };
}

async function getSnapshot(context: BrowserContext, url: string, timeoutMs = pageTimeoutMs): Promise<PageSnapshot> {
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  page.setDefaultNavigationTimeout(timeoutMs);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    return await page.evaluate(() => {
      const clean = (input: string | null | undefined) => (input ?? "").replace(/\s+/g, " ").trim();
      const cleanBody = (input: string | null | undefined) => (input ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      const alumniRegex = /alumni|former|past members?|graduates?|graduated|졸업|졸업생|동문|OB|Alumn/i;
      const memberRoleRegex = /ph\.?d|doctoral|master|m\.?s\.?|undergraduate|intern|postdoc|visiting|researcher|student|박사|석사|학부|인턴|연구원|학생|과정/i;
      const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
      const links = [...document.querySelectorAll("a[href]")]
        .map((node) => ({
          text: clean(node.textContent),
          href: (node as HTMLAnchorElement).href || node.getAttribute("href") || "",
          className: node.className?.toString() || undefined,
        }))
        .filter((link) => link.href.length > 0);
      const memberBlocks = [...document.querySelectorAll("li,tr,article,section,div")]
        .map((node) => {
          const element = node as HTMLElement;
          const text = clean(element.innerText);
          const categoryHint = clean(`${element.id} ${element.className?.toString()}`);
          const parentHint = clean(`${element.parentElement?.id ?? ""} ${element.parentElement?.className?.toString() ?? ""}`);
          return {
            text,
            categoryHint: `${categoryHint} ${parentHint}`.trim(),
            isAlumniSection: alumniRegex.test(`${text} ${categoryHint} ${parentHint}`),
          };
        })
        .filter((block) => block.text.length >= 2 && block.text.length <= 1_200)
        .filter((block) =>
          /member|people|person|student|team|profile|member/i.test(block.categoryHint)
          || memberRoleRegex.test(block.text)
          || emailRegex.test(block.text),
        )
        .slice(0, 500);
      return {
        url: location.href,
        finalUrl: location.href,
        title: document.title,
        text: cleanBody(document.body?.innerText).slice(0, 120_000),
        links,
        memberBlocks,
      };
    });
  } finally {
    await page.close();
  }
}

async function extractGraduateDepartments(context: BrowserContext): Promise<CauDepartment[]> {
  const sourceUrl = sourceUrls[0]!;
  const page = await context.newPage();
  try {
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: pageTimeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    const rows = await page.evaluate(() => {
      const clean = (input: string | null | undefined) => (input ?? "").replace(/\s+/g, " ").trim();
      const departmentRows: Array<{ text: string; href: string }> = [];
      for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href*="/graduate/department/"]')) {
        const text = clean(anchor.textContent);
        const href = anchor.href;
        if (!text || ["학과소개", "교수진"].includes(text)) {
          continue;
        }
        if (!/\/graduate\/department\/[^/]+\/[^/]+\.do$/i.test(href)) {
          continue;
        }
        departmentRows.push({ text, href });
      }
      return departmentRows;
    });
    const departments = uniqueBy(rows, (row) => row.href).map((row) => {
      const facultyUrl = row.href.replace(/\/[^/]+\.do(?:[?#].*)?$/i, "/faculty.do");
      return {
        name: row.text,
        homepageUrl: row.href,
        facultyUrl,
        sourceUrl,
      };
    });
    return uniqueBy(departments, (department) => department.name);
  } finally {
    await page.close();
  }
}

async function extractCseLabs(context: BrowserContext): Promise<CauLabCandidate[]> {
  const labUrl = sourceUrls[1]!;
  const facultyUrl = "https://cse.cau.ac.kr/sub01/sub0104.php";
  const [labs, professors] = await Promise.all([extractCseLabRows(context, labUrl), extractCseProfessors(context, facultyUrl)]);
  const professorsByUrl = new Map(professors.filter((item) => item.profileUrl).map((item) => [normalizeComparableUrl(item.profileUrl!), item]));
  const professorsByName = new Map(professors.map((item) => [item.professorName, item]));
  return labs.map((lab) => {
    const labNameKo = lab.labName?.split("/")[0]?.trim() ?? "";
    const overrideName = cseLabProfessorOverrides[labNameKo];
    const professor = (lab.labUrl ? professorsByUrl.get(normalizeComparableUrl(lab.labUrl)) : undefined)
      ?? (overrideName ? professorsByName.get(overrideName) : undefined);
    const merged = buildCandidate({
      departmentName: "소프트웨어학부",
      professorName: professor?.professorName,
      professorTitle: professor?.professorTitle,
      email: professor?.email,
      labName: lab.labName,
      labUrl: lab.labUrl,
      profileUrl: professor?.profileUrl,
      researchText: lab.researchText ?? professor?.researchText,
      sourceUrl: labUrl,
      sourceParser: "cau-cse-lab-page",
    });
    return professor ? merged : addWarning(merged, "professor_not_matched_from_faculty_page");
  });
}

async function extractCseLabRows(context: BrowserContext, sourceUrl: string) {
  const page = await context.newPage();
  try {
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: pageTimeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    return await page.evaluate(() => {
      const clean = (input: string | null | undefined) => (input ?? "").replace(/\s+/g, " ").trim();
      return [...document.querySelectorAll(".boxes .box")]
        .map((box) => {
          const heading = box.querySelector("h3");
          const labNameKo = clean([...heading?.childNodes ?? []].find((node) => node.nodeType === Node.TEXT_NODE)?.textContent);
          const labNameEn = clean(heading?.querySelector("span")?.textContent);
          const homepage = [...box.querySelectorAll<HTMLAnchorElement>("a[href]")]
            .map((anchor) => anchor.href)
            .find((href) => !href.startsWith("javascript:"));
          const paragraph = clean(box.querySelector("p")?.textContent);
          return {
            labName: [labNameKo, labNameEn].filter(Boolean).join(" / "),
            labUrl: homepage,
            researchText: paragraph.replace(/\s*Tel\s*:.*/i, "").replace(/\s*Office\s*:.*/i, ""),
          };
        })
        .filter((row) => row.labName);
    });
  } finally {
    await page.close();
  }
}

async function extractCseProfessors(context: BrowserContext, sourceUrl: string) {
  const page = await context.newPage();
  try {
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: pageTimeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    return await page.evaluate(() => {
      const clean = (input: string | null | undefined) => (input ?? "").replace(/\s+/g, " ").trim();
      return [...document.querySelectorAll(".profiles .profile")]
        .map((profile) => {
          const heading = profile.querySelector("h4");
          const professorTitle = clean(heading?.querySelector("span")?.textContent);
          const professorName = clean([...heading?.childNodes ?? []].find((node) => node.nodeType === Node.TEXT_NODE)?.textContent);
          const profileUrl = profile.querySelector<HTMLAnchorElement>("a.more[href]")?.href;
          const email = profile.querySelector<HTMLAnchorElement>('a[href^="mailto:"]')?.href.replace(/^mailto:/, "");
          const majorRow = [...profile.querySelectorAll("li")].find((li) => /전공/.test(li.textContent ?? ""));
          return {
            professorName,
            professorTitle,
            email,
            researchText: clean(majorRow?.querySelector("span")?.textContent),
            profileUrl,
          };
        })
        .filter((row) => row.professorName);
    });
  } finally {
    await page.close();
  }
}

function normalizeComparableUrl(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, "")
    .replace(/\/(?:index\.html?)?$/i, "")
    .replace(/\/home$/i, "")
    .toLowerCase();
}

async function extractMechanicalLabs(context: BrowserContext): Promise<CauLabCandidate[]> {
  const sourceUrl = sourceUrls[2]!;
  const page = await context.newPage();
  try {
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: pageTimeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    const rows = await page.evaluate(() => {
      const clean = (input: string | null | undefined) => (input ?? "").replace(/\s+/g, " ").trim();
      return [...document.querySelectorAll("tr")]
        .map((tr) => {
          const cells = [...tr.querySelectorAll("td")].map((td) => clean(td.innerText));
          const link = tr.querySelector<HTMLAnchorElement>('a[href^="http"]')?.href;
          return { cells, link, text: clean(tr.innerText) };
        })
        .filter((row) => row.cells.length >= 3 && !/지도교수/.test(row.text));
    });
    return rows.map((row) => {
      const professorName = normalizeName(row.cells[0]?.replace(/\s*\(명예교수\)/, ""));
      const professorTitle = row.cells[0]?.includes("명예교수") ? "명예교수" : "교수";
      const candidate = buildCandidate({
        departmentName: "기계공학부",
        professorName,
        professorTitle,
        labName: row.cells[1],
        labUrl: resolveUrl(row.link, sourceUrl) ?? sourceUrl,
        researchText: row.cells[2],
        sourceUrl,
        sourceParser: "cau-me-lab-table",
      });
      return row.link ? candidate : addWarning(candidate, "연구실 홈페이지 없음, fallback 사용");
    });
  } finally {
    await page.close();
  }
}

async function extractAigsLabs(context: BrowserContext): Promise<CauLabCandidate[]> {
  const emptyLabPageUrl = sourceUrls[3]!;
  const sourceUrl = "https://aigs.cau.ac.kr/sub02/sub0201.php";
  const page = await context.newPage();
  try {
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: pageTimeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    const rows = await page.evaluate(() => {
      const clean = (input: string | null | undefined) => (input ?? "").replace(/\s+/g, " ").trim();
      return [...document.querySelectorAll(".proListFlex dl")]
        .map((dl) => {
          const name = clean(dl.querySelector(".name-eng")?.textContent);
          const from = clean(dl.querySelector(".from")?.textContent);
          const labAnchor = dl.querySelector<HTMLAnchorElement>("li.lab a[href]");
          const email = dl.querySelector<HTMLAnchorElement>('li.email a[href^="mailto:"]')?.textContent?.trim()
            ?? dl.querySelector<HTMLAnchorElement>('a.email[href^="mailto:"]')?.href.replace(/^mailto:/, "");
          const personHref = dl.querySelector<HTMLAnchorElement>(".person-info-btn-list a.person[href]")?.href;
          const labHref = dl.querySelector<HTMLAnchorElement>(".person-info-btn-list a.lab[href]")?.href ?? labAnchor?.href;
          return {
            name,
            from,
            email,
            labName: clean(labAnchor?.textContent),
            labUrl: labHref,
            profileOrScholarUrl: personHref,
          };
        })
        .filter((row) => row.name);
    });
    return rows.map((row) => {
      const isScholar = /scholar\.google/i.test(row.profileOrScholarUrl ?? "");
      return buildCandidate({
        departmentName: "AI학과",
        professorName: row.name,
        professorTitle: "참여교수",
        email: row.email,
        labName: row.labName,
        labUrl: resolveUrl(row.labUrl, sourceUrl) ?? emptyLabPageUrl,
        profileUrl: !isScholar ? row.profileOrScholarUrl : undefined,
        scholarUrl: isScholar ? row.profileOrScholarUrl : undefined,
        researchText: [row.labName, row.from].filter(Boolean).join(" "),
        sourceUrl,
        sourceParser: "cau-aigs-participating-faculty",
      });
    }).map((candidate) => candidate.labUrl === emptyLabPageUrl ? addWarning(candidate, "연구실 홈페이지 없음, fallback 사용") : candidate);
  } finally {
    await page.close();
  }
}

async function extractE3Labs(context: BrowserContext): Promise<CauLabCandidate[]> {
  const labPageUrl = sourceUrls[4]!;
  const facultyUrl = "https://e3home.cau.ac.kr/bm/bm_1.php";
  const [labs, professors] = await Promise.all([extractE3LabRows(context, labPageUrl), extractE3Professors(context, facultyUrl)]);
  const professorByName = new Map(professors.map((professor) => [professor.professorName, professor]));
  const labUrlByName = new Map(labs.map((lab) => [lab.labName?.replace(/\s+/g, ""), lab.labUrl]));
  return labs.map((lab) => {
    const professor = lab.professorName ? professorByName.get(lab.professorName) : undefined;
    const labUrl = lab.labUrl ?? labUrlByName.get(lab.labName?.replace(/\s+/g, "")) ?? professor?.labUrl;
    const candidate = buildCandidate({
      departmentName: "전자전기공학부",
      professorName: lab.professorName,
      professorTitle: professor?.professorTitle,
      email: professor?.email,
      labName: lab.labName,
      labUrl: labUrl ?? labPageUrl,
      profileUrl: professor?.profileUrl,
      researchText: lab.researchText ?? professor?.researchText,
      sourceUrl: labPageUrl,
      sourceParser: "cau-e3-lab-table",
    });
    return labUrl ? candidate : addWarning(candidate, "연구실 홈페이지 없음, fallback 사용");
  });
}

async function extractE3LabRows(context: BrowserContext, sourceUrl: string) {
  const page = await context.newPage();
  try {
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: pageTimeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    return await page.evaluate(() => {
      const clean = (input: string | null | undefined) => (input ?? "").replace(/\s+/g, " ").trim();
      return [...document.querySelectorAll("tr")]
        .map((tr) => {
          const cells = [...tr.querySelectorAll("td")].map((td) => clean(td.innerText));
          const link = tr.querySelector<HTMLAnchorElement>('a[href^="http"]')?.href;
          return { cells, link, text: clean(tr.innerText) };
        })
        .filter((row) => row.cells.length >= 3 && !/연구실\s+연구분야/.test(row.text))
        .map((row) => ({ labName: row.cells[0], researchText: row.cells[1], professorName: row.cells[2], labUrl: row.link }));
    });
  } finally {
    await page.close();
  }
}

async function extractE3Professors(context: BrowserContext, sourceUrl: string) {
  const page = await context.newPage();
  try {
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: pageTimeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    return await page.evaluate((baseUrl) => {
      const clean = (input: string | null | undefined) => (input ?? "").replace(/\s+/g, " ").trim();
      return [...document.querySelectorAll(".Professor1_wrap .col_md_4_t1")]
        .map((card) => {
          const text = clean(card.textContent);
          const name = text.match(/^([가-힣 ]{2,6})\s+(교수|부교수|조교수)/);
          const links = [...card.querySelectorAll<HTMLAnchorElement>('a[href^="http"]')]
            .map((anchor) => anchor.href)
            .filter((href) => !href.includes("e3home.cau.ac.kr/bm/bm_1.php#") && !href.startsWith("mailto:"));
          return {
            professorName: clean(name?.[1]),
            professorTitle: name?.[2],
            researchText: clean(text.match(/전공\s*:\s*(.*?)(?:\s+교수실\s*:|\s+연구실\s*:|$)/)?.[1]),
            labName: clean(text.match(/연구실\s*:\s*(.*?)(?:\s+E-Mail\s*:|\s+Tel\s*:|$)/)?.[1]),
            email: text.match(/E-Mail\s*:\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i)?.[1],
            labUrl: links[0],
            profileUrl: baseUrl,
          };
        })
        .filter((row) => row.professorName);
    }, sourceUrl);
  } finally {
    await page.close();
  }
}

async function enrichCandidateWithLabHomepage(context: BrowserContext, candidate: CauLabCandidate): Promise<CauLabCandidate> {
  if (!candidate.labUrl || candidate.validationWarnings?.includes("연구실 홈페이지 없음, fallback 사용")) {
    return candidate;
  }
  try {
    const metric = await extractMemberCountFromLab(context, candidate.labUrl);
    const links = await extractPublicationLinks(context, candidate.labUrl);
    return {
      ...candidate,
      currentMemberCount: metric.count,
      memberCountBreakdown: metric.breakdown,
      memberCountSourceUrl: metric.sourceUrl,
      memberCountCrawledAt: metric.count !== undefined ? new Date().toISOString() : undefined,
      scholarUrl: candidate.scholarUrl ?? links.scholarUrl,
      dblpUrl: candidate.dblpUrl ?? links.dblpUrl,
      validationWarnings: [
        ...new Set([
          ...(candidate.validationWarnings ?? []),
          ...(metric.count === undefined ? ["member_count_unknown"] : []),
          ...(links.warnings ?? []),
        ]),
      ],
    };
  } catch (error) {
    return addWarning(candidate, `lab_homepage_crawl_failed:${error instanceof Error ? error.message : String(error)}`);
  }
}

async function extractPublicationLinks(context: BrowserContext, labUrl: string): Promise<{ scholarUrl?: string; dblpUrl?: string; warnings?: string[] }> {
  const snapshot = await getSnapshot(context, labUrl, externalPageTimeoutMs);
  const scholarUrl = snapshot.links.find((link) => /scholar\.google/i.test(link.href))?.href;
  const dblpUrl = snapshot.links.find((link) => /dblp\.org/i.test(link.href))?.href;
  const hasPublicationLink = snapshot.links.some((link) => publicationPattern.test(`${link.text} ${link.href}`));
  return {
    scholarUrl,
    dblpUrl,
    warnings: hasPublicationLink && !scholarUrl && !dblpUrl ? ["publication_page_present_but_not_counted"] : undefined,
  };
}

type MemberCountMetric = {
  count?: number;
  breakdown?: Record<string, number>;
  sourceUrl?: string;
};

async function extractMemberCountFromLab(context: BrowserContext, labUrl: string): Promise<MemberCountMetric> {
  const snapshot = await getSnapshot(context, labUrl, externalPageTimeoutMs);
  const memberLinks = uniqueBy(
    snapshot.links
      .filter((link) => {
        const linkKey = `${link.text} ${link.href}`;
        const hasStrongMemberSignal = /members?|people|team|students?|personnel|구성원|멤버|연구원/i.test(linkKey);
        const hasWeakMemberSignal = /학생|박사|석사/i.test(link.text) && /members?|people|team|students?/i.test(link.href);
        const professorOnlyPage =
          /professor|faculty|principal[- ]?investigator|지도교수/i.test(linkKey)
          && !/current|students?|researchers?|연구원|학생/i.test(linkKey);
        return (hasStrongMemberSignal || hasWeakMemberSignal) && !professorOnlyPage && !alumniPattern.test(linkKey);
      })
      .sort((a, b) => scoreMemberLink(b) - scoreMemberLink(a))
      .map((link) => resolveUrl(link.href, snapshot.finalUrl))
      .filter((url): url is string => Boolean(url))
      .slice(0, 4)
      .map((url) => ({ url })),
    (item) => item.url,
  );
  const rootLooksLikeMemberPage = /members?|people|students?|team|구성원|멤버|학생|연구원/i.test(snapshot.finalUrl);
  const urls = uniqueBy([...memberLinks, ...(rootLooksLikeMemberPage ? [{ url: snapshot.finalUrl }] : [])], (item) => item.url);
  for (const item of urls) {
    const metric = item.url === snapshot.finalUrl ? await countMembersOnSnapshot(snapshot) : await countMembersOnPage(context, item.url);
    if (metric.count !== undefined) {
      return { ...metric, sourceUrl: item.url };
    }
  }
  return {};
}

async function countMembersOnPage(context: BrowserContext, url: string): Promise<MemberCountMetric> {
  const snapshot = await getSnapshot(context, url, externalPageTimeoutMs);
  return countMembersOnSnapshot(snapshot);
}

async function countMembersOnSnapshot(snapshot: PageSnapshot): Promise<MemberCountMetric> {
  const blockMetric = countMembersFromStructuredBlocks(snapshot);
  if (blockMetric.count !== undefined) {
    return blockMetric;
  }

  const alumniIndex = snapshot.text.search(alumniPattern);
  const currentText = alumniIndex >= 0 ? snapshot.text.slice(0, alumniIndex) : snapshot.text;
  const lines = currentText
    .split(/\s*(?:\n| {2,})\s*/)
    .map((line) => line.trim())
    .filter(Boolean);
  const currentMemberArea = lines.filter((line) => !alumniPattern.test(line));
  const roleLines = currentMemberArea.filter((line) =>
    /ph\.?d|doctoral|master|m\.?s\.?|undergraduate|intern|postdoc|visiting|researcher|student|박사|석사|학부|인턴|연구원|학생|과정/i.test(line),
  );
  const emailCount = new Set(currentMemberArea.flatMap((line) => line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])).size;
  const nameRoleCount = new Set(
    roleLines
      .map((line) => line.match(/([가-힣]{2,4}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/)?.[1])
      .filter((name): name is string => Boolean(name)),
  ).size;
  const count = Math.max(emailCount, nameRoleCount);
  if (count >= 2 && count <= 40 && /members?|people|students?|구성원|멤버|학생|연구원/i.test(snapshot.text)) {
    return { count };
  }
  return {};
}

function scoreMemberLink(link: { text: string; href: string }): number {
  const linkKey = `${link.text} ${link.href}`;
  return [
    /current|active|현재/.test(linkKey) ? 8 : 0,
    /members?|people|team|students?|구성원|멤버|연구원/i.test(linkKey) ? 4 : 0,
    /professor|faculty|principal[- ]?investigator|지도교수/i.test(linkKey) ? -5 : 0,
    /publication|paper|research|news|notice|board|bbs/i.test(linkKey) ? -3 : 0,
  ].reduce((sum, value) => sum + value, 0);
}

function countMembersFromStructuredBlocks(snapshot: PageSnapshot): MemberCountMetric {
  const pageLooksLikeMemberPage = /members?|people|students?|구성원|멤버|학생|연구원/i.test(`${snapshot.title} ${snapshot.finalUrl} ${snapshot.text.slice(0, 4_000)}`);
  if (!pageLooksLikeMemberPage) {
    return {};
  }

  const rolePattern = /ph\.?d|doctoral|master|m\.?s\.?|undergraduate|intern|postdoc|visiting|researcher|student|박사|석사|학부|인턴|연구원|학생|과정/i;
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const hasEmailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const alumniIndex = snapshot.text.search(alumniPattern);
  const currentText = alumniIndex >= 0 ? snapshot.text.slice(0, alumniIndex) : snapshot.text;
  const memberLikeBlocks = snapshot.memberBlocks.filter((block) => {
    if (block.isAlumniSection || alumniPattern.test(block.text)) {
      return false;
    }
    const blockIndex = snapshot.text.indexOf(block.text);
    if (alumniIndex >= 0 && blockIndex >= alumniIndex) {
      return false;
    }
    if (block.text.length > 350 || !currentText.includes(block.text)) {
      return false;
    }
    const looksLikeNavigation = /home|research|publication|contact|gallery|notice|news|login/i.test(block.text) && block.text.length < 80;
    const looksLikeRoleHeading = /^(?:ph\.?d|doctoral|master|m\.?s\.?|undergraduate|postdoc|students?|researchers?|박사과정|석사과정|학부생|연구원)s?$/i.test(block.text);
    const looksLikeProfessorOnly = /professor|교수|director|principal investigator/i.test(block.text) && !/postdoc|visiting|researcher|student|박사|석사|학부|인턴|연구원|학생/i.test(block.text);
    return !looksLikeNavigation && !looksLikeRoleHeading && !looksLikeProfessorOnly && (rolePattern.test(block.text) || hasEmailPattern.test(block.text));
  });

  const uniqueMembers = new Set<string>();
  for (const block of memberLikeBlocks) {
    const emails = block.text.match(emailPattern) ?? [];
    for (const email of emails) {
      uniqueMembers.add(email.toLowerCase());
    }
    if (emails.length > 0) {
      continue;
    }
    const textWithoutLeadingRole = block.text
      .replace(/^(?:ph\.?d|doctoral|master|m\.?s\.?|undergraduate|postdoc|visiting|researcher|student|박사과정|석사과정|학부생|연구원|학생)\s*(?:student|students|candidate|researcher)?\s*\d*[:.)-]?\s*/i, "")
      .trim();
    const name = textWithoutLeadingRole.match(/([가-힣]{2,4}|[A-Z][a-z]+(?:[- ][A-Z][a-z]+){1,3})/)?.[1];
    if (name) {
      uniqueMembers.add(name.toLowerCase());
    }
  }

  const count = uniqueMembers.size;
  if (count >= 2 && count <= 40) {
    return { count };
  }
  return {};
}

export async function discoverCauGraduateSeeds(context: BrowserContext, options: DiscoverOptions = {}): Promise<CauDiscoveryReport> {
  const departments = await extractGraduateDepartments(context);
  let candidates = [
    ...(await extractCseLabs(context)),
    ...(await extractMechanicalLabs(context)),
    ...(await extractAigsLabs(context)),
    ...(await extractE3Labs(context)),
  ];

  if (options.enrichMemberCounts !== false) {
    const max = options.maxLabHomepages ?? candidates.length;
    const concurrency = Math.max(1, Math.min(options.enrichConcurrency ?? 3, 8));
    const enriched = await mapWithConcurrency(candidates, concurrency, async (candidate, index) => {
      if (index >= max) {
        return addWarning(candidate, "member_count_not_checked_due_to_limit");
      }
      return enrichCandidateWithLabHomepage(context, candidate);
    });
    candidates = enriched;
  }

  candidates = uniqueBy(candidates, (candidate) => `${candidate.departmentName}|${candidate.professorName ?? ""}|${candidate.labName ?? ""}|${candidate.labUrl ?? ""}`);
  const taxonomyMatchCounts: Record<string, number> = {};
  const warningCounts: Record<string, number> = {};
  for (const candidate of candidates) {
    for (const match of candidate.classification.matches) {
      taxonomyMatchCounts[match.labelKo] = (taxonomyMatchCounts[match.labelKo] ?? 0) + 1;
    }
    for (const warning of candidate.validationWarnings ?? []) {
      warningCounts[warning] = (warningCounts[warning] ?? 0) + 1;
    }
  }

  return {
    sourceUrls,
    generatedAt: new Date().toISOString(),
    departments,
    facultyCandidates: candidates,
    discovery: {
      departmentDirectory: {
        sourceUrl: sourceUrls[0]!,
        departmentCount: departments.length,
        facultyUrlCount: departments.filter((department) => department.facultyUrl).length,
        notes: [
          "일반대학원 페이지는 계열별 학과 디렉터리이며 교수진 링크가 /graduate/department/{dept}/faculty.do 형태로 노출됩니다.",
          "TARGET_URL에 포함된 학과 홈페이지들이 별도 도메인 구조를 가지므로 전체 일반대학원 faculty.do를 일괄 재사용하지 않았습니다.",
        ],
      },
      targetPages: [
        {
          id: "cse",
          sourceUrl: sourceUrls[1]!,
          pageKind: "소프트웨어학부 연구실 목록",
          professorListUrls: ["https://cse.cau.ac.kr/sub01/sub0104.php"],
          labUrlPattern: "외부 홈페이지 링크가 .boxes .box 내부 a[href]로 노출",
          memberPagePattern: "외부 연구실의 Members/People/Students 링크를 후속 탐색",
          publicationPattern: "외부 연구실 내 Publications/Scholar/DBLP 링크만 보수적으로 저장",
          structureNotes: ["연구실 목록 페이지는 교수명을 직접 표시하지 않아 학부교수진 페이지의 연구실명/전공/이메일과 매칭합니다."],
        },
        {
          id: "me",
          sourceUrl: sourceUrls[2]!,
          pageKind: "기계공학부 연구실 표",
          professorListUrls: ["https://me.cau.ac.kr/bbs/content.php?co_id=sub2_1"],
          labUrlPattern: "표 행의 첫 외부 a[href]가 연구실 홈페이지",
          memberPagePattern: "외부 연구실의 Members/People/Students 링크를 후속 탐색",
          publicationPattern: "외부 연구실 내 Publications/Scholar/DBLP 링크만 보수적으로 저장",
          structureNotes: ["일부 명예교수 연구실도 표에 포함되어 title=명예교수로 보존합니다."],
        },
        {
          id: "aigs",
          sourceUrl: sourceUrls[3]!,
          pageKind: "AI대학원 연구실 페이지",
          professorListUrls: ["https://aigs.cau.ac.kr/sub02/sub0201.php"],
          labUrlPattern: "sub04/sub0402.php는 본문이 비어 있고 참여교수 페이지의 .proListFlex dl에 lab/person/scholar 링크가 존재",
          memberPagePattern: "참여교수 카드의 person 링크가 member 페이지 또는 Scholar일 수 있어 구분 저장",
          publicationPattern: "카드에 직접 Scholar가 있으면 저장, 이름 검색은 수행하지 않음",
          structureNotes: ["TARGET_URL에서 메뉴 링크를 따라 참여교수 페이지를 사용합니다."],
        },
        {
          id: "e3",
          sourceUrl: sourceUrls[4]!,
          pageKind: "전자전기공학부 대학원 연구실 표",
          professorListUrls: ["https://e3home.cau.ac.kr/bm/bm_1.php"],
          labUrlPattern: "표 행의 연구실명 링크가 외부 홈페이지",
          memberPagePattern: "외부 연구실의 Members/People/Students 링크를 후속 탐색",
          publicationPattern: "외부 연구실 내 Publications/Scholar/DBLP 링크만 보수적으로 저장",
          structureNotes: ["교수진 페이지에서 이메일/전공을 보강하고, 연구실 소개 표를 lab_url 우선 출처로 사용합니다."],
        },
      ],
      adapterDesign: [
        "공통 Playwright snapshot helper와 CAU 전용 selector/parser map을 사용합니다.",
        "학과 디렉터리, CSE, ME, AIGS, E3 parser를 분리해 URL 구조 차이를 adapter 내부에서 흡수합니다.",
        "연구원 수는 외부 lab_url의 Members/People/Team/Students 계열 페이지에서만 채우고, 실패하면 null로 둡니다.",
        "DBLP/Scholar는 페이지에 직접 노출된 링크만 저장하며 이름 기반 검색은 수행하지 않습니다.",
      ],
    },
    summary: {
      departmentCount: departments.length,
      facultyCandidateCount: candidates.length,
      labUrlCount: candidates.filter((candidate) => candidate.labUrl).length,
      fallbackUrlCount: candidates.filter((candidate) => candidate.validationWarnings?.includes("연구실 홈페이지 없음, fallback 사용")).length,
      memberCountKnown: candidates.filter((candidate) => typeof candidate.currentMemberCount === "number").length,
      scholarUrlCount: candidates.filter((candidate) => candidate.scholarUrl).length,
      dblpUrlCount: candidates.filter((candidate) => candidate.dblpUrl).length,
      taxonomyMatchCounts: Object.fromEntries(Object.entries(taxonomyMatchCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
      warningCounts: Object.fromEntries(Object.entries(warningCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    },
  };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}
