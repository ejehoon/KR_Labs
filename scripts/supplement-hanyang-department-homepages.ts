import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";
import { cleanText, uniqueBy } from "../packages/crawler/src/core/html.js";
import {
  enrichResearchEvidence,
  extractDepartmentHomepageFacultyAndLabs,
  type HanyangGraduateDiscoveryReport,
  type HanyangGraduateProgram,
  type HanyangLabCandidate,
} from "../packages/crawler/src/schools/hanyangGraduateDiscovery.js";
import { createSupabaseAdmin } from "../packages/db/src/index.js";

type DepartmentSupplement = {
  departmentName: string;
  colleges: string[];
  homepages: string[];
  reportLabCount: number;
  dbLabCount?: number;
  discoveredProfessorCount: number;
  discoveredLabCount: number;
  researchEvidenceCount: number;
  homepageLabUrlCount: number;
  risk: "high" | "medium" | "low" | "unknown";
  reason: string;
  labs: HanyangLabCandidate[];
  warnings: string[];
};

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      args.set(match[1] ?? "", match[2] ?? "");
    }
  }
  const output = args.get("output") ?? "reports/hanyang-department-homepage-supplement.html";
  return {
    report: args.get("report") ?? "reports/hanyang-grad-discovery.json",
    output,
    json: args.get("json") ?? output.replace(/\.html?$/i, ".json"),
    maxDepartments: optionalNumber(args.get("max-departments")),
    maxResearchEnrichmentLabs: optionalNumber(args.get("max-research-enrichment-labs")) ?? 120,
    concurrency: optionalNumber(args.get("concurrency")) ?? 4,
  };
}

function optionalNumber(value: string | undefined): number | undefined {
  if (!value) {
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

function assess(row: Omit<DepartmentSupplement, "risk" | "reason">): Pick<DepartmentSupplement, "risk" | "reason"> {
  const baseline = row.dbLabCount ?? row.reportLabCount;
  if (row.discoveredLabCount > 0 && baseline === 0) {
    return { risk: "high", reason: "공식 학과 홈페이지에서 교수/연구실 후보가 발견됐지만 현재 DB/리포트에는 없음" };
  }
  if (row.discoveredLabCount >= baseline + 5) {
    return { risk: "high", reason: "공식 학과 홈페이지 후보 수가 현재 DB/리포트보다 5개 이상 많음" };
  }
  if (row.discoveredLabCount > baseline) {
    return { risk: "medium", reason: "공식 학과 홈페이지 후보 수가 현재 DB/리포트보다 많음" };
  }
  if (row.discoveredLabCount > 0) {
    return { risk: "low", reason: "공식 학과 홈페이지 후보 수가 현재 DB/리포트와 같거나 적음" };
  }
  return { risk: "unknown", reason: "교수진/연구실 후보를 자동 탐지하지 못함" };
}

function renderHtml(rows: DepartmentSupplement[], generatedAt: string, args: ReturnType<typeof parseArgs>) {
  const metric = (label: string, value: unknown) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  const riskChip = (risk: DepartmentSupplement["risk"]) => `<span class="risk ${risk}">${escapeHtml(risk)}</span>`;
  const tableRows = rows.map((row) => {
    const sampleLabs = row.labs.slice(0, 12);
    return `
      <tr>
        <td>${riskChip(row.risk)}</td>
        <td><strong>${escapeHtml(row.departmentName)}</strong><div class="muted">${escapeHtml(row.colleges.join(", "))}</div></td>
        <td>${escapeHtml(row.dbLabCount ?? "n/a")}</td>
        <td>${escapeHtml(row.reportLabCount)}</td>
        <td>${escapeHtml(row.discoveredLabCount)}</td>
        <td>${escapeHtml(row.researchEvidenceCount)}</td>
        <td>${escapeHtml(row.reason)}</td>
        <td>${row.homepages.map((url) => `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`).join("<br>")}</td>
        <td>${sampleLabs.map((lab) => `<div><strong>${escapeHtml(lab.professorName)}</strong> ${escapeHtml(lab.email ?? "")}<br><a href="${escapeHtml(lab.labUrl)}">${escapeHtml(lab.labUrl)}</a></div>`).join("<hr>")}</td>
        <td>${sampleLabs.map((lab) => {
          const labels = lab.classification.matches.map((match) => match.labelKo).join(", ") || "미분류";
          return `<div><strong>${escapeHtml(lab.professorName)}</strong>: ${escapeHtml(labels)}<br>${escapeHtml((lab.homepageResearchText ?? lab.researchText ?? "").slice(0, 260))}</div>`;
        }).join("<hr>")}</td>
        <td>${row.warnings.map((warning) => `<div class="warn">${escapeHtml(warning).slice(0, 220)}</div>`).join("")}</td>
      </tr>
    `;
  }).join("");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>한양대 학과별 홈페이지 탐색 보강 후보</title>
  <style>
    :root { --ink:#172026; --muted:#65737d; --line:#dce3e8; --soft:#f6f8f9; --high:#a1321f; --medium:#936500; --low:#176045; --unknown:#57636e; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:#fff; }
    header { padding:34px 38px 24px; background:#f7faf9; border-bottom:1px solid var(--line); }
    main { padding:24px 38px 48px; max-width:1760px; }
    h1 { margin:0 0 8px; font-size:30px; letter-spacing:0; }
    p { color:var(--muted); line-height:1.6; }
    a { color:#115d8c; overflow-wrap:anywhere; }
    hr { border:0; border-top:1px solid var(--line); margin:8px 0; }
    .metrics { display:grid; grid-template-columns:repeat(6,minmax(130px,1fr)); gap:10px; margin-top:18px; }
    .metric { min-height:72px; border:1px solid var(--line); background:#fff; padding:13px 15px; }
    .metric span { display:block; color:var(--muted); font-size:13px; margin-bottom:8px; }
    .metric strong { font-size:25px; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th,td { padding:9px 10px; border-bottom:1px solid var(--line); vertical-align:top; text-align:left; }
    th { position:sticky; top:0; background:var(--soft); z-index:1; color:#34424b; }
    .muted { color:var(--muted); font-size:12px; margin-top:3px; }
    .warn { color:#8a4b00; margin:2px 0; }
    .risk { display:inline-flex; min-width:68px; justify-content:center; padding:3px 7px; color:#fff; font-weight:700; font-size:12px; }
    .risk.high { background:var(--high); }
    .risk.medium { background:var(--medium); }
    .risk.low { background:var(--low); }
    .risk.unknown { background:var(--unknown); }
  </style>
</head>
<body>
  <header>
    <h1>한양대 학과별 홈페이지 탐색 보강 후보</h1>
    <p>각 학과 홈페이지를 Playwright로 열고 교수진/연구실 후보와 Research evidence를 수집했습니다. 이 결과는 검증용이며 DB 자동 적재용이 아닙니다.</p>
    <p>입력: ${escapeHtml(args.report)} · 생성: ${escapeHtml(generatedAt)}</p>
    <div class="metrics">
      ${metric("학과", rows.length)}
      ${metric("High", rows.filter((row) => row.risk === "high").length)}
      ${metric("Medium", rows.filter((row) => row.risk === "medium").length)}
      ${metric("후보 연구실", rows.reduce((sum, row) => sum + row.discoveredLabCount, 0))}
      ${metric("Research evidence", rows.reduce((sum, row) => sum + row.researchEvidenceCount, 0))}
      ${metric("홈페이지 URL", rows.reduce((sum, row) => sum + row.homepageLabUrlCount, 0))}
    </div>
  </header>
  <main>
    <table>
      <thead>
        <tr>
          <th>위험도</th>
          <th>학과</th>
          <th>DB</th>
          <th>기존 리포트</th>
          <th>공식 후보</th>
          <th>Research</th>
          <th>판단</th>
          <th>학과 홈페이지</th>
          <th>후보 샘플</th>
          <th>Research/분류 샘플</th>
          <th>경고</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </main>
</body>
</html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = JSON.parse(await readFile(args.report, "utf8")) as HanyangGraduateDiscoveryReport;
  const dbCounts = await getSupabaseDepartmentCounts();
  const reportCounts = report.labCandidates.reduce<Record<string, number>>((counts, lab) => {
    counts[lab.departmentName] = (counts[lab.departmentName] ?? 0) + 1;
    return counts;
  }, {});
  const programsByDepartment = uniqueBy(report.programs, (program) => departmentKey(program.name))
    .map((program) => report.programs.filter((row) => departmentKey(row.name) === departmentKey(program.name)))
    .filter((programs) => programs.some((program) => program.homepageUrl))
    .slice(0, args.maxDepartments ?? Number.POSITIVE_INFINITY);

  const browser = await createBrowserManager();
  try {
    let remainingResearchEnrichment = args.maxResearchEnrichmentLabs;
    const rows = await mapWithConcurrency(programsByDepartment, args.concurrency, async (programs): Promise<DepartmentSupplement> => {
      const canonical = programs[0] as HanyangGraduateProgram;
      const homepages = uniqueBy(programs.map((program) => normalizeUrl(program.homepageUrl)).filter((url): url is string => Boolean(url)), (url) => url);
      const colleges = [...new Set(programs.map((program) => program.collegeName))];
      const warnings: string[] = [];
      let labs: HanyangLabCandidate[] = [];
      let professorCount = 0;
      for (const homepage of homepages) {
        try {
          const enriched = await extractDepartmentHomepageFacultyAndLabs(browser.context, { ...canonical, homepageUrl: homepage });
          professorCount += enriched.professors.length;
          labs = [...labs, ...enriched.labs];
        } catch (error) {
          warnings.push(`homepage_failed:${homepage}:${error instanceof Error ? error.message : String(error)}`);
        }
      }
      labs = uniqueBy(labs, (lab) => `${lab.professorName ?? ""}|${lab.email ?? ""}|${normalizeUrl(lab.labUrl) ?? ""}`);

      const researchBudget = Math.max(0, Math.min(remainingResearchEnrichment, labs.filter((lab) => lab.labHomepageUrl).length));
      remainingResearchEnrichment -= researchBudget;
      if (researchBudget > 0) {
        await enrichResearchEvidence(browser.context, labs, researchBudget);
      } else {
        for (const lab of labs) {
          lab.classification = lab.classification.matches.length > 0 ? lab.classification : lab.classification;
        }
      }

      const base = {
        departmentName: canonical.name,
        colleges,
        homepages,
        reportLabCount: reportCounts[canonical.name] ?? 0,
        dbLabCount: dbCounts?.[canonical.name],
        discoveredProfessorCount: professorCount,
        discoveredLabCount: labs.length,
        researchEvidenceCount: labs.filter((lab) => lab.homepageResearchText).length,
        homepageLabUrlCount: labs.filter((lab) => lab.labHomepageUrl).length,
        labs,
        warnings: [...warnings, ...labs.flatMap((lab) => lab.warnings.map((warning) => `${lab.professorName ?? lab.labName}: ${warning}`))],
      };
      return { ...base, ...assess(base) };
    });

    const sorted = rows.sort((a, b) => {
      const rank = { high: 0, medium: 1, unknown: 2, low: 3 };
      return rank[a.risk] - rank[b.risk]
        || (b.discoveredLabCount - (b.dbLabCount ?? b.reportLabCount)) - (a.discoveredLabCount - (a.dbLabCount ?? a.reportLabCount))
        || a.departmentName.localeCompare(b.departmentName);
    });
    const generatedAt = new Date().toISOString();
    await mkdir("reports", { recursive: true });
    await writeFile(args.json, `${JSON.stringify({ generatedAt, args, rows: sorted }, null, 2)}\n`, "utf8");
    await writeFile(args.output, renderHtml(sorted, generatedAt, args), "utf8");
    console.log(JSON.stringify({
      htmlPath: args.output,
      jsonPath: args.json,
      generatedAt,
      departments: sorted.length,
      high: sorted.filter((row) => row.risk === "high").length,
      medium: sorted.filter((row) => row.risk === "medium").length,
      discoveredLabs: sorted.reduce((sum, row) => sum + row.discoveredLabCount, 0),
      researchEvidence: sorted.reduce((sum, row) => sum + row.researchEvidenceCount, 0),
      topHigh: sorted.filter((row) => row.risk === "high").slice(0, 10).map((row) => ({
        department: row.departmentName,
        dbLabCount: row.dbLabCount,
        reportLabCount: row.reportLabCount,
        discoveredLabCount: row.discoveredLabCount,
        researchEvidenceCount: row.researchEvidenceCount,
      })),
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
