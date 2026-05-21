import { readFile, writeFile } from "node:fs/promises";
import { cleanText, decodeHtmlEntities, resolveUrl, textFromHtml } from "../packages/crawler/src/core/html.js";

type SkkuLabCandidate = {
  collegeNameKo?: string;
  departmentName: string;
  labName?: string;
  professorName?: string;
  researchText?: string;
  labUrl?: string;
  sourceUrl: string;
  externalResolverSourceUrl?: string;
  externalResolverNote?: string;
};

type SkkuDiscoveryReport = {
  labCandidates: SkkuLabCandidate[];
  summary?: Record<string, unknown>;
};

type ResolveHit = {
  departmentName: string;
  professorName: string;
  labName?: string;
  labUrl: string;
  researchText?: string;
  sourceUrl: string;
  note: string;
};

const reportPaths = [
  "reports/skku-grad-discovery.json",
  "apps/web/public/data/skku-grad-discovery.json",
];

const defaultHeaders = {
  "user-agent": process.env.CRAWLER_USER_AGENT ?? "KR-Labs-Crawler/0.1 contact@example.com",
};

function normalizeKey(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toLowerCase();
}

function mergeResearchText(current: string | undefined, next: string | undefined): string | undefined {
  const parts = [current, next].map(cleanText).filter((value): value is string => Boolean(value));
  if (parts.length === 0) {
    return undefined;
  }
  return [...new Set(parts)].join(" | ");
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.map(cleanText).find((value): value is string => Boolean(value));
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, { headers: defaultHeaders });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function profileUrl(sourceUrl: string, perId: string | undefined): string | undefined {
  const cleanPerId = cleanText(perId);
  if (!cleanPerId) {
    return undefined;
  }

  const url = new URL(sourceUrl);
  url.searchParams.set("mode", "view");
  url.searchParams.set("perId", cleanPerId);
  return url.toString();
}

function pseudoField(value: string, fieldName: string): string | undefined {
  const pattern = new RegExp(`(?:^|[{,]\\s*)${fieldName}=([^,}]*)`);
  return cleanText(decodeHtmlEntities(value).match(pattern)?.[1]);
}

function pseudoResearchText(value: string): string | undefined {
  const decoded = decodeHtmlEntities(value);
  const interests = [...decoded.matchAll(/resInterestKr=([^,}]*)/g)]
    .map((match) => cleanText(match[1]))
    .filter((text): text is string => Boolean(text));
  return mergeResearchText(pseudoField(decoded, "dtJojikNm"), interests.join(" "));
}

function parseSkkuFacultyMetadataPage(sourceUrl: string, departmentName: string, note: string): (html: string) => ResolveHit[] {
  return function parse(html: string): ResolveHit[] {
    return [...html.matchAll(/<input\b[^>]*id=["']test["'][^>]*value=["']([^"']*)["']/gi)]
      .map((match): ResolveHit | undefined => {
        const value = decodeHtmlEntities(match[1] ?? "");
        const professorName = pseudoField(value, "korName");
        if (!professorName) {
          return undefined;
        }

        const perId = pseudoField(value, "perId");
        const labUrl = firstNonEmpty(
          resolveUrl(pseudoField(value, "labUrl"), sourceUrl),
          resolveUrl(pseudoField(value, "urlHome"), sourceUrl),
          profileUrl(sourceUrl, perId),
        );
        if (!labUrl) {
          return undefined;
        }

        return {
          departmentName,
          professorName,
          labName: pseudoField(value, "labNm"),
          labUrl,
          researchText: pseudoResearchText(value),
          sourceUrl,
          note,
        };
      })
      .filter((hit): hit is ResolveHit => Boolean(hit));
  };
}

function parseSkkuCalResearchPage(html: string, sourceUrl: string): ResolveHit[] {
  const blocks = [...html.matchAll(/<dl\b[^>]*>([\s\S]*?)<\/dl>/gi)].map((match) => match[1] ?? "");

  return blocks
    .map((block): ResolveHit | undefined => {
      const rawLabName = block.match(/<dt\b[^>]*>([\s\S]*?)<\/dt>/i)?.[1];
      const labName = textFromHtml(rawLabName?.replace(/<span\b[\s\S]*?<\/span>/gi, " "));
      const professorName = textFromHtml(block.match(/<li\b[^>]*>\s*([^<]*?)\s*교수/i)?.[1]);
      const rawHref = block.match(/<li\b[^>]*>\s*[^<]*?\s*교수\s*<a\b[^>]*href=["']([^"']+)["']/i)?.[1];
      const labUrl = resolveUrl(rawHref, sourceUrl);
      const keyword = textFromHtml(block.match(/Key\s*words?\s*:\s*([\s\S]*?)<\/li>/i)?.[1]);
      const detail = textFromHtml(block.match(/class=["'][^"']*detail_lab[^"']*["'][^>]*>([\s\S]*?)<\/dd>/i)?.[1]);

      if (!professorName || !labUrl) {
        return undefined;
      }

      return {
        departmentName: "건설환경공학부",
        professorName,
        labName,
        labUrl,
        researchText: mergeResearchText(keyword, detail),
        sourceUrl,
        note: "skku_cal_research_page",
      };
    })
    .filter((hit): hit is ResolveHit => Boolean(hit));
}

function parseSkkuBiomedicalResearchPage(html: string, sourceUrl: string): ResolveHit[] {
  const blocks = html
    .split(/<li\b[^>]*class=["'][^"']*list_contents_00[^"']*["'][^>]*>/i)
    .slice(1)
    .map((chunk) => chunk.split(/<li\b[^>]*class=["'][^"']*list_contents_00[^"']*["'][^>]*>/i)[0] ?? chunk);

  return blocks
    .map((block): ResolveHit | undefined => {
      const detailHref = block.match(/<a\b(?=[^>]*class=["']title["'])[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1]
        ?? block.match(/<a\b(?=[^>]*class=["']name["'])[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1];
      const labUrl = resolveUrl(detailHref, sourceUrl);
      const labNameEn = textFromHtml(block.match(/<a\b(?=[^>]*class=["']title["'])[^>]*>([\s\S]*?)<\/a>/i)?.[1]);
      const labNameKo = textFromHtml(block.match(/<a\b(?=[^>]*class=["']desc_kor["'])[^>]*>([\s\S]*?)<\/a>/i)?.[1]);
      const professorName = textFromHtml(block.match(/<a\b(?=[^>]*class=["']name["'])[^>]*>[\s\S]*?<span\b[^>]*class=["']desc_kor["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
      const detail = textFromHtml(block.match(/<a\b(?=[^>]*class=["']info_01["'])[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/i)?.[1]);

      if (!professorName || !labUrl) {
        return undefined;
      }

      return {
        departmentName: "의학과",
        professorName,
        labName: firstNonEmpty(labNameKo, labNameEn),
        labUrl,
        researchText: mergeResearchText(labNameEn, detail),
        sourceUrl,
        note: "skku_biomedical_research_detail",
      };
    })
    .filter((hit): hit is ResolveHit => Boolean(hit));
}

function parseSkkuChemicalEngineeringFaculty(html: string, sourceUrl: string): ResolveHit[] {
  const blocks = html
    .split(/<div class=["'][^"']*w-person\s/i)
    .slice(1)
    .map((chunk) => `<div class="w-person ${chunk}`);

  return blocks
    .map((block): ResolveHit | undefined => {
      const nameAnchor = block.match(/<a\b(?=[^>]*class=["'][^"']*w-person-link[^"']*["'])[^>]*href=["']([^"']+)["'][^>]*aria-label=["']([^"']+)["']/i);
      const profileUrlValue = resolveUrl(nameAnchor?.[1], sourceUrl);
      const label = textFromHtml(nameAnchor?.[2]);
      const professorName = label?.match(/([가-힣]{2,4})\s*$/u)?.[1];
      if (!professorName || !profileUrlValue) {
        return undefined;
      }

      const links = [...block.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
        .map((match) => {
          const href = resolveUrl(match[1], sourceUrl);
          const text = textFromHtml(match[2]);
          return href && text ? { href, text } : undefined;
        })
        .filter((link): link is { href: string; text: string } => Boolean(link));
      const labLink = links.find((link) =>
        link.href !== profileUrlValue
        && !/youtube\.com|youtu\.be/i.test(link.href)
        && !/image|faculty|professor|youtube/i.test(link.text)
      );
      const description = textFromHtml(block.match(/<p\b[^>]*class=["'][^"']*w-person-role[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]);

      return {
        departmentName: "화학공학과",
        professorName,
        labName: labLink?.text,
        labUrl: labLink?.href ?? profileUrlValue,
        researchText: mergeResearchText(description, labLink?.text),
        sourceUrl,
        note: labLink ? "skku_cheme_faculty_lab_link" : "skku_cheme_faculty_profile",
      };
    })
    .filter((hit): hit is ResolveHit => Boolean(hit));
}

function parsePharmacyProfessorList(html: string, sourceUrl: string): Array<{ professorName: string; detailUrl: string; researchText?: string }> {
  const blocks = html
    .split(/<div class=["']prof_im["']>/i)
    .slice(1)
    .map((chunk) => `<div class="prof_im">${chunk.split(/<div class=["']prof_im["']>/i)[0] ?? chunk}`);

  return blocks
    .map((block) => {
      const professorName = textFromHtml(block.match(/<img\b[^>]*alt=["']([^"']+)["']/i)?.[1]);
      const rawDetailHref = block.match(/<a\b(?=[^>]*class=["'][^"']*bt_pop[^"']*["'])[^>]*href=["']([^"']+)["']/i)?.[1];
      const detailUrl = resolveUrl(rawDetailHref, sourceUrl);
      const researchText = textFromHtml(
        block.match(/ico-work["'][^>]*>[\s\S]*?<\/i>\s*<span>([\s\S]*?)<\/span>/i)?.[1],
      );

      if (!professorName || !detailUrl) {
        return undefined;
      }

      return {
        professorName: professorName.replace(/\s+/g, ""),
        detailUrl,
        researchText,
      };
    })
    .filter((item): item is { professorName: string; detailUrl: string; researchText?: string } => Boolean(item));
}

function extractPharmacyHomepage(detailHtml: string, detailUrl: string): string | undefined {
  const homepageBlock = detailHtml.match(/<span class=["']skip["']>\s*홈페이지\s*<\/span>\s*<a\b[^>]*href=["']([^"']+)["']/i);
  return resolveUrl(homepageBlock?.[1], detailUrl);
}

async function resolveSkkuPharmacyPage(sourceUrl: string): Promise<ResolveHit[]> {
  const html = await fetchHtml(sourceUrl);
  const professors = parsePharmacyProfessorList(html, sourceUrl);
  const hits: ResolveHit[] = [];

  for (const professor of professors) {
    const detailHtml = await fetchHtml(professor.detailUrl);
    const homepage = extractPharmacyHomepage(detailHtml, professor.detailUrl);
    hits.push({
      departmentName: "약학과",
      professorName: professor.professorName,
      labUrl: homepage ?? professor.detailUrl,
      researchText: professor.researchText,
      sourceUrl: professor.detailUrl,
      note: homepage ? "skku_pharmacy_professor_homepage" : "skku_pharmacy_professor_profile",
    });
  }

  return hits;
}

async function buildResolverHits(): Promise<ResolveHit[]> {
  const calUrl = "https://cal.skku.edu/index.php?hCode=FACULTY_02_02";
  const pharmacyUrl = "https://pharm.skku.edu/intro/professor01.php";
  const biomedicalUrl = "https://biomedical.skku.edu/eng/html/research/laboratory.asp";
  const facultySources: Array<{ url: string; parse: (html: string) => Promise<ResolveHit[]> | ResolveHit[] }> = [
    {
      url: "https://skb.skku.edu/cscience/intro/faculty_bio.do",
      parse: parseSkkuFacultyMetadataPage("https://skb.skku.edu/cscience/intro/faculty_bio.do", "생명과학과", "skku_common_faculty_metadata"),
    },
    {
      url: "https://skb.skku.edu/cscience/intro/faculty_physics.do",
      parse: parseSkkuFacultyMetadataPage("https://skb.skku.edu/cscience/intro/faculty_physics.do", "물리학과", "skku_common_faculty_metadata"),
    },
    {
      url: "https://skb.skku.edu/cscience/intro/faculty_chem.do",
      parse: parseSkkuFacultyMetadataPage("https://skb.skku.edu/cscience/intro/faculty_chem.do", "화학과", "skku_common_faculty_metadata"),
    },
    {
      url: "https://ice.skku.edu/ice/faculty_eee.do",
      parse: parseSkkuFacultyMetadataPage("https://ice.skku.edu/ice/faculty_eee.do", "전자전기공학부", "skku_common_faculty_metadata"),
    },
    {
      url: "https://ice.skku.edu/ice/faculty_grad_electronics.do",
      parse: parseSkkuFacultyMetadataPage("https://ice.skku.edu/ice/faculty_grad_electronics.do", "전자전기공학부", "skku_common_faculty_metadata"),
    },
    {
      url: "https://sw.skku.edu/sw/faculty.do",
      parse: parseSkkuFacultyMetadataPage("https://sw.skku.edu/sw/faculty.do", "소프트웨어학과", "skku_common_faculty_metadata"),
    },
    {
      url: "https://sme.skku.edu/iesys/faculty.do",
      parse: parseSkkuFacultyMetadataPage("https://sme.skku.edu/iesys/faculty.do", "시스템경영공학과", "skku_common_faculty_metadata"),
    },
    {
      url: "https://amse.skku.edu/AMSE/faculty.do",
      parse: parseSkkuFacultyMetadataPage("https://amse.skku.edu/AMSE/faculty.do", "신소재공학부", "skku_common_faculty_metadata"),
    },
    {
      url: "https://biotech.skku.edu/biotech/faculty_food.do",
      parse: parseSkkuFacultyMetadataPage("https://biotech.skku.edu/biotech/faculty_food.do", "식품생명공학과", "skku_common_faculty_metadata"),
    },
    {
      url: "https://biotech.skku.edu/biotech/faculty_mech.do",
      parse: parseSkkuFacultyMetadataPage("https://biotech.skku.edu/biotech/faculty_mech.do", "바이오메카트로닉스학과", "skku_common_faculty_metadata"),
    },
    {
      url: "https://energy.skku.edu/energy/faculty.do",
      parse: parseSkkuFacultyMetadataPage("https://energy.skku.edu/energy/faculty.do", "에너지과학과", "skku_common_faculty_metadata"),
    },
    {
      url: "https://sport.skku.edu/sports/intro/faculty.do",
      parse: parseSkkuFacultyMetadataPage("https://sport.skku.edu/sports/intro/faculty.do", "스포츠과학과", "skku_common_faculty_metadata"),
    },
    {
      url: "https://arch.skku.edu/arch/DEPARTMENT/faculty.do",
      parse: parseSkkuFacultyMetadataPage("https://arch.skku.edu/arch/DEPARTMENT/faculty.do", "건축학과", "skku_common_faculty_metadata"),
    },
    {
      url: "https://mech.skku.edu/me/faculty.do",
      parse: parseSkkuFacultyMetadataPage("https://mech.skku.edu/me/faculty.do", "기계공학부", "skku_common_faculty_metadata"),
    },
    {
      url: "https://cheme.skku.edu/faculty/",
      parse: (html) => parseSkkuChemicalEngineeringFaculty(html, "https://cheme.skku.edu/faculty/"),
    },
  ];

  const [calHtml, biomedicalHtml, pharmacyHits, facultyHits] = await Promise.all([
    fetchHtml(calUrl),
    fetchHtml(biomedicalUrl),
    resolveSkkuPharmacyPage(pharmacyUrl),
    Promise.all(facultySources.map(async (source) => source.parse(await fetchHtml(source.url)))),
  ]);

  return [...parseSkkuCalResearchPage(calHtml, calUrl), ...parseSkkuBiomedicalResearchPage(biomedicalHtml, biomedicalUrl), ...pharmacyHits, ...facultyHits.flat()];
}

function applyHits(report: SkkuDiscoveryReport, hits: ResolveHit[]) {
  const byDepartmentProfessor = new Map<string, ResolveHit[]>();
  for (const hit of hits) {
    const key = `${normalizeKey(hit.departmentName)}|${normalizeKey(hit.professorName)}`;
    byDepartmentProfessor.set(key, [...(byDepartmentProfessor.get(key) ?? []), hit]);
  }

  let filled = 0;
  let researchTextUpdated = 0;
  const applied: Array<{ departmentName: string; professorName?: string; labName?: string; labUrl: string; sourceUrl: string; note: string }> = [];

  for (const row of report.labCandidates) {
    if (!row.professorName) {
      continue;
    }

    const normalizedProfessor = normalizeKey(row.professorName);
    const key = `${normalizeKey(row.departmentName)}|${normalizedProfessor}`;
    const candidates = byDepartmentProfessor.get(key) ?? hits.filter((hit) =>
      normalizeKey(hit.departmentName) === normalizeKey(row.departmentName)
      && normalizedProfessor.includes(normalizeKey(hit.professorName)),
    );
    const hit = candidates.find((candidate) => {
      if (!candidate.labName || !row.labName) {
        return true;
      }
      return normalizeKey(candidate.labName) === normalizeKey(row.labName);
    }) ?? candidates[0];

    if (!hit) {
      continue;
    }

    if (!row.labUrl) {
      row.labUrl = hit.labUrl;
      row.externalResolverSourceUrl = hit.sourceUrl;
      row.externalResolverNote = hit.note;
      filled += 1;
    }

    const nextResearchText = mergeResearchText(row.researchText, hit.researchText);
    if (nextResearchText && nextResearchText !== row.researchText) {
      row.researchText = nextResearchText;
      researchTextUpdated += 1;
    }

    if (row.labUrl === hit.labUrl) {
      applied.push({
        departmentName: row.departmentName,
        professorName: row.professorName,
        labName: row.labName,
        labUrl: row.labUrl,
        sourceUrl: hit.sourceUrl,
        note: hit.note,
      });
    }
  }

  report.summary = {
    ...report.summary,
    externalResolvers: {
      ...((report.summary?.externalResolvers as Record<string, unknown> | undefined) ?? {}),
      skkuLabUrlResolver: {
        resolvedAt: new Date().toISOString(),
        availableHits: hits.length,
        filled,
        researchTextUpdated,
      },
    },
  };

  return { filled, researchTextUpdated, applied };
}

async function main() {
  const hits = await buildResolverHits();
  const results = [];

  for (const path of reportPaths) {
    const report = JSON.parse(await readFile(path, "utf8")) as SkkuDiscoveryReport;
    const result = applyHits(report, hits);
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    results.push({ path, ...result });
  }

  console.log(JSON.stringify({ hits: hits.length, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
