import { TextDecoder } from "node:util";
import { cleanText, extractFirstHref, extractHtmlCells, resolveUrl, textFromHtml, uniqueBy } from "../../core/html.js";

export type SkkuCollegeEntry = {
  id?: string;
  nameKo: string;
  nameEn?: string;
  url: string;
  adapter: "skku_grad_lab_index" | "skku_medicine_external";
};

export type SkkuLabIndexRow = {
  collegeId?: string;
  collegeNameKo: string;
  collegeNameEn?: string;
  departmentName: string;
  researchText?: string;
  labName?: string;
  professorName?: string;
  email?: string;
  location?: string;
  phone?: string;
  labUrl?: string;
  sourceUrl: string;
  sourceParser: "skku_college_lab_table" | "skku_medicine_external_lab_list";
};

const defaultHeaders = {
  "user-agent": process.env.CRAWLER_USER_AGENT ?? "KR-Labs-Crawler/0.1 contact@example.com",
};

export async function fetchSkkuHtml(url: string): Promise<string> {
  const response = await fetch(url, { headers: defaultHeaders });
  if (!response.ok) {
    throw new Error(`Failed to fetch SKKU page ${url}: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  return new TextDecoder("euc-kr").decode(buffer);
}

async function fetchUtf8Html(url: string): Promise<string> {
  const response = await fetch(url, { headers: defaultHeaders });
  if (!response.ok) {
    throw new Error(`Failed to fetch page ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

export async function discoverSkkuCollegeEntries(
  sourceUrl = "https://gradschool.skku.edu/grad/prepare/laboratory.htm",
): Promise<SkkuCollegeEntry[]> {
  const html = await fetchSkkuHtml(sourceUrl);
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  const generalBlock = withoutComments.match(/<div class="general">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/i)?.[1] ?? withoutComments;
  const anchors = [...generalBlock.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];

  const entries: SkkuCollegeEntry[] = anchors
    .map((match): SkkuCollegeEntry | undefined => {
        const url = resolveUrl(match[1], sourceUrl);
        const labelHtml = match[2] ?? "";
        const nameKo = textFromHtml(labelHtml.split(/<br\s*\/?>/i)[0]);
        const nameEn = textFromHtml(labelHtml.match(/<span\b[^>]*class=["']eng["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
        if (!url || !nameKo || !/(laboratory_01\.htm|biomedical\.skku\.edu)/i.test(url)) {
          return undefined;
        }

        const id = new URL(url).searchParams.get("college_id") ?? undefined;
        return {
          id,
          nameKo,
          nameEn,
          url,
          adapter: /biomedical\.skku\.edu/i.test(url) ? "skku_medicine_external" : "skku_grad_lab_index",
        } satisfies SkkuCollegeEntry;
      })
    .filter((entry): entry is SkkuCollegeEntry => Boolean(entry));

  return uniqueBy(entries, (entry) => `${entry.id ?? ""}|${entry.nameKo}|${entry.url}`);
}

export async function discoverSkkuCollegeLabRows(college: SkkuCollegeEntry): Promise<SkkuLabIndexRow[]> {
  if (college.adapter === "skku_medicine_external") {
    return discoverSkkuMedicineLabRows(college);
  }

  if (college.adapter === "skku_grad_lab_index") {
    return discoverSkkuInternalCollegeLabRows(college);
  }

  return [];
}

async function discoverSkkuInternalCollegeLabRows(college: SkkuCollegeEntry): Promise<SkkuLabIndexRow[]> {
  const html = await fetchSkkuHtml(college.url);
  const tableHtml =
    html.match(/<div\b[^>]*class=["'][^"']*table_1[^"']*["'][^>]*>[\s\S]*?<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1]
    ?? html.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1]
    ?? "";
  const rows = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];

  return rows
    .map((match) => buildLabRow(match[1] ?? "", college))
    .filter((row): row is SkkuLabIndexRow => Boolean(row));
}

async function discoverSkkuMedicineLabRows(college: SkkuCollegeEntry): Promise<SkkuLabIndexRow[]> {
  const html = await fetchUtf8Html(college.url);
  const blocks = html.split(/<li\b[^>]*class=["'][^"']*list_contents_00[^"']*["'][^>]*>/i).slice(1);

  return blocks
    .map((block) => buildMedicineLabRow(block, college))
    .filter((row): row is SkkuLabIndexRow => Boolean(row));
}

function buildLabRow(rowHtml: string, college: SkkuCollegeEntry): SkkuLabIndexRow | undefined {
  const cells = extractHtmlCells(rowHtml);
  if (cells.length < 8) {
    return undefined;
  }

  const departmentName = textFromHtml(cells[0]);
  const professorName = textFromHtml(cells[3]);
  if (!departmentName || !professorName || /연구분야|대표교수/i.test(`${departmentName} ${professorName}`)) {
    return undefined;
  }

  return {
    collegeId: college.id,
    collegeNameKo: college.nameKo,
    collegeNameEn: college.nameEn,
    departmentName,
    researchText: textFromHtml(cells[1]),
    labName: textFromHtml(cells[2]),
    professorName,
    email: textFromHtml(cells[4]),
    location: textFromHtml(cells[5]),
    phone: textFromHtml(cells[6]),
    labUrl: extractFirstHref(cells[7], college.url),
    sourceUrl: college.url,
    sourceParser: "skku_college_lab_table",
  };
}

function extractClassAnchor(block: string, className: string): { href?: string; html?: string; text?: string } {
  const match = block.match(new RegExp(`<a\\b[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>`, "i"));
  const href = match?.[1];
  const html = match?.[2];
  return {
    href,
    html,
    text: textFromHtml(html),
  };
}

function buildMedicineLabRow(block: string, college: SkkuCollegeEntry): SkkuLabIndexRow | undefined {
  const title = extractClassAnchor(block, "title");
  const koreanTitle = extractClassAnchor(block, "desc_kor");
  const name = extractClassAnchor(block, "name");
  const description = textFromHtml(block.match(/<a\b[^>]*class=["'][^"']*info_01[^"']*["'][^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/i)?.[1]);
  const nameKo = textFromHtml(name.html?.match(/<span\b[^>]*class=["'][^"']*desc_kor[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
  const nameEn = textFromHtml(name.html?.replace(/<span\b[\s\S]*?<\/span>/gi, " "));
  const labUrl = resolveUrl(title.href ?? koreanTitle.href ?? name.href, college.url);
  const labName = cleanText(koreanTitle.text) ?? cleanText(title.text);
  const professorName = cleanText(nameKo) ?? cleanText(nameEn);

  if (!labName || !professorName || !labUrl) {
    return undefined;
  }

  return {
    collegeId: college.id,
    collegeNameKo: college.nameKo,
    collegeNameEn: college.nameEn,
    departmentName: "의학과",
    researchText: cleanText([title.text, description].filter(Boolean).join(" | ")),
    labName,
    professorName,
    labUrl,
    sourceUrl: college.url,
    sourceParser: "skku_medicine_external_lab_list",
  };
}
