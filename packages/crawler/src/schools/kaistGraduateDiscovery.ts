import type { BrowserContext } from "playwright";

export type KaistGraduateDepartmentSeed = {
  collegeName: string;
  departmentName: string;
  phone?: string;
  location?: string;
  homepageUrl?: string;
  admissionUrl?: string;
};

export type FacultySeed = {
  nameKo?: string;
  nameEn?: string;
  labUrl?: string;
  source: "department_page" | "spa_bundle";
};

export type LabPageProbe = {
  labUrl: string;
  title?: string;
  memberPageUrl?: string;
  publicationPageUrl?: string;
  candidateLinks: Array<{ label: string; url: string; kind: "members" | "publications" | "unknown" }>;
};

export type DepartmentDiscoveryResult = KaistGraduateDepartmentSeed & {
  faculty: FacultySeed[];
  labProbes: LabPageProbe[];
};

export type KaistGraduateDiscoveryReport = {
  sourceUrl: string;
  generatedAt: string;
  departments: DepartmentDiscoveryResult[];
};

const defaultCollegeNames = ["AI 대학"];
const memberLabelPattern = /members?|people|member|구성원|학생|연구원|team/i;
const publicationLabelPattern = /publications?|papers?|논문|연구성과|research output/i;
const kaistDepartmentApiBaseUrl = "https://admission.kaist.ac.kr/wz/admission/deptOffice";

type KaistDepartmentApiRow = {
  deptId?: string;
  deptNm?: string;
  upDeptNm?: string;
  deptTelno?: string;
  deptUrl?: string;
  deptInfo1?: string;
  deptInfo2?: string;
};

function cleanText(input: string | undefined): string | undefined {
  const value = input?.replace(/\s+/g, " ").trim();
  return value || undefined;
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

function uniqueBy<T>(items: T[], key: (item: T) => string | undefined): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const value = key(item);
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    output.push(item);
  }
  return output;
}

async function discoverDepartmentsForCollege(
  _context: BrowserContext,
  sourceUrl: string,
  collegeName: string,
): Promise<KaistGraduateDepartmentSeed[]> {
  const rootJson = await fetchText(`${kaistDepartmentApiBaseUrl}/KAIST`);
  const rootRows = rootJson ? (JSON.parse(rootJson) as { data?: KaistDepartmentApiRow[] }).data ?? [] : [];
  const college = rootRows.find((row) => cleanText(row.deptNm) === collegeName);

  if (!college?.deptId) {
    throw new Error(`KAIST college not found from ${sourceUrl}: ${collegeName}`);
  }

  const departmentJson = await fetchText(`${kaistDepartmentApiBaseUrl}/${college.deptId}`);
  const departmentRows = departmentJson ? (JSON.parse(departmentJson) as { data?: KaistDepartmentApiRow[] }).data ?? [] : [];

  return departmentRows
    .map((row) => ({
      collegeName,
      departmentName: cleanText(row.deptNm) ?? "",
      phone: cleanText(row.deptTelno),
      location: cleanText(row.deptInfo1),
      homepageUrl: resolveUrl(row.deptUrl, sourceUrl),
      admissionUrl: resolveUrl(row.deptInfo2, sourceUrl),
    }))
    .filter((item) => item.departmentName.length > 0);
}

function extractScriptSrcs(html: string, baseUrl: string): string[] {
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => resolveUrl(match[1], baseUrl))
    .filter((value): value is string => Boolean(value));
  return uniqueBy(scripts, (url) => url);
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

async function discoverFacultyFromSpaBundle(homepageUrl: string): Promise<FacultySeed[]> {
  const html = await fetchText(homepageUrl);
  if (!html) {
    return [];
  }

  const scripts = extractScriptSrcs(html, homepageUrl);
  const faculty: FacultySeed[] = [];

  for (const scriptUrl of scripts) {
    const script = await fetchText(scriptUrl);
    if (!script || !/website:/.test(script)) {
      continue;
    }

    for (const match of script.matchAll(/\{ko:"([^"]+)",en:"([^"]+)"[^{}]*?website:"([^"]+)"/g)) {
      faculty.push({
        nameKo: cleanText(match[1]),
        nameEn: cleanText(match[2]),
        labUrl: resolveUrl(match[3], homepageUrl),
        source: "spa_bundle",
      });
    }
  }

  return uniqueBy(faculty, (item) => `${item.nameKo ?? ""}|${item.nameEn ?? ""}|${item.labUrl ?? ""}`);
}

function extractHtmlLinks(html: string, baseUrl: string): Array<{ label: string; url: string }> {
  return [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis)]
    .map((match) => {
      const url = resolveUrl(match[1], baseUrl);
      const label = cleanText(match[2]?.replace(/<[^>]+>/g, " "));
      return url && label ? { label, url } : undefined;
    })
    .filter((value): value is { label: string; url: string } => Boolean(value));
}

async function discoverFacultyFromHtmlPages(homepageUrl: string): Promise<FacultySeed[]> {
  const homepageHtml = await fetchText(homepageUrl);
  if (!homepageHtml) {
    return [];
  }

  const facultyPageUrls = uniqueBy(
    [
      homepageUrl,
      ...["faculty", "faculty-fulltime", "faculty-fulltime.html", "faculty-adjunct", "people", "members", "professors"].map((path) =>
        new URL(path, homepageUrl.endsWith("/") ? homepageUrl : `${homepageUrl}/`).toString(),
      ),
      ...extractHtmlLinks(homepageHtml, homepageUrl)
        .filter((link) => /faculty|professor|people|교수|교수진|구성원/i.test(`${link.label} ${link.url}`))
        .map((link) => link.url),
    ],
    (url) => url,
  ).slice(0, 8);

  const faculty: FacultySeed[] = [];
  for (const pageUrl of facultyPageUrls) {
    const html = pageUrl === homepageUrl ? homepageHtml : await fetchText(pageUrl);
    if (!html) {
      continue;
    }

    for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]{0,1600}?<h4[^>]*>(.*?)<\/h4>[\s\S]{0,700}?(?:Professor|교수)/gis)) {
      const nameText = cleanText(match[2]?.replace(/<[^>]+>/g, " "));
      if (!nameText) {
        continue;
      }

      faculty.push({
        nameKo: cleanText(nameText.replace(/\s*교수\s*$/, "")),
        labUrl: resolveUrl(match[1], pageUrl),
        source: "department_page",
      });
    }
  }

  return uniqueBy(faculty, (item) => `${item.nameKo ?? ""}|${item.labUrl ?? ""}`);
}

async function discoverFacultyFromDepartmentPage(context: BrowserContext, homepageUrl: string): Promise<FacultySeed[]> {
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(12_000);

  try {
    await page.goto(homepageUrl, { waitUntil: "domcontentloaded", timeout: 12_000 });
    await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);

    return page.evaluate(() => {
      const links = [...document.querySelectorAll("a[href]")] as HTMLAnchorElement[];
      return links
        .map((anchor) => {
          const text = anchor.textContent?.replace(/\s+/g, " ").trim() ?? "";
          const containerText = anchor.closest("article,li,div,section")?.textContent?.replace(/\s+/g, " ").trim() ?? text;
          const looksLikeFaculty = /교수|professor|faculty/i.test(containerText);
          const looksLikeLab = /lab|laboratory|연구실|group/i.test(containerText + " " + anchor.href);
          if (!looksLikeFaculty && !looksLikeLab) {
            return undefined;
          }

          const koreanName = containerText.match(/[가-힣]{2,5}(?=\s*(교수|Professor|professor)?)/)?.[0];
          const englishName = containerText.match(/[A-Z][a-z]+(?:[- ][A-Z][a-z]+){1,3}/)?.[0];
          return {
            nameKo: koreanName,
            nameEn: englishName,
            labUrl: anchor.href,
            source: "department_page" as const,
          };
        })
        .filter(Boolean) as FacultySeed[];
    });
  } catch {
    return [];
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function discoverFacultySeeds(context: BrowserContext, homepageUrl: string): Promise<FacultySeed[]> {
  const [htmlFaculty, bundleFaculty] = await Promise.all([
    discoverFacultyFromHtmlPages(homepageUrl),
    discoverFacultyFromSpaBundle(homepageUrl),
  ]);
  const merged = uniqueBy([...htmlFaculty, ...bundleFaculty], (item) => `${item.nameKo ?? ""}|${item.nameEn ?? ""}|${item.labUrl ?? ""}`);

  if (merged.length > 0) {
    return merged;
  }

  if (process.env.KR_LABS_ENABLE_PLAYWRIGHT_FACULTY_FALLBACK === "true") {
    const pageFaculty = await discoverFacultyFromDepartmentPage(context, homepageUrl);
    return uniqueBy(pageFaculty, (item) => `${item.nameKo ?? ""}|${item.nameEn ?? ""}|${item.labUrl ?? ""}`);
  }

  return [];
}

export async function probeLabSite(labUrl: string): Promise<LabPageProbe> {
  const html = await fetchText(labUrl);
  if (!html) {
    return { labUrl, candidateLinks: [] };
  }

  const title = cleanText(html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.replace(/<[^>]+>/g, ""));
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis)]
    .map((match) => {
      const url = resolveUrl(match[1], labUrl);
      const label = cleanText(match[2]?.replace(/<[^>]+>/g, " "));
      if (!url || !label) {
        return undefined;
      }

      const kind = memberLabelPattern.test(`${label} ${url}`)
        ? "members"
        : publicationLabelPattern.test(`${label} ${url}`)
          ? "publications"
          : "unknown";
      return { label, url, kind };
    })
    .filter((value): value is LabPageProbe["candidateLinks"][number] => Boolean(value))
    .filter((link) => link.kind !== "unknown");

  const candidateLinks = uniqueBy(links, (link) => `${link.kind}|${link.url}`);

  return {
    labUrl,
    title,
    memberPageUrl: candidateLinks.find((link) => link.kind === "members")?.url,
    publicationPageUrl: candidateLinks.find((link) => link.kind === "publications")?.url,
    candidateLinks,
  };
}

export async function discoverKaistGraduateSeeds(
  context: BrowserContext,
  options?: {
    sourceUrl?: string;
    collegeNames?: string[];
    maxLabProbesPerDepartment?: number;
  },
): Promise<KaistGraduateDiscoveryReport> {
  const sourceUrl = options?.sourceUrl ?? "https://admission.kaist.ac.kr/graduate/about/hakwa";
  const collegeNames = options?.collegeNames ?? defaultCollegeNames;
  const maxLabProbesPerDepartment = options?.maxLabProbesPerDepartment ?? 5;
  const departments: DepartmentDiscoveryResult[] = [];

  for (const collegeName of collegeNames) {
    const departmentSeeds = await discoverDepartmentsForCollege(context, sourceUrl, collegeName);

    for (const department of departmentSeeds) {
      const faculty = department.homepageUrl ? await discoverFacultySeeds(context, department.homepageUrl) : [];
      const labProbes = await Promise.all(
        faculty
          .map((item) => item.labUrl)
          .filter((value): value is string => Boolean(value))
          .slice(0, maxLabProbesPerDepartment)
          .map((url) => probeLabSite(url)),
      );
      departments.push({ ...department, faculty, labProbes });
    }
  }

  return {
    sourceUrl,
    generatedAt: new Date().toISOString(),
    departments,
  };
}
