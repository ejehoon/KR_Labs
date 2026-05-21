import { readFile, writeFile } from "node:fs/promises";

type SogangFacultyCandidate = {
  sourceProgramName: string;
  affiliation?: string;
  nameKo?: string;
  researchText?: string;
  labUrl?: string;
  sourceUrl?: string;
  sourceParser?: string;
  currentMemberCount?: number;
  memberCountBreakdown?: Record<string, number>;
  memberCountSourceUrl?: string;
  memberCountCrawledAt?: string;
};

type SogangDiscoveryReport = {
  facultyCandidates: SogangFacultyCandidate[];
};

type CsLabDetail = {
  nameKo: string;
  labName?: string;
  detailUrl: string;
  labUrl?: string;
  researchText?: string;
};

const reportPaths = [
  "reports/sogang-grad-discovery.json",
  "reports/sogang-grad-discovery-enriched.json",
  "apps/web/public/data/sogang-grad-discovery.json",
];
const csLabListUrl = "https://cs.sogang.ac.kr/cs/cs04_3.html";

function cleanText(input: string | undefined): string | undefined {
  const value = input
    ?.replace(/\u00a0/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return value || undefined;
}

function textFromHtml(input: string | undefined): string | undefined {
  return cleanText(input?.replace(/<br\s*\/?>/gi, " ").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " "));
}

function textFromHtmlWithBreaks(input: string): string {
  return input
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|td|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractHtmlCells(rowHtml: string): string[] {
  return rowHtml.match(/<td\b[\s\S]*?<\/td>/gi) ?? [];
}

function resolveUrl(rawUrl: string | undefined, baseUrl: string): string | undefined {
  const trimmed = cleanText(rawUrl);
  if (!trimmed || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:") || trimmed.startsWith("javascript:")) {
    return undefined;
  }
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function extractFirstHref(html: string | undefined, baseUrl: string): string | undefined {
  return resolveUrl(html?.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1], baseUrl);
}

function extractLastContentHref(html: string, baseUrl: string): string | undefined {
  return [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)]
    .map((match) => resolveUrl(match[1], baseUrl))
    .filter((url): url is string => Boolean(url))
    .filter((url) => !/\.(?:gif|jpg|jpeg|png|webp|svg)(?:[?#].*)?$/i.test(url))
    .at(-1);
}

function extractResearchText(html: string): string | undefined {
  const lines = textFromHtmlWithBreaks(html)
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

function joinResearchText(values: Array<string | undefined>): string | undefined {
  const parts = values
    .flatMap((value) => value?.split("|") ?? [])
    .map((value) => cleanText(value))
    .filter((value): value is string => Boolean(value));
  return [...new Set(parts)].join(" | ") || undefined;
}

function clearMemberCount(row: SogangFacultyCandidate) {
  delete row.currentMemberCount;
  delete row.memberCountBreakdown;
  delete row.memberCountSourceUrl;
  delete row.memberCountCrawledAt;
}

function isCsListUrl(url: string | undefined): boolean {
  return /(?:cs|scc)\.sogang\.ac\.kr\/cs\/cs04_3(?:\.html)?$/i.test(url ?? "");
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 KR-Labs-Crawler/0.1" } });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

async function discoverCsLabDetails(): Promise<Map<string, CsLabDetail>> {
  const listHtml = await fetchText(csLabListUrl);
  const rows = (listHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [])
    .map((rowHtml) => {
      const cells = extractHtmlCells(rowHtml);
      if (cells.length < 3) {
        return undefined;
      }
      const detailUrl = extractFirstHref(cells[2], csLabListUrl);
      const nameKo = textFromHtml(cells[0]);
      if (!nameKo || !detailUrl) {
        return undefined;
      }
      return { nameKo, labName: textFromHtml(cells[1]), detailUrl };
    })
    .filter((row): row is Omit<CsLabDetail, "labUrl" | "researchText"> => Boolean(row));

  const details = await Promise.all(
    rows.map(async (row): Promise<CsLabDetail> => {
      const detailHtml = await fetchText(row.detailUrl);
      return {
        ...row,
        labUrl: extractLastContentHref(detailHtml, row.detailUrl) ?? row.detailUrl,
        researchText: extractResearchText(detailHtml),
      };
    }),
  );

  return new Map(details.map((detail) => [detail.nameKo, detail]));
}

async function repairReport(path: string, detailsByName: Map<string, CsLabDetail>) {
  const report = JSON.parse(await readFile(path, "utf8")) as SogangDiscoveryReport;
  let repaired = 0;
  let cleared = 0;

  for (const row of report.facultyCandidates) {
    if (row.sourceProgramName !== "컴퓨터공학과") {
      continue;
    }
    const detail = row.nameKo ? detailsByName.get(row.nameKo) : undefined;
    if (detail) {
      const oldLabUrl = row.labUrl;
      row.labUrl = detail.labUrl;
      row.sourceUrl = detail.detailUrl;
      row.researchText = joinResearchText([row.researchText, detail.researchText, detail.labName]);
      if (isCsListUrl(row.memberCountSourceUrl) || isCsListUrl(oldLabUrl)) {
        clearMemberCount(row);
        cleared += 1;
      }
      repaired += 1;
      continue;
    }

    if (isCsListUrl(row.labUrl) || isCsListUrl(row.memberCountSourceUrl)) {
      row.labUrl = row.sourceUrl && !isCsListUrl(row.sourceUrl) ? row.sourceUrl : undefined;
      clearMemberCount(row);
      cleared += 1;
    }
  }

  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { path, repaired, cleared };
}

async function main() {
  const detailsByName = await discoverCsLabDetails();
  const results = [];
  for (const path of reportPaths) {
    results.push(await repairReport(path, detailsByName));
  }
  console.log(JSON.stringify({ details: detailsByName.size, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
