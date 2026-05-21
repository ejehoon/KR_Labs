import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { HanyangGraduateDiscoveryReport, HanyangLabCandidate } from "../packages/crawler/src/schools/hanyangGraduateDiscovery.js";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      args.set(match[1] ?? "", match[2] ?? "");
    }
  }
  return {
    input: args.get("input") ?? "reports/hanyang-grad-discovery.json",
    output: args.get("output") ?? "reports/hanyang-grad-overall-report.html",
  };
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

function metric(label: string, value: number | string): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function rows(entries: Array<[string, number]>, limit = 30): string {
  return entries.slice(0, limit).map(([label, count]) => `<tr><td>${escapeHtml(label)}</td><td>${count}</td></tr>`).join("");
}

function reviewRows(labs: HanyangLabCandidate[]): string {
  return labs.slice(0, 80).map((lab) => `
    <tr>
      <td>${escapeHtml(lab.departmentName)}</td>
      <td>${escapeHtml(lab.professorName)}</td>
      <td>${escapeHtml(lab.labName)}</td>
      <td>${lab.classification.matches.length > 0
        ? lab.classification.matches.map((match) => `<span class="chip">${escapeHtml(match.labelKo)} ${(match.confidence * 100).toFixed(0)}%</span>`).join("")
        : `<span class="warn">미분류</span>`}
      </td>
      <td>${escapeHtml(lab.warnings.join(", "))}</td>
      <td><a href="${escapeHtml(lab.labUrl)}">${escapeHtml(lab.labUrl)}</a></td>
    </tr>
  `).join("");
}

function render(report: HanyangGraduateDiscoveryReport, validation: any | undefined, sourcePath: string): string {
  const labs = report.labCandidates;
  const matched = labs.filter((lab) => lab.classification.matches.length > 0);
  const unclassified = labs.filter((lab) => lab.classification.matches.length === 0);
  const fallback = labs.filter((lab) => !lab.labHomepageUrl);
  const sourceCounts = countBy(labs, (lab) => {
    try {
      return new URL(lab.sourceUrl).hostname;
    } catch {
      return lab.sourceUrl;
    }
  });
  const categoryCounts = countBy(labs.flatMap((lab) => lab.classification.matches.map((match) => match.labelKo)), (label) => label);
  const departmentCounts = countBy(labs, (lab) => lab.departmentName);
  const localCategoryCounts = countBy(labs, (lab) => lab.localCategory);
  const reviewLabs = [...unclassified, ...fallback.filter((lab) => lab.classification.matches.length > 0)];

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>한양대 전체 크롤링 리포트</title>
  <style>
    :root { --ink:#172026; --muted:#64727d; --line:#d9e1e7; --soft:#f5f7f8; --accent:#155c58; --warn:#9c5708; --warn-bg:#fff5e8; }
    * { box-sizing: border-box; }
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:#fff; }
    header { padding:36px 40px 24px; background:#f8faf9; border-bottom:1px solid var(--line); }
    main { max-width:1320px; padding:24px 40px 48px; }
    h1 { margin:0 0 8px; font-size:30px; letter-spacing:0; }
    h2 { margin:28px 0 12px; font-size:20px; letter-spacing:0; }
    p { color:var(--muted); line-height:1.6; }
    a { color:#115d8c; overflow-wrap:anywhere; }
    .metrics { display:grid; grid-template-columns:repeat(6,minmax(130px,1fr)); gap:10px; margin-top:20px; }
    .metric { min-height:74px; padding:14px 16px; border:1px solid var(--line); background:#fff; }
    .metric span { display:block; margin-bottom:8px; color:var(--muted); font-size:13px; }
    .metric strong { font-size:26px; line-height:1; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
    .panel { border:1px solid var(--line); padding:18px; background:#fff; overflow:auto; }
    table { width:100%; border-collapse:collapse; font-size:14px; }
    th,td { padding:9px 10px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
    th { background:var(--soft); color:#34424b; }
    .chip { display:inline-flex; align-items:center; min-height:23px; margin:2px 4px 2px 0; padding:2px 7px; border:1px solid #b7ccd0; background:#eef7f6; color:#174e4a; font-size:12px; }
    .warn { display:inline-flex; min-height:23px; padding:2px 7px; border:1px solid #efca96; background:var(--warn-bg); color:var(--warn); font-size:12px; }
    @media (max-width:960px) { header,main{padding-left:18px;padding-right:18px}.metrics{grid-template-columns:repeat(2,minmax(120px,1fr))}.grid{grid-template-columns:1fr} }
  </style>
</head>
<body>
  <header>
    <h1>한양대 전체 크롤링 리포트</h1>
    <p>원본: ${escapeHtml(sourcePath)} · discovery 생성: ${escapeHtml(report.generatedAt)} · 리포트 생성: ${escapeHtml(new Date().toISOString())}</p>
    <div class="metrics">
      ${metric("학과/프로그램", report.summary.programCount)}
      ${metric("연구실 후보", labs.length)}
      ${metric("교수 후보", report.professorCandidates.length)}
      ${metric("카테고리 매칭", matched.length)}
      ${metric("카테고리 리뷰", unclassified.length)}
      ${metric("fallback URL", fallback.length)}
      ${metric("홈페이지 URL", labs.filter((lab) => lab.labHomepageUrl).length)}
      ${metric("전자공학과", report.summary.countsByDepartment["전자공학과"] ?? 0)}
      ${metric("식품영양학과", report.summary.countsByDepartment["식품영양학과"] ?? 0)}
      ${metric("Validation", validation?.status ?? "not run")}
    </div>
  </header>
  <main>
    <section class="grid">
      <div class="panel">
        <h2>학과별 연구실 수</h2>
        <table><thead><tr><th>학과</th><th>연구실</th></tr></thead><tbody>${rows(Object.entries(departmentCounts), 60)}</tbody></table>
      </div>
      <div class="panel">
        <h2>최종 카테고리 분포</h2>
        <table><thead><tr><th>카테고리</th><th>건수</th></tr></thead><tbody>${rows(Object.entries(categoryCounts), 60)}</tbody></table>
      </div>
      <div class="panel">
        <h2>학과 내부 카테고리</h2>
        <table><thead><tr><th>로컬 카테고리</th><th>건수</th></tr></thead><tbody>${rows(Object.entries(localCategoryCounts), 30) || `<tr><td colspan="2">없음</td></tr>`}</tbody></table>
      </div>
      <div class="panel">
        <h2>소스 도메인</h2>
        <table><thead><tr><th>도메인</th><th>건수</th></tr></thead><tbody>${rows(Object.entries(sourceCounts), 30)}</tbody></table>
      </div>
    </section>
    <section>
      <h2>리뷰 우선 후보</h2>
      <div class="panel">
        <table>
          <thead><tr><th>학과</th><th>교수</th><th>연구실</th><th>최종 분류</th><th>경고</th><th>URL</th></tr></thead>
          <tbody>${reviewRows(reviewLabs)}</tbody>
        </table>
      </div>
    </section>
  </main>
</body>
</html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = JSON.parse(await readFile(args.input, "utf8")) as HanyangGraduateDiscoveryReport;
  const validation = await readFile("reports/hanyang-grad-discovery-validation.json", "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => undefined);
  await mkdir("reports", { recursive: true });
  await writeFile(args.output, render(report, validation, args.input), "utf8");
  const outputJson = args.output.replace(/\.html$/i, ".json");
  await writeFile(outputJson, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: args.input,
    summary: report.summary,
    validationStatus: validation?.status,
  }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputHtml: args.output, outputJson, labs: report.labCandidates.length, matched: report.summary.taxonomyMatchCount }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
