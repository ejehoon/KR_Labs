import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { BrowserContext } from "playwright";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";
import { snapshotPlaywrightPage, type PlaywrightPageSnapshot } from "../packages/crawler/src/core/playwrightExtract.js";
import { cleanText, uniqueBy } from "../packages/crawler/src/core/html.js";
import { createSupabaseAdmin } from "../packages/db/src/index.js";
import type { HanyangGraduateDiscoveryReport } from "../packages/crawler/src/schools/hanyangGraduateDiscovery.js";

type AuditArgs = {
  report: string;
  output: string;
  json: string;
  maxDepartments?: number;
  concurrency: number;
  onlySuspects: boolean;
};

type FacultyProbe = {
  url: string;
  status?: number;
  title?: string;
  candidateCount: number;
  visibleProfileCount: number;
  educationProfileCount: number;
  emailCount: number;
  homepageLinkCount: number;
  sampleNames: string[];
  sampleHomepages: string[];
  warnings: string[];
};

type DepartmentAudit = {
  departmentName: string;
  colleges: string[];
  homepages: string[];
  reportLabCount: number;
  dbLabCount?: number;
  bestFacultyUrl?: string;
  officialFacultyCandidateCount: number;
  homepageLinkCount: number;
  sampleNames: string[];
  sampleHomepages: string[];
  risk: "high" | "medium" | "low" | "unknown";
  reason: string;
  probes: FacultyProbe[];
  warnings: string[];
};

function parseArgs(argv: string[]): AuditArgs {
  const args = new Map<string, string | boolean>();
  for (const arg of argv) {
    if (arg === "--only-suspects") {
      args.set("only-suspects", true);
      continue;
    }
    if (arg === "--all") {
      args.set("only-suspects", false);
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      args.set(match[1] ?? "", match[2] ?? "");
    }
  }
  const output = String(args.get("output") ?? "reports/hanyang-homepage-coverage-audit.html");
  return {
    report: String(args.get("report") ?? "reports/hanyang-grad-discovery.json"),
    output,
    json: String(args.get("json") ?? output.replace(/\.html?$/i, ".json")),
    maxDepartments: optionalNumber(args.get("max")),
    concurrency: optionalNumber(args.get("concurrency")) ?? 5,
    onlySuspects: args.get("only-suspects") !== false,
  };
}

function optionalNumber(value: string | boolean | undefined): number | undefined {
  if (typeof value !== "string" || !value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

function departmentKey(name: string): string {
  return name.replace(/\s+/g, "").replace(/[·ㆍ・ꞏ]/g, "");
}

function candidateFacultyUrls(homepage: string, snapshot: PlaywrightPageSnapshot | undefined): string[] {
  const urls: string[] = [];
  const push = (url: string | undefined) => {
    const normalized = normalizeUrl(url);
    if (normalized && /^https?:\/\//i.test(normalized)) {
      urls.push(normalized);
    }
  };

  for (const link of snapshot?.links ?? []) {
    const haystack = `${link.text} ${link.href}`;
    if (/교수소개|교수진|교원|faculty|professors?|people/i.test(haystack)) {
      push(link.href);
    }
  }

  try {
    const url = new URL(homepage);
    const path = url.pathname.replace(/\/+$/, "");
    const origin = url.origin;
    push(`${origin}/faculty`);
    push(`${origin}/professor`);
    push(`${origin}/people`);
    push(`${origin}/members`);
    if (/\/dean$/i.test(path)) {
      push(`${origin}${path.replace(/\/dean$/i, "/professor")}`);
    }
    if (/\/class$/i.test(path)) {
      push(`${origin}${path.replace(/\/class$/i, "/professor")}`);
    }
    if (/\/introduce$/i.test(path)) {
      push(`${origin}${path.replace(/\/introduce$/i, "/professor")}`);
    }
  } catch {
    // ignore malformed homepage
  }

  return uniqueBy(urls, (url) => url).slice(0, 8);
}

async function probeFacultyPage(context: BrowserContext, url: string): Promise<FacultyProbe> {
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  page.setDefaultNavigationTimeout(18_000);
  const warnings: string[] = [];
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 18_000 }).catch(async (error: unknown) => {
      if (error instanceof Error && /Timeout/i.test(error.message)) {
        warnings.push("domcontentloaded_timeout_commit_fallback");
        return page.goto(url, { waitUntil: "commit", timeout: 18_000 });
      }
      throw error;
    });
    await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => undefined);

    const data = await page.evaluate(() => {
      const clean = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
      const visibleProfileCards = [...document.querySelectorAll<HTMLElement>(".hyu-fragment-component-profile")]
        .filter((card) => Boolean(card.offsetParent));
      const hyuProfiles = visibleProfileCards.map((card) => {
        const rawName = clean(card.querySelector(".hyu-profile-info-title-name")?.textContent);
        const position = clean(card.querySelector(".hyu-profile-info-title-position")?.textContent);
        const name = !/[가-힣]/.test(rawName) && /^[가-힣]{2,5}$/.test(position) ? position : rawName;
        const homepages = [...card.querySelectorAll<HTMLAnchorElement>("a[href]")]
          .map((link) => link.href || link.getAttribute("href") || "")
          .filter((href) => /^https?:\/\//i.test(href) && !href.includes(location.hostname));
        return { name, homepages };
      }).filter((row) => row.name);

      const educationProfiles = [...document.querySelectorAll<HTMLElement>(".module-professor-class > ul:not(.special) > li")]
        .filter((card) => Boolean(card.offsetParent))
        .map((card) => {
          const name = clean(card.querySelector(".subject strong")?.textContent);
          const homepages = [...card.querySelectorAll<HTMLAnchorElement>("a.website[href]")]
            .map((link) => link.href || link.getAttribute("href") || "")
            .filter((href) => /^https?:\/\//i.test(href) && !/#website$/i.test(href));
          return { name, homepages };
        }).filter((row) => row.name);

      const bodyText = clean(document.body?.innerText);
      const emails = [...new Set(bodyText.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? [])];
      const rows = [...hyuProfiles, ...educationProfiles];
      return {
        title: document.title,
        visibleProfileCount: hyuProfiles.length,
        educationProfileCount: educationProfiles.length,
        emailCount: emails.length,
        homepageLinks: rows.flatMap((row) => row.homepages),
        names: rows.map((row) => row.name),
      };
    });

    const candidateCount = data.visibleProfileCount + data.educationProfileCount;
    return {
      url,
      status: response?.status(),
      title: data.title,
      candidateCount,
      visibleProfileCount: data.visibleProfileCount,
      educationProfileCount: data.educationProfileCount,
      emailCount: data.emailCount,
      homepageLinkCount: uniqueBy(data.homepageLinks, (href) => href).length,
      sampleNames: data.names.slice(0, 12),
      sampleHomepages: uniqueBy(data.homepageLinks, (href) => href).slice(0, 12),
      warnings,
    };
  } catch (error) {
    return {
      url,
      candidateCount: 0,
      visibleProfileCount: 0,
      educationProfileCount: 0,
      emailCount: 0,
      homepageLinkCount: 0,
      sampleNames: [],
      sampleHomepages: [],
      warnings: [error instanceof Error ? error.message : String(error)],
    };
  } finally {
    await page.close();
  }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

async function getSupabaseDepartmentCounts(): Promise<Record<string, number> | undefined> {
  try {
    const client = createSupabaseAdmin();
    const { data: university, error: universityError } = await client
      .from("universities")
      .select("id")
      .eq("name", "한양대학교")
      .maybeSingle();
    if (universityError || !university) {
      return undefined;
    }
    const { data, error } = await client
      .from("professors")
      .select("department")
      .eq("university_id", university.id);
    if (error) {
      return undefined;
    }
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const department = cleanText(row.department);
      if (department) {
        counts[department] = (counts[department] ?? 0) + 1;
      }
    }
    return counts;
  } catch {
    return undefined;
  }
}

function assessRisk(row: Omit<DepartmentAudit, "risk" | "reason">): Pick<DepartmentAudit, "risk" | "reason"> {
  const baseline = row.dbLabCount ?? row.reportLabCount;
  if (row.officialFacultyCandidateCount > 0 && baseline === 0) {
    return { risk: "high", reason: "공식 교수진 후보가 있지만 DB/리포트 연구실이 없음" };
  }
  if (row.officialFacultyCandidateCount >= baseline + 5) {
    return { risk: "high", reason: "공식 교수진 후보 수가 현재 연구실 수보다 5명 이상 많음" };
  }
  if (row.officialFacultyCandidateCount > baseline) {
    return { risk: "medium", reason: "공식 교수진 후보 수가 현재 연구실 수보다 많음" };
  }
  if (row.officialFacultyCandidateCount > 0) {
    return { risk: "low", reason: "공식 교수진 후보 수가 현재 연구실 수와 같거나 적음" };
  }
  return { risk: "unknown", reason: "공식 교수진 후보를 자동 탐지하지 못함" };
}

function renderHtml(rows: DepartmentAudit[], args: AuditArgs, generatedAt: string): string {
  const high = rows.filter((row) => row.risk === "high");
  const medium = rows.filter((row) => row.risk === "medium");
  const unknown = rows.filter((row) => row.risk === "unknown");
  const metric = (label: string, value: unknown) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  const riskChip = (risk: DepartmentAudit["risk"]) => `<span class="risk ${risk}">${escapeHtml(risk)}</span>`;
  const rowHtml = rows.map((row) => `
    <tr>
      <td>${riskChip(row.risk)}</td>
      <td>
        <strong>${escapeHtml(row.departmentName)}</strong>
        <div class="muted">${escapeHtml(row.colleges.join(", "))}</div>
      </td>
      <td>${escapeHtml(row.dbLabCount ?? "n/a")}</td>
      <td>${escapeHtml(row.reportLabCount)}</td>
      <td>${escapeHtml(row.officialFacultyCandidateCount)}</td>
      <td>${escapeHtml(row.homepageLinkCount)}</td>
      <td>${escapeHtml(row.reason)}</td>
      <td>${row.bestFacultyUrl ? `<a href="${escapeHtml(row.bestFacultyUrl)}">${escapeHtml(row.bestFacultyUrl)}</a>` : ""}</td>
      <td>${row.sampleNames.map((name) => `<span class="chip">${escapeHtml(name)}</span>`).join("")}</td>
      <td>${row.sampleHomepages.map((url) => `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`).join("<br>")}</td>
      <td>${row.homepages.map((url) => `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`).join("<br>")}</td>
      <td>${row.warnings.map((warning) => `<div class="warn">${escapeHtml(warning).slice(0, 180)}</div>`).join("")}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>한양대 학과 홈페이지 보강 점검</title>
  <style>
    :root { --ink:#172026; --muted:#66727c; --line:#dce3e8; --soft:#f6f8f9; --high:#a1321f; --medium:#936500; --low:#176045; --unknown:#57636e; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:#fff; }
    header { padding:34px 38px 24px; background:#f7faf9; border-bottom:1px solid var(--line); }
    main { padding:24px 38px 48px; max-width:1680px; }
    h1 { margin:0 0 8px; font-size:30px; letter-spacing:0; }
    p { color:var(--muted); line-height:1.6; }
    a { color:#115d8c; overflow-wrap:anywhere; }
    .metrics { display:grid; grid-template-columns:repeat(6,minmax(130px,1fr)); gap:10px; margin-top:18px; }
    .metric { min-height:72px; border:1px solid var(--line); background:#fff; padding:13px 15px; }
    .metric span { display:block; color:var(--muted); font-size:13px; margin-bottom:8px; }
    .metric strong { font-size:25px; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th,td { padding:9px 10px; border-bottom:1px solid var(--line); vertical-align:top; text-align:left; }
    th { position:sticky; top:0; background:var(--soft); z-index:1; color:#34424b; }
    .muted { color:var(--muted); font-size:12px; margin-top:3px; }
    .chip { display:inline-flex; margin:2px 4px 2px 0; padding:2px 7px; min-height:22px; align-items:center; border:1px solid #c7d4db; background:#f8fbfc; }
    .warn { color:#8a4b00; margin:2px 0; }
    .risk { display:inline-flex; min-width:68px; justify-content:center; padding:3px 7px; color:#fff; font-weight:700; font-size:12px; }
    .risk.high { background:var(--high); }
    .risk.medium { background:var(--medium); }
    .risk.low { background:var(--low); }
    .risk.unknown { background:var(--unknown); }
    @media (max-width:1000px) { header,main{padding-left:18px;padding-right:18px}.metrics{grid-template-columns:repeat(2,minmax(120px,1fr))} table{font-size:12px} }
  </style>
</head>
<body>
  <header>
    <h1>한양대 학과 홈페이지 보강 점검</h1>
    <p>현재 DB/리포트 연구실 수와 학과 공식 홈페이지의 교수진 후보 수를 비교한 리포트입니다. 신규 카테고리는 여기서 확정하지 않고, 누락 가능성만 검토 대상으로 표시합니다.</p>
    <p>입력: ${escapeHtml(args.report)} · 생성: ${escapeHtml(generatedAt)}</p>
    <div class="metrics">
      ${metric("점검 학과", rows.length)}
      ${metric("High", high.length)}
      ${metric("Medium", medium.length)}
      ${metric("Unknown", unknown.length)}
      ${metric("공식 교수 후보", rows.reduce((sum, row) => sum + row.officialFacultyCandidateCount, 0))}
      ${metric("홈페이지 링크", rows.reduce((sum, row) => sum + row.homepageLinkCount, 0))}
    </div>
  </header>
  <main>
    <table>
      <thead>
        <tr>
          <th>위험도</th>
          <th>학과</th>
          <th>DB 수</th>
          <th>리포트 수</th>
          <th>공식 교수 후보</th>
          <th>교수 홈페이지</th>
          <th>판단</th>
          <th>탐지 교수진 URL</th>
          <th>샘플 교수</th>
          <th>샘플 홈페이지</th>
          <th>학과 홈페이지</th>
          <th>경고</th>
        </tr>
      </thead>
      <tbody>${rowHtml}</tbody>
    </table>
  </main>
</body>
</html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = JSON.parse(await readFile(args.report, "utf8")) as HanyangGraduateDiscoveryReport;
  const dbCounts = await getSupabaseDepartmentCounts();
  const reportCounts = report.labCandidates.reduce<Record<string, number>>((counts, candidate) => {
    counts[candidate.departmentName] = (counts[candidate.departmentName] ?? 0) + 1;
    return counts;
  }, {});

  const departments = uniqueBy(report.programs, (program) => departmentKey(program.name))
    .map((program) => {
      const programs = report.programs.filter((row) => departmentKey(row.name) === departmentKey(program.name));
      return {
        departmentName: program.name,
        colleges: [...new Set(programs.map((row) => row.collegeName))],
        homepages: uniqueBy(programs.map((row) => normalizeUrl(row.homepageUrl)).filter((url): url is string => Boolean(url)), (url) => url),
        reportLabCount: reportCounts[program.name] ?? 0,
        dbLabCount: dbCounts?.[program.name],
      };
    })
    .filter((row) => row.homepages.length > 0)
    .filter((row) => !args.onlySuspects || row.reportLabCount === 0 || (row.dbLabCount ?? row.reportLabCount) === 0 || row.homepages.length > 0)
    .slice(0, args.maxDepartments ?? Number.POSITIVE_INFINITY);

  const browser = await createBrowserManager();
  try {
    const audited = await mapWithConcurrency(departments, args.concurrency, async (department): Promise<DepartmentAudit> => {
      const probes: FacultyProbe[] = [];
      const warnings: string[] = [];
      for (const homepage of department.homepages) {
        let snapshot: PlaywrightPageSnapshot | undefined;
        try {
          snapshot = await snapshotPlaywrightPage(browser.context, homepage);
        } catch (error) {
          warnings.push(`homepage_failed:${homepage}:${error instanceof Error ? error.message : String(error)}`);
        }
        const urls = candidateFacultyUrls(homepage, snapshot);
        for (const url of urls) {
          const probe = await probeFacultyPage(browser.context, url);
          probes.push(probe);
          if (probe.candidateCount > 0) {
            break;
          }
        }
      }

      const best = probes.sort((a, b) => b.candidateCount - a.candidateCount || b.emailCount - a.emailCount)[0];
      const base = {
        ...department,
        bestFacultyUrl: best?.candidateCount ? best.url : undefined,
        officialFacultyCandidateCount: best?.candidateCount ?? 0,
        homepageLinkCount: best?.homepageLinkCount ?? 0,
        sampleNames: best?.sampleNames ?? [],
        sampleHomepages: best?.sampleHomepages ?? [],
        probes,
        warnings: [...warnings, ...probes.flatMap((probe) => probe.warnings.map((warning) => `${probe.url}: ${warning}`))],
      };
      return { ...base, ...assessRisk(base) };
    });

    const rows = audited.sort((a, b) => {
      const rank = { high: 0, medium: 1, unknown: 2, low: 3 };
      return rank[a.risk] - rank[b.risk]
        || (b.officialFacultyCandidateCount - (b.dbLabCount ?? b.reportLabCount)) - (a.officialFacultyCandidateCount - (a.dbLabCount ?? a.reportLabCount))
        || a.departmentName.localeCompare(b.departmentName);
    });

    const generatedAt = new Date().toISOString();
    await mkdir("reports", { recursive: true });
    await writeFile(args.json, `${JSON.stringify({ generatedAt, args, rows }, null, 2)}\n`, "utf8");
    await writeFile(args.output, renderHtml(rows, args, generatedAt), "utf8");
    console.log(JSON.stringify({
      htmlPath: args.output,
      jsonPath: args.json,
      generatedAt,
      departments: rows.length,
      high: rows.filter((row) => row.risk === "high").length,
      medium: rows.filter((row) => row.risk === "medium").length,
      unknown: rows.filter((row) => row.risk === "unknown").length,
      topHigh: rows.filter((row) => row.risk === "high").slice(0, 12).map((row) => ({
        department: row.departmentName,
        dbLabCount: row.dbLabCount,
        reportLabCount: row.reportLabCount,
        officialFacultyCandidateCount: row.officialFacultyCandidateCount,
        bestFacultyUrl: row.bestFacultyUrl,
      })),
      sourceReport: basename(args.report),
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
