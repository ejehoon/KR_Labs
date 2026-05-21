import type { BrowserContext } from "playwright";
import { classifyResearchText, type ResearchClassification } from "../taxonomy/researchTaxonomy.js";

export type SogangGraduateProgram = {
  series: string;
  name: string;
  homepageUrl?: string;
  email?: string;
  phone?: string;
  type: "department" | "interdisciplinary" | "institute_joint" | "track";
  classification: ResearchClassification;
};

export type SogangFacultyCandidate = {
  sourceProgramName: string;
  affiliation?: string;
  nameKo?: string;
  labName?: string;
  researchText?: string;
  labUrl?: string;
  sourceUrl: string;
  sourceParser?: string;
  classificationEvidenceText?: string;
  classification: ResearchClassification;
};

export type SogangGraduateDiscoveryReport = {
  sourceUrl: string;
  generatedAt: string;
  programs: SogangGraduateProgram[];
  facultyCandidates: SogangFacultyCandidate[];
  summary: {
    programCount: number;
    countsBySeries: Record<string, number>;
    countsByType: Record<SogangGraduateProgram["type"], number>;
    countsByParser: Record<string, number>;
    facultyCandidateCount: number;
    taxonomyMatchCounts: Record<string, number>;
    suggestionCount: number;
  };
};

type RawSogangProgramRow = {
  series?: string;
  name?: string;
  homepageUrl?: string;
  email?: string;
  phone?: string;
};

type SogangDepartmentAdapter = {
  id: string;
  matches: (program: SogangGraduateProgram) => boolean;
  extract: (context: BrowserContext, program: SogangGraduateProgram) => Promise<SogangFacultyCandidate[]>;
};

const sourceUrl = "https://gradsch.sogang.ac.kr/gradsch/gradsch02_3_1.html";
const menuScriptPattern = /<script[^>]+src=["']([^"']*\/menu\/[^"']+\.js[^"']*)["'][^>]*>/i;
const sogangGlobalKoreanFacultyUrl = "https://sggks.sogang.ac.kr/sggks/D_3503_22374.html";
const sogangArtTechFacultyUrl = "https://creative.sogang.ac.kr/about/about-faculty/";
const sogangHistoryEducationUrl = "https://historyedu.sogang.ac.kr/historyedu/D_2502_16603.html";
const programUrlOverrides: Record<string, string> = {
  "글로벌한국학과": sogangGlobalKoreanFacultyUrl,
  "아트&테크놀로지학과": sogangArtTechFacultyUrl,
  "역사교육학": sogangHistoryEducationUrl,
};

function cleanText(input: string | undefined): string | undefined {
  const value = input?.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return value || undefined;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)));
}

function textFromHtml(input: string): string {
  return decodeHtmlEntities(input.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "));
}

function textFromHtmlWithBreaks(input: string): string {
  return decodeHtmlEntities(
    input
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|td|h[1-6])>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function joinUniqueTexts(values: Array<string | undefined>): string {
  return [...new Set(values.map((value) => cleanText(value)).filter((value): value is string => Boolean(value)))].join(" | ");
}

function extractHtmlCells(rowHtml: string): string[] {
  return rowHtml.match(/<td\b[\s\S]*?<\/td>/gi) ?? [];
}

function extractFirstHref(html: string, baseUrl: string): string | undefined {
  const rawHref = html.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1];
  return resolveUrl(rawHref, baseUrl);
}

function extractLastContentHref(html: string, baseUrl: string): string | undefined {
  const hrefs = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)]
    .map((match) => resolveUrl(match[1], baseUrl))
    .filter((url): url is string => Boolean(url))
    .filter((url) => !/\.(?:gif|jpg|jpeg|png|webp|svg)(?:[?#].*)?$/i.test(url));
  return hrefs.at(-1);
}

function extractSogangCsDetailResearchText(html: string): string | undefined {
  const text = textFromHtmlWithBreaks(html);
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^>+\s*/, "").trim())
    .filter(Boolean);
  const start = lines.findIndex((line) => /^연구\s*분야$/i.test(line));
  if (start < 0) {
    return undefined;
  }

  const collected: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^(교수|연구실|위\s*치|연\s*락\s*처|홈페이지)$/i.test(line)) {
      continue;
    }
    if (/^(목록|list)$/i.test(line) || /교수\s*$/.test(line)) {
      break;
    }
    collected.push(line);
    if (collected.length >= 4) {
      break;
    }
  }

  return cleanText(collected.join(" "));
}

async function extractSogangCsLabDetail(detailUrl: string | undefined) {
  if (!detailUrl) {
    return {};
  }
  const html = await fetchText(detailUrl);
  if (!html) {
    return {};
  }

  return {
    labUrl: extractLastContentHref(html, detailUrl) ?? detailUrl,
    researchText: extractSogangCsDetailResearchText(html),
    sourceUrl: detailUrl,
  };
}

function resolveUrl(rawUrl: string | undefined, baseUrl: string): string | undefined {
  if (
    !rawUrl ||
    rawUrl.startsWith("mailto:") ||
    rawUrl.startsWith("tel:") ||
    rawUrl.startsWith("javascript:") ||
    /^[^/:]+@[^/]+$/.test(rawUrl)
  ) {
    return undefined;
  }

  try {
    const url = new URL(rawUrl, baseUrl);
    if (url.username || url.password) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function isSogangInstitutionalHomeUrl(rawUrl: string | undefined): boolean {
  const resolved = resolveUrl(rawUrl, sourceUrl);
  if (!resolved) {
    return false;
  }
  try {
    const url = new URL(resolved);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/g, "") || "/";
    return host === "sogang.ac.kr" && ["/", "/index.do", "/ko/home"].includes(path.toLowerCase());
  } catch {
    return false;
  }
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildFacultyCandidate(input: {
  sourceProgramName: string;
  affiliation?: string;
  nameKo?: string;
  labName?: string;
  researchText?: string;
  labUrl?: string;
  sourceUrl: string;
  sourceParser: string;
}): SogangFacultyCandidate {
  const affiliation = cleanText(input.affiliation);
  const rawName = cleanText(input.nameKo?.replace(/\s*교수$/, ""))?.replace(/(주임|학과장|원장)$/, "");
  const nameKo = rawName && /[가-힣]/.test(rawName)
    ? rawName.replace(/\s+/g, "")
    : rawName;
  const researchText = normalizeResearchText(input.researchText);
  const resolvedLabUrl = resolveUrl(input.labUrl, input.sourceUrl);
  const labUrl = isSogangInstitutionalHomeUrl(resolvedLabUrl) ? undefined : resolvedLabUrl;
  const labName = cleanText(input.labName);
  const classificationEvidenceText = [labName, researchText, affiliation, input.sourceProgramName].filter(Boolean).join(" | ");

  return {
    sourceProgramName: input.sourceProgramName,
    affiliation,
    nameKo,
    labName,
    researchText,
    labUrl,
    sourceUrl: input.sourceUrl,
    sourceParser: input.sourceParser,
    classificationEvidenceText,
    classification: classifyResearchText(labName ?? classificationEvidenceText),
  };
}

function isLikelyProfessorCandidate(candidate: SogangFacultyCandidate): boolean {
  const nameKo = candidate.nameKo;
  const researchText = candidate.researchText?.replace(/\s+/g, "") ?? "";
  if (!nameKo) {
    return false;
  }
  const isKoreanName = /^[가-힣]{2,5}$/.test(nameKo);
  const isEnglishName = /^[A-Za-z][A-Za-z .'-]{2,60}$/.test(nameKo);
  return (isKoreanName || isEnglishName)
    && !/(학과|공학|이학|여성학|협동과정|내용|연락처)$/.test(nameKo)
    && Boolean(candidate.researchText)
    && !/^\d{2,4}-?\d{3,4}-?\d{4}$/.test(researchText)
    && !/^\d{2,4}-\d{3,4}$/.test(researchText)
    && !/^\d{3,4}$/.test(researchText);
}

function extractKoreanProfessorName(text: string): string | undefined {
  const normalized = text.replace(/([가-힣])\s+(?=[가-힣])/g, "$1").replace(/\s+/g, " ").trim();
  const match = normalized.match(/([가-힣]{2,5})(?:\s*\([^)]*\))?\s*(?:교수|부교수|조교수|\/|Professor|Associate Professor|Assistant Professor)/i)
    ?? normalized.match(/^([가-힣]{2,5})\s/);
  return match?.[1];
}

function extractLegacyResearchText(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, " ").trim();
  const getLabeledValue = (label: RegExp) => {
    const match = normalized.match(label);
    if (match?.index === undefined) {
      return undefined;
    }

    const tail = normalized.slice(match.index + match[0].length).replace(/^\)?\s*[:：]\s*/, "").trim();
    const stopIndex = tail.search(/\s(?:연구실|Office|Tel|TEL|E-mail|Email|상\s*세|상세|학력|Education|Ph\.D\.|전공|전공분야|연구분야|연구년|연구학기)/i);
    return cleanText((stopIndex >= 0 ? tail.slice(0, stopIndex) : tail).replace(/\s*상\s*세\s*이\s*력\s*$/i, ""));
  };

  return getLabeledValue(/전공분야(?:\([^)]*\))?\s*[:：]?/)
    ?? getLabeledValue(/세부전공(?:\([^)]*\))?\s*[:：]?/)
    ?? getLabeledValue(/연구분야(?:\([^)]*\))?\s*[:：]?/)
    ?? getLabeledValue(/Research Interests?\s*[:：]?/i)
    ?? getLabeledValue(/Research Areas?\s*[:：]?/i)
    ?? getLabeledValue(/전공(?:\([^)]*\))?\s*[:：]?/);
}

function normalizeResearchText(input: string | undefined): string | undefined {
  const text = cleanText(input);
  if (!text) {
    return undefined;
  }

  const labeledValue = extractLegacyResearchText(text);
  const value = labeledValue ?? stripUnlabeledProfileNoise(text);
  if (!value) {
    return undefined;
  }
  if (/^\d{4}\s/.test(value) && /(대학교|석사|박사|학사|졸업)/.test(value)) {
    return undefined;
  }

  return cleanText(
    value
      .replace(/\s*\((?:E-?mail|Email|TEL|Tel|전화|연락처)\s*[:：][^)]*\)/gi, "")
      .replace(/\s+(?:학과장|주임교수|주임|원장)\s*$/g, "")
      .replace(/\s*\(\d{4}\)\s*$/g, "")
      .replace(/\s+\d{4}\s*$/g, "")
      .replace(/\s*상\s*세\s*이\s*력\s*$/i, ""),
  );
}

function stripUnlabeledProfileNoise(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, " ").trim();
  const markerIndex = normalized.search(
    /(?:^|\s)(?:연구실|Office|Tel|TEL|E-mail|Email|Website|[가-힣A-Za-z().& -]+대학교|University|Univ\.|KAIST|Bachelor|Master|B\.S\.?|M\.S\.?|Ph\.?\s*D|PhD|PostDoc|[가-힣A-Za-z]*박사|[가-힣A-Za-z]*석사|[가-힣A-Za-z]*학사\s*[\(:]|졸업)/i,
  );

  if (markerIndex < 0) {
    return normalized;
  }

  const candidate = cleanText(normalized.slice(0, markerIndex));
  return candidate && candidate.length >= 2 ? candidate : undefined;
}

function getProgramType(series: string, name: string): SogangGraduateProgram["type"] {
  if (series.includes("학·연")) {
    return "institute_joint";
  }
  if (series.includes("협동")) {
    return "interdisciplinary";
  }
  if (!name.endsWith("학과")) {
    return "track";
  }
  return "department";
}

async function fetchText(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": process.env.CRAWLER_USER_AGENT ?? "KR-Labs-Crawler/0.1 contact@example.com",
      },
    });
    if (!response.ok) {
      return undefined;
    }
    return response.text();
  } catch {
    return undefined;
  }
}

function getCounts<T extends string>(items: T[]): Record<T, number> {
  return items.reduce(
    (acc, item) => {
      acc[item] = (acc[item] ?? 0) + 1;
      return acc;
    },
    {} as Record<T, number>,
  );
}

async function extractPrograms(context: BrowserContext): Promise<SogangGraduateProgram[]> {
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  page.setDefaultNavigationTimeout(20_000);

  try {
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded" });
    const rows = (await page.evaluate(() => {
      let currentSeries = "";
      const trs = [...document.querySelectorAll(".section table tbody tr")];
      return trs
        .map((tr) => {
          const cells = [...tr.querySelectorAll("td")];
          const values = cells.map((cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? "");
          if (cells.length >= 5) {
            currentSeries = values[0] || currentSeries;
            return {
              series: currentSeries,
              name: values[1],
              homepageUrl: (cells[2]?.querySelector("a[href]") as HTMLAnchorElement | null)?.href,
              email: values[3],
              phone: values[4],
            };
          }
          if (cells.length >= 4) {
            const firstCellHasHomepage = Boolean((cells[1]?.querySelector("a[href]") as HTMLAnchorElement | null)?.href);
            if (!firstCellHasHomepage) {
              currentSeries = values[0] || currentSeries;
              return {
                series: currentSeries,
                name: values[1],
                homepageUrl: (cells[2]?.querySelector("a[href]") as HTMLAnchorElement | null)?.href,
                phone: values[3],
              };
            }
            return {
              series: currentSeries,
              name: values[0],
              homepageUrl: (cells[1]?.querySelector("a[href]") as HTMLAnchorElement | null)?.href,
              email: values[2],
              phone: values[3],
            };
          }
          if (cells.length >= 3) {
            return {
              series: currentSeries,
              name: values[0],
              homepageUrl: (cells[1]?.querySelector("a[href]") as HTMLAnchorElement | null)?.href,
              phone: values[2],
            };
          }
          return undefined;
        })
        .filter((item) => Boolean(item?.series && item.name));
    })) as RawSogangProgramRow[];

    return rows.flatMap((row) => {
      const series = cleanText(row.series);
      const name = cleanText(row.name);
      if (!series || !name) {
        return [];
      }

      return [
        {
          series,
          name,
          homepageUrl: resolveUrl(programUrlOverrides[name] ?? row.homepageUrl, sourceUrl),
          email: cleanText(row.email),
          phone: cleanText(row.phone),
          type: getProgramType(series, name),
          classification: classifyResearchText(`${series} ${name}`),
        },
      ];
    });
  } finally {
    await page.close().catch(() => undefined);
  }
}

function parseMenuArray(script: string, variableName: string): string[] {
  const match = script.match(new RegExp(`(?:^|\\n)${variableName}=(\\[[\\s\\S]*?\\])`));
  if (!match?.[1]) {
    return [];
  }

  try {
    return JSON.parse(match[1]) as string[];
  } catch {
    return [];
  }
}

async function discoverCandidatePages(program: SogangGraduateProgram): Promise<string[]> {
  if (!program.homepageUrl) {
    return [];
  }

  const html = await fetchText(program.homepageUrl);
  if (!html) {
    return [];
  }

  const urls = new Set<string>();
  const menuScriptUrl = resolveUrl(html.match(menuScriptPattern)?.[1], program.homepageUrl);
  if (menuScriptUrl) {
    const menuScript = await fetchText(menuScriptUrl);
    if (menuScript) {
      const menuUrls = parseMenuArray(menuScript, "url");
      const menuNames = parseMenuArray(menuScript, "urlname");
      menuUrls.forEach((url, index) => {
        const label = menuNames[index] ?? "";
        if (/교수|구성원|연구실|faculty|professor|lab|research/i.test(`${label} ${url}`)) {
          const resolved = resolveUrl(url, program.homepageUrl ?? "");
          if (resolved) {
            urls.add(resolved);
          }
        }
      });
    }
  }

  for (const fallbackPath of ["faculty", "professor", "people", "members", "research", "lab", "labs"]) {
    const resolved = resolveUrl(fallbackPath, program.homepageUrl.endsWith("/") ? program.homepageUrl : `${program.homepageUrl}/`);
    if (resolved) {
      urls.add(resolved);
    }
  }

  return [...urls].slice(0, 8);
}

async function extractFacultyTable(context: BrowserContext, sourceProgramName: string, pageUrl: string): Promise<SogangFacultyCandidate[]> {
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  page.setDefaultNavigationTimeout(12_000);

  try {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 12_000 });
    const rows = await page.evaluate(() => {
      let currentAffiliation = "";
      const trs = [...document.querySelectorAll("table tr")];
      return trs.flatMap((tr) => {
        const cells = [...tr.querySelectorAll("td")];
        const values = cells.map((cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? "");
        if (values.some((value) => /성명|세부전공|홈페이지|소속/.test(value))) {
          return [];
        }
        if (cells.length >= 4) {
          currentAffiliation = values[0] || currentAffiliation;
          return [
            {
              affiliation: currentAffiliation,
              nameKo: values[1],
              researchText: values[2],
              labUrl: (cells[3]?.querySelector("a[href]") as HTMLAnchorElement | null)?.href,
            },
          ];
        }
        if (cells.length >= 3) {
          return [
            {
              affiliation: currentAffiliation,
              nameKo: values[0],
              researchText: values[1],
              labUrl: (cells[2]?.querySelector("a[href]") as HTMLAnchorElement | null)?.href,
            },
          ];
        }
        return [];
      });
    });

    return rows
      .map((row) => ({
        ...buildFacultyCandidate({
          sourceProgramName,
          affiliation: row.affiliation,
          nameKo: row.nameKo,
          researchText: row.researchText,
          labUrl: row.labUrl,
          sourceUrl: pageUrl,
          sourceParser: "generic-table",
        }),
      }))
      .filter(isLikelyProfessorCandidate);
  } catch {
    return [];
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function extractLegacyProfileTable(input: {
  pageUrl: string;
  sourceProgramName: string;
  affiliation: string;
  sourceParser: string;
}): Promise<SogangFacultyCandidate[]> {
  const html = await fetchText(input.pageUrl);
  if (!html) {
    return [];
  }

  const rows = (html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []).flatMap((rowHtml) => {
    const rowText = cleanText(textFromHtml(rowHtml));
    if (!rowText || !/(교수|Professor|전공|연구분야|전공분야)/i.test(rowText)) {
      return [];
    }

    const nameKo = extractKoreanProfessorName(rowText);
    const researchText = extractLegacyResearchText(rowText);
    if (!nameKo || !researchText) {
      return [];
    }

    return [
      buildFacultyCandidate({
        sourceProgramName: input.sourceProgramName,
        affiliation: input.affiliation,
        nameKo,
        researchText,
        labUrl: extractLastContentHref(rowHtml, input.pageUrl),
        sourceUrl: input.pageUrl,
        sourceParser: input.sourceParser,
      }),
    ];
  });

  return uniqueBy(rows.filter(isLikelyProfessorCandidate), (row) => `${row.nameKo}|${row.researchText}|${row.labUrl ?? ""}`);
}

async function extractSogangAiFaculty(context: BrowserContext, program: SogangGraduateProgram): Promise<SogangFacultyCandidate[]> {
  const pageUrl = "https://ai.sogang.ac.kr/ai/ai06_1.html";
  return extractFacultyTable(context, program.name, pageUrl).then((rows) =>
    rows.map((row) => ({ ...row, sourceParser: "sogang-ai-faculty-table" })),
  );
}

async function extractSogangCsProfessorRows(
  context: BrowserContext,
  sourceProgramName: string,
  pageUrl: string,
): Promise<SogangFacultyCandidate[]> {
  void context;

  try {
    const html = await fetchText(pageUrl);
    if (!html) {
      return [];
    }

    const rows = (html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []).flatMap((rowHtml) => {
      const cells = extractHtmlCells(rowHtml);
      if (cells.length < 2) {
        return [];
      }

      const infoCell = cells[cells.length - 1] ?? "";
      const text = textFromHtml(infoCell).replace(/\s+/g, " ").trim();
      const nameKo = text.match(/([가-힣]{2,5})\s*교수/)?.[1];
      if (!nameKo) {
        return [];
      }

      const getAfterLabel = (labelPattern: RegExp, stopPattern: RegExp) => {
        const match = text.match(labelPattern);
        if (match?.index === undefined) {
          return "";
        }
        const tail = text.slice(match.index + match[0].length).trim();
        const stop = tail.search(stopPattern);
        return (stop >= 0 ? tail.slice(0, stop) : tail).replace(/^[:：]\s*/, "").trim();
      };
      const major = getAfterLabel(/세부전공\s*[:：]?/, /학\s*력|연\s*구\s*실|e-?mail|email/i);
      const labName = getAfterLabel(/연\s*구\s*실\s*[:：]?/, /e-?mail|email/i);

      return [
        {
          nameKo,
          researchText: [major, labName].filter(Boolean).join(" | "),
          labUrl: extractFirstHref(infoCell, pageUrl),
        },
      ];
    });

    return rows
      .map((row) =>
        buildFacultyCandidate({
          sourceProgramName,
          affiliation: "컴퓨터공학과",
          nameKo: row.nameKo,
          researchText: row.researchText,
          labUrl: row.labUrl,
          sourceUrl: pageUrl,
          sourceParser: "sogang-cs-professor-profile",
        }),
      )
      .filter(isLikelyProfessorCandidate);
  } catch {
    return [];
  }
}

async function extractSogangCsLabRows(
  context: BrowserContext,
  sourceProgramName: string,
  pageUrl: string,
): Promise<SogangFacultyCandidate[]> {
  void context;

  try {
    const html = await fetchText(pageUrl);
    if (!html) {
      return [];
    }

    const rows = (html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []).flatMap((rowHtml) => {
      const cells = extractHtmlCells(rowHtml);
      if (cells.length < 3) {
        return [];
      }
      return [
        {
          nameKo: cleanText(textFromHtml(cells[0] ?? "")),
          labName: cleanText(textFromHtml(cells[1] ?? "")),
          detailUrl: extractFirstHref(cells[2] ?? "", pageUrl),
        },
      ];
    });
    const enrichedRows = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        detail: await extractSogangCsLabDetail(row.detailUrl),
      })),
    );

    return enrichedRows
      .map((row) =>
        buildFacultyCandidate({
          sourceProgramName,
          affiliation: "컴퓨터공학과",
          nameKo: row.nameKo,
          labName: row.labName,
          researchText: joinUniqueTexts([row.detail.researchText, row.labName]),
          labUrl: row.detail.labUrl ?? row.detailUrl,
          sourceUrl: row.detail.sourceUrl ?? pageUrl,
          sourceParser: "sogang-cs-lab-table",
        }),
      )
      .filter(isLikelyProfessorCandidate);
  } catch {
    return [];
  }
}

async function extractSogangCsFaculty(context: BrowserContext, program: SogangGraduateProgram): Promise<SogangFacultyCandidate[]> {
  const profileUrl = "https://cs.sogang.ac.kr/cs/cs02_1.html";
  const labListUrl = "https://cs.sogang.ac.kr/cs/cs04_3.html";
  const profileRows = await extractSogangCsProfessorRows(context, program.name, profileUrl);
  const labRows = await extractSogangCsLabRows(context, program.name, labListUrl);
  const labByName = new Map(labRows.map((row) => [row.nameKo, row]));

  return uniqueBy(
    profileRows.map((profileRow) => {
      const labRow = labByName.get(profileRow.nameKo);
      return buildFacultyCandidate({
          sourceProgramName: program.name,
          affiliation: profileRow.affiliation,
          nameKo: profileRow.nameKo,
          researchText: joinUniqueTexts([profileRow.researchText, labRow?.researchText]),
          labUrl: labRow?.labUrl ?? profileRow.labUrl,
        sourceUrl: labRow?.sourceUrl ?? profileRow.sourceUrl,
        sourceParser: "sogang-cs-merged",
      });
    }),
    (row) => `${row.nameKo}|${row.labUrl ?? ""}|${row.researchText ?? ""}`,
  );
}

async function extractSogangEeFaculty(context: BrowserContext, program: SogangGraduateProgram): Promise<SogangFacultyCandidate[]> {
  const pageUrl = "http://ee.sogang.ac.kr/kor/employee/professor.php";
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  page.setDefaultNavigationTimeout(12_000);

  try {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 12_000 });
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll(".info_bx")].flatMap((card) => {
        const nameKo = card.querySelector(".pf_name")?.textContent?.replace(/\s*교수\s*$/, "").replace(/\s+/g, " ").trim();
        const values = new Map(
          [...card.querySelectorAll("li")].map((li) => {
            const key = li.querySelector("strong")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
            const value = li.querySelector("div")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
            const link = (li.querySelector("a[href]") as HTMLAnchorElement | null)?.href ?? "";
            return [key, { value, link }] as const;
          }),
        );
        const researchText = values.get("연구분야")?.value;
        const homepage = values.get("홈페이지")?.link;
        return [{ nameKo, researchText, labUrl: homepage }];
      }),
    );

    return rows
      .map((row) =>
        buildFacultyCandidate({
          sourceProgramName: program.name,
          affiliation: "전자공학과",
          nameKo: row.nameKo,
          researchText: row.researchText,
          labUrl: row.labUrl,
          sourceUrl: pageUrl,
          sourceParser: "sogang-ee-profile-card",
        }),
      )
      .filter(isLikelyProfessorCandidate);
  } catch {
    return [];
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function extractSogangMechanicalFaculty(context: BrowserContext, program: SogangGraduateProgram): Promise<SogangFacultyCandidate[]> {
  const pageUrl = "https://me.sogang.ac.kr/v2/bbs/board.php?bo_table=sub2_1";
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  page.setDefaultNavigationTimeout(12_000);

  try {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 12_000 });
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll(".mb_peple")].flatMap((card) => {
        const nameKo = card.querySelector(".mb_name h3")?.textContent?.replace(/\s+/g, " ").replace(/\s*교수\s*$/, "").trim();
        const values = new Map(
          [...card.querySelectorAll(".cnt li")].map((li) => {
            const key = li.querySelector("b")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
            const value = li.querySelector("span")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
            const link = (li.querySelector("a[href]") as HTMLAnchorElement | null)?.href ?? "";
            return [key, { value, link }] as const;
          }),
        );
        const profileUrl = (card.querySelector(".mb_name a[href]") as HTMLAnchorElement | null)?.href;
        const lab = values.get("연구실");
        const homepage = values.get("홈페이지")?.link;
        return [{ nameKo, researchText: lab?.value, labUrl: homepage || profileUrl }];
      }),
    );

    return rows
      .map((row) =>
        buildFacultyCandidate({
          sourceProgramName: program.name,
          affiliation: "기계공학과",
          nameKo: row.nameKo,
          researchText: row.researchText,
          labUrl: row.labUrl,
          sourceUrl: pageUrl,
          sourceParser: "sogang-me-gnu-card",
        }),
      )
      .filter(isLikelyProfessorCandidate);
  } catch {
    return [];
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function extractSogangLifeScienceFaculty(context: BrowserContext, program: SogangGraduateProgram): Promise<SogangFacultyCandidate[]> {
  const pageUrl = "https://lifescien.sogang.ac.kr/bbs/board.php?bo_table=teacher";
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  page.setDefaultNavigationTimeout(12_000);

  try {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 12_000 });
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll(".line_list li .box")].flatMap((card) => {
        const rawName = card.querySelector(".name")?.textContent?.replace(/\s+/g, " ").trim();
        const nameKo = rawName?.replace(/\s*교수\s*$/, "").trim();
        const values = new Map(
          [...card.querySelectorAll("dl")].map((dl) => {
            const key = dl.querySelector("dt")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
            const value = dl.querySelector("dd")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
            return [key, value] as const;
          }),
        );
        const profileUrl = (card.querySelector(".more-btn a[href], .thumb a[href]") as HTMLAnchorElement | null)?.href;
        return [{ nameKo, researchText: values.get("연구실"), labUrl: profileUrl }];
      }),
    );

    return rows
      .map((row) =>
        buildFacultyCandidate({
          sourceProgramName: program.name,
          affiliation: "생명과학과",
          nameKo: row.nameKo,
          researchText: row.researchText,
          labUrl: row.labUrl,
          sourceUrl: pageUrl,
          sourceParser: "sogang-life-gnu-card",
        }),
      )
      .filter(isLikelyProfessorCandidate);
  } catch {
    return [];
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function extractSogangPhysicsFaculty(context: BrowserContext, program: SogangGraduateProgram): Promise<SogangFacultyCandidate[]> {
  const pageUrl = "https://physics.sogang.ac.kr/physics/physics01_5_1.html";
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  page.setDefaultNavigationTimeout(12_000);

  try {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 12_000 });
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll("table.txc-table tr")].flatMap((tr) => {
        const text = tr.textContent?.replace(/\s+/g, " ").trim() ?? "";
        const title = tr.querySelector("b")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        const rawKoName = title.match(/^([가-힣]\s*){2,5}/)?.[0]?.replace(/\s+/g, "");
        if (!rawKoName) {
          return [];
        }
        const labLink = [...tr.querySelectorAll("a[href]")].find((anchor) => /연구실|Lab|lab|Center|광학|물성|분광|소자|홀로그래피|입자/.test(anchor.textContent ?? "")) as HTMLAnchorElement | undefined;
        const labName = labLink?.textContent?.replace(/\s+/g, " ").trim();
        const researchInterest = text.match(/Research Interest\s*:\s*([^<]+?)(Education|Office|E-mail|Phone|$)/i)?.[1]?.replace(/\s+/g, " ").trim();
        return [
          {
            nameKo: rawKoName,
            labName,
            researchText: [researchInterest, labName].filter(Boolean).join(" | "),
            labUrl: labLink?.href,
          },
        ];
      }),
    );

    return rows
      .map((row) =>
        buildFacultyCandidate({
          sourceProgramName: program.name,
          affiliation: "물리학과",
          nameKo: row.nameKo,
          labName: row.labName,
          researchText: row.researchText,
          labUrl: row.labUrl,
          sourceUrl: pageUrl,
          sourceParser: "sogang-physics-legacy-table",
        }),
      )
      .filter(isLikelyProfessorCandidate);
  } catch {
    return [];
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function extractSogangChemEngFaculty(context: BrowserContext, program: SogangGraduateProgram): Promise<SogangFacultyCandidate[]> {
  const pageUrl = "http://chemeng.sogang.ac.kr/kor/sub/02_01.php";
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  page.setDefaultNavigationTimeout(12_000);

  try {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 12_000 });
    const profileUrls = await page.evaluate(() =>
      [...document.querySelectorAll(".s_02_st2 li a[href]")]
        .map((anchor) => (anchor as HTMLAnchorElement).href)
        .filter((href) => href.includes("02_01_view.php")),
    );

    const rows: Array<{ nameKo?: string; researchText?: string; labUrl?: string; sourceUrl: string }> = [];
    for (const profileUrl of uniqueBy(profileUrls, (url) => url).slice(0, 40)) {
      await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 12_000 });
      const row = await page.evaluate(() => {
        const nameKo = document.querySelector(".s_02_view .name strong")?.textContent?.replace(/\s+/g, " ").trim();
        const infoItems = [...document.querySelectorAll(".s_02_view .info li")].map((li) => li.textContent?.replace(/\s+/g, " ").trim() ?? "");
        const labName = infoItems[0];
        const homepage = (document.querySelector(".s_02_view .info li.icon4 a[href]") as HTMLAnchorElement | null)?.href;
        const textWraps = [...document.querySelectorAll(".s_02_view .txt_wrap")].map((wrap) => {
          const title = wrap.querySelector("strong")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
          const value = wrap.textContent?.replace(title, "").replace(/\s+/g, " ").trim() ?? "";
          return { title, value };
        });
        const researchTexts = textWraps
          .filter((item) => /Research Areas|Research Interests/i.test(item.title))
          .map((item) => item.value)
          .filter(Boolean);
        return { nameKo, researchText: [labName, ...researchTexts].filter(Boolean).join(" | "), labUrl: homepage };
      });
      rows.push({ ...row, sourceUrl: profileUrl });
    }

    return rows
      .map((row) =>
        buildFacultyCandidate({
          sourceProgramName: program.name,
          affiliation: "화공생명공학과",
          nameKo: row.nameKo,
          labName: row.researchText?.split(" | ")[0],
          researchText: row.researchText,
          labUrl: row.labUrl,
          sourceUrl: row.sourceUrl,
          sourceParser: "sogang-chemeng-profile-detail",
        }),
      )
      .filter(isLikelyProfessorCandidate);
  } catch {
    return [];
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function extractSogangPsychologyFaculty(context: BrowserContext, program: SogangGraduateProgram): Promise<SogangFacultyCandidate[]> {
  void context;
  return extractLegacyProfileTable({
    pageUrl: "https://psychology.sogang.ac.kr/psychology/psychology01_001.html",
    sourceProgramName: program.name,
    affiliation: "심리학과",
    sourceParser: "sogang-psychology-legacy-profile",
  });
}

async function extractSogangLawFaculty(context: BrowserContext, program: SogangGraduateProgram): Promise<SogangFacultyCandidate[]> {
  void context;
  return extractLegacyProfileTable({
    pageUrl: "https://law.sogang.ac.kr/law/law03_1.html",
    sourceProgramName: program.name,
    affiliation: "법학과",
    sourceParser: "sogang-law-legacy-profile",
  });
}

async function extractSogangChemistryFaculty(context: BrowserContext, program: SogangGraduateProgram): Promise<SogangFacultyCandidate[]> {
  void context;
  const pageUrl = "https://chemistry.sogang.ac.kr/chemistry/chemistry02_1.html";
  const html = await fetchText(pageUrl);
  if (!html) {
    return [];
  }

  const rows = (html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []).flatMap((rowHtml) => {
    const rowText = cleanText(textFromHtml(rowHtml));
    const nameKo = rowText?.match(/^([가-힣]{2,5})\s*\(/)?.[1];
    const researchText = rowText
      ?.replace(/^([가-힣]{2,5})\s*\([^)]*\)\s*\d{4}\s*~\s*/, "")
      .replace(/\s(?:서울대학교|고려대학교|연세대학교|서강대학교|KAIST|Univ\.|UC |Harvard|Stanford|Texas|SUNY|NIST|LG Chem|Eastern Univ\.|TEL|Email)[\s\S]*$/i, "");
    if (!nameKo || !researchText) {
      return [];
    }

    return [
      buildFacultyCandidate({
        sourceProgramName: program.name,
        affiliation: "화학과",
        nameKo,
        researchText,
        labUrl: extractLastContentHref(rowHtml, pageUrl),
        sourceUrl: pageUrl,
        sourceParser: "sogang-chemistry-legacy-profile",
      }),
    ];
  });

  return uniqueBy(rows.filter(isLikelyProfessorCandidate), (row) => `${row.nameKo}|${row.researchText}`);
}

async function extractSogangMotFaculty(context: BrowserContext, program: SogangGraduateProgram): Promise<SogangFacultyCandidate[]> {
  void context;
  return extractLegacyProfileTable({
    pageUrl: "https://sgmot.sogang.ac.kr/sogangmot/new_faculties.html",
    sourceProgramName: program.name,
    affiliation: "기술경영학",
    sourceParser: "sogang-mot-legacy-profile",
  });
}

async function extractSogangBusinessFaculty(context: BrowserContext, program: SogangGraduateProgram): Promise<SogangFacultyCandidate[]> {
  const pageUrl = "https://sbs.fiart.net/html/fulltime.html";
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  page.setDefaultNavigationTimeout(12_000);

  try {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 12_000 });
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll(".people_box")].flatMap((card) => {
        const nameKo = card.querySelector("h4")?.childNodes[0]?.textContent?.replace(/\s+/g, "");
        const values = new Map(
          [...card.querySelectorAll("li")].map((li) => {
            const key = li.querySelector("span")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
            const value = li.textContent?.replace(key, "").replace(/\s+/g, " ").trim() ?? "";
            return [key, value] as const;
          }),
        );
        const onclick = card.getAttribute("onclick") ?? "";
        const detailPath = onclick.match(/location\.href=['"]([^'"]+)['"]/)?.[1];
        return [{ nameKo, researchText: values.get("전공"), labUrl: detailPath }];
      }),
    );

    return rows
      .map((row) =>
        buildFacultyCandidate({
          sourceProgramName: program.name,
          affiliation: "경영학과",
          nameKo: row.nameKo,
          researchText: row.researchText,
          labUrl: row.labUrl,
          sourceUrl: pageUrl,
          sourceParser: "sogang-business-iframe-people",
        }),
      )
      .filter(isLikelyProfessorCandidate);
  } catch {
    return [];
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function extractSogangBiotechFaculty(context: BrowserContext, program: SogangGraduateProgram): Promise<SogangFacultyCandidate[]> {
  const pageUrl = "http://biotech.sogang.ac.kr/sub/sub02_01.php";
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  page.setDefaultNavigationTimeout(12_000);

  try {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 12_000 });
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll(".Professor-list")].flatMap((card) => {
        const text = card.textContent?.replace(/\s+/g, " ").trim() ?? "";
        const nameKo = text.match(/^([가-힣]\s*){2,5}/)?.[0]?.replace(/\s+/g, "");
        const labUrl = (card.querySelector("li a[href]") as HTMLAnchorElement | null)?.href;
        const researchText = text
          .replace(/^([가-힣]\s*){2,5}\([^)]*\)\s*/, "")
          .replace(/\s+[a-z0-9._%+-]+@sogang\.ac\.kr[\s\S]*$/i, "");
        return [{ nameKo, researchText, labUrl }];
      }),
    );

    return rows
      .map((row) =>
        buildFacultyCandidate({
          sourceProgramName: program.name,
          affiliation: "융합생명공학과",
          nameKo: row.nameKo,
          researchText: row.researchText,
          labUrl: row.labUrl,
          sourceUrl: pageUrl,
          sourceParser: "sogang-biotech-professor-list",
        }),
      )
      .filter(isLikelyProfessorCandidate);
  } catch {
    return [];
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function extractSogangGlobalKoreanFaculty(context: BrowserContext, program: SogangGraduateProgram): Promise<SogangFacultyCandidate[]> {
  void context;
  return extractLegacyProfileTable({
    pageUrl: sogangGlobalKoreanFacultyUrl,
    sourceProgramName: program.name,
    affiliation: "글로벌한국학과",
    sourceParser: "sogang-gks-legacy-profile",
  });
}

async function extractSogangArtTechFaculty(context: BrowserContext, program: SogangGraduateProgram): Promise<SogangFacultyCandidate[]> {
  const pageUrl = sogangArtTechFacultyUrl;
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  page.setDefaultNavigationTimeout(12_000);

  try {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 12_000 });
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll(".uc_post_grid_style_one_item")].flatMap((card) => {
        const nameKo = card.querySelector(".uc_p_title")?.textContent?.replace(/\s+/g, " ").trim();
        const labUrl = (
          card.querySelector("a.project_post_div[href], a.uc_post_grid_style_one_image[href], .uc_post_title a[href]") as HTMLAnchorElement | null
        )?.href;
        return [{ nameKo, researchText: "Art & Technology", labUrl }];
      }),
    );

    return rows
      .map((row) =>
        buildFacultyCandidate({
          sourceProgramName: program.name,
          affiliation: "아트&테크놀로지학과",
          nameKo: row.nameKo,
          researchText: row.researchText,
          labUrl: row.labUrl,
          sourceUrl: pageUrl,
          sourceParser: "sogang-arttech-wordpress-grid",
        }),
      )
      .filter(isLikelyProfessorCandidate);
  } catch {
    return [];
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function extractSogangLegacyInterdisciplinaryFaculty(context: BrowserContext, program: SogangGraduateProgram): Promise<SogangFacultyCandidate[]> {
  void context;
  const parserByProgram: Record<string, { pageUrl: string; affiliation: string; parser: string }> = {
    동남아시아학: {
      pageUrl: "https://seasia.sogang.ac.kr/seasia/seasia02_1.html",
      affiliation: "동남아시아학",
      parser: "sogang-seasia-legacy-profile",
    },
    상담심리학: {
      pageUrl: "https://cpeic.sogang.ac.kr/cpeic/eic01_3.html",
      affiliation: "상담심리학",
      parser: "sogang-counseling-legacy-profile",
    },
    부동산학: {
      pageUrl: "https://gsre.sogang.ac.kr/gsre/menu_01_02_01.html",
      affiliation: "부동산학",
      parser: "sogang-realestate-legacy-profile",
    },
  };
  const config = parserByProgram[program.name];
  if (!config) {
    return [];
  }

  return extractLegacyProfileTable({
    pageUrl: config.pageUrl,
    sourceProgramName: program.name,
    affiliation: config.affiliation,
    sourceParser: config.parser,
  });
}

const departmentAdapters: SogangDepartmentAdapter[] = [
  {
    id: "sogang-ai",
    matches: (program) => program.name === "인공지능학" || program.name === "인공지능학과",
    extract: extractSogangAiFaculty,
  },
  {
    id: "sogang-cs",
    matches: (program) => program.name === "컴퓨터공학과",
    extract: extractSogangCsFaculty,
  },
  {
    id: "sogang-ee",
    matches: (program) => program.name === "전자공학과",
    extract: extractSogangEeFaculty,
  },
  {
    id: "sogang-me",
    matches: (program) => program.name === "기계공학과",
    extract: extractSogangMechanicalFaculty,
  },
  {
    id: "sogang-chemeng",
    matches: (program) => program.name === "화공생명공학과",
    extract: extractSogangChemEngFaculty,
  },
  {
    id: "sogang-life",
    matches: (program) => program.name === "생명과학과",
    extract: extractSogangLifeScienceFaculty,
  },
  {
    id: "sogang-physics",
    matches: (program) => program.name === "물리학과",
    extract: extractSogangPhysicsFaculty,
  },
  {
    id: "sogang-psychology",
    matches: (program) => program.name === "심리학과",
    extract: extractSogangPsychologyFaculty,
  },
  {
    id: "sogang-law",
    matches: (program) => program.name === "법학과",
    extract: extractSogangLawFaculty,
  },
  {
    id: "sogang-chemistry",
    matches: (program) => program.name === "화학과",
    extract: extractSogangChemistryFaculty,
  },
  {
    id: "sogang-mot",
    matches: (program) => program.name === "기술경영학",
    extract: extractSogangMotFaculty,
  },
  {
    id: "sogang-business",
    matches: (program) => program.name === "경영학과",
    extract: extractSogangBusinessFaculty,
  },
  {
    id: "sogang-biotech",
    matches: (program) => program.name === "융합생명공학과",
    extract: extractSogangBiotechFaculty,
  },
  {
    id: "sogang-gks",
    matches: (program) => program.name === "글로벌한국학과",
    extract: extractSogangGlobalKoreanFaculty,
  },
  {
    id: "sogang-arttech",
    matches: (program) => program.name === "아트&테크놀로지학과",
    extract: extractSogangArtTechFaculty,
  },
  {
    id: "sogang-legacy-interdisciplinary",
    matches: (program) => ["동남아시아학", "상담심리학", "부동산학"].includes(program.name),
    extract: extractSogangLegacyInterdisciplinaryFaculty,
  },
];

function getDepartmentAdapter(program: SogangGraduateProgram): SogangDepartmentAdapter | undefined {
  return departmentAdapters.find((adapter) => adapter.matches(program));
}

async function extractFacultyCandidates(
  context: BrowserContext,
  programs: SogangGraduateProgram[],
  options?: { maxPrograms?: number; maxPagesPerProgram?: number },
): Promise<SogangFacultyCandidate[]> {
  const maxPrograms = options?.maxPrograms ?? programs.length;
  const maxPagesPerProgram = options?.maxPagesPerProgram ?? 4;
  const candidates: SogangFacultyCandidate[] = [];

  for (const program of programs.slice(0, maxPrograms)) {
    const adapter = getDepartmentAdapter(program);
    if (adapter) {
      const rows = await adapter.extract(context, program);
      candidates.push(...rows);
      if (rows.length > 0) {
        continue;
      }
    }

    const candidatePages = (await discoverCandidatePages(program)).slice(0, maxPagesPerProgram);
    for (const candidatePage of candidatePages) {
      const rows = await extractFacultyTable(context, program.name, candidatePage);
      candidates.push(...rows);
      if (rows.length > 0) {
        break;
      }
    }
  }

  return uniqueBy(
    candidates,
    (candidate) => `${candidate.sourceProgramName}|${candidate.nameKo}|${candidate.labUrl ?? ""}|${candidate.researchText ?? ""}`,
  );
}

function summarize(programs: SogangGraduateProgram[], facultyCandidates: SogangFacultyCandidate[]): SogangGraduateDiscoveryReport["summary"] {
  const taxonomyMatchCounts: Record<string, number> = {};
  for (const item of [...programs, ...facultyCandidates]) {
    for (const match of item.classification.matches) {
      taxonomyMatchCounts[match.labelKo] = (taxonomyMatchCounts[match.labelKo] ?? 0) + 1;
    }
  }

  return {
    programCount: programs.length,
    countsBySeries: getCounts(programs.map((program) => program.series)),
    countsByType: {
      department: programs.filter((program) => program.type === "department").length,
      interdisciplinary: programs.filter((program) => program.type === "interdisciplinary").length,
      institute_joint: programs.filter((program) => program.type === "institute_joint").length,
      track: programs.filter((program) => program.type === "track").length,
    },
    countsByParser: getCounts(facultyCandidates.map((candidate) => candidate.sourceParser ?? "unknown")),
    facultyCandidateCount: facultyCandidates.length,
    taxonomyMatchCounts,
    suggestionCount: [...programs, ...facultyCandidates].reduce((count, item) => count + item.classification.suggestions.length, 0),
  };
}

export async function discoverSogangGraduateSeeds(
  context: BrowserContext,
  options?: { maxPrograms?: number; maxPagesPerProgram?: number },
): Promise<SogangGraduateDiscoveryReport> {
  const programs = await extractPrograms(context);
  const facultyCandidates = await extractFacultyCandidates(context, programs, options);

  return {
    sourceUrl,
    generatedAt: new Date().toISOString(),
    programs,
    facultyCandidates,
    summary: summarize(programs, facultyCandidates),
  };
}
