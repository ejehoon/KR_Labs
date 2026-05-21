import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HanyangGraduateDiscoveryReport, HanyangLabCandidate, HanyangProfessorCandidate } from "../packages/crawler/src/schools/hanyangGraduateDiscovery.js";

type Args = {
  department: string;
  report: string;
  output?: string;
};

function parseArgs(argv: string[]): Args {
  const args = new Map<string, string>();
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      args.set(match[1] ?? "", match[2] ?? "");
    }
  }
  const department = args.get("department");
  if (!department) {
    console.log("Usage: pnpm report:hanyang-department-labs --department=전자공학과 [--report=reports/hanyang-grad-discovery.json] [--output=reports/hanyang-electronic-engineering-labs.html]");
    process.exit(1);
  }
  return {
    department,
    report: args.get("report") ?? "reports/hanyang-grad-discovery.json",
    output: args.get("output"),
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugifyDepartment(value: string): string {
  const known: Record<string, string> = {
    "전자공학과": "electronic-engineering",
    "식품영양학과": "food-nutrition",
    "컴퓨터공학과": "computer-science",
    "인공지능학과": "artificial-intelligence",
  };
  return known[value] ?? value.replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase();
}

function taxonomyLabels(candidate: HanyangLabCandidate): string[] {
  return candidate.classification.matches.map((match) => match.labelKo);
}

function suggestions(candidate: HanyangLabCandidate): string[] {
  return candidate.classification.suggestions.map((suggestion) => suggestion.suggestedLabel);
}

function countBy<T>(items: T[], key: (item: T) => string | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    if (!value) {
      continue;
    }
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function metric(label: string, value: number | string): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderLabs(labs: HanyangLabCandidate[]): string {
  return labs.map((lab, index) => {
    const labels = taxonomyLabels(lab);
    const suggested = suggestions(lab);
    const url = lab.labUrl || lab.labHomepageUrl || lab.sourceUrl;
    const urlKind = lab.labHomepageUrl ? "외부/공식 홈페이지" : "대학원 fallback";
    const warnings = lab.warnings.length > 0 ? lab.warnings : ["없음"];
    return `
      <article class="lab-card ${lab.labHomepageUrl ? "" : "needs-review"}">
        <div class="lab-header">
          <div>
            <div class="index">#${index + 1}</div>
            <h2>${escapeHtml(lab.labName || "(연구실명 없음)")}</h2>
            <p>${escapeHtml(lab.professorName || "(교수명 없음)")} · ${escapeHtml(lab.email || "email 없음")}</p>
          </div>
          <span class="badge ${lab.labHomepageUrl ? "ok" : "warn"}">${escapeHtml(urlKind)}</span>
        </div>
        <dl>
          <div><dt>단과대/학과</dt><dd>${escapeHtml(lab.collegeName)} / ${escapeHtml(lab.departmentName)}</dd></div>
          ${lab.localCategory ? `<div><dt>학과 카테고리</dt><dd><span class="chip">${escapeHtml(lab.localCategory)}</span></dd></div>` : ""}
          <div><dt>연구실 URL</dt><dd><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></dd></div>
          ${lab.location ? `<div><dt>위치</dt><dd>${escapeHtml(lab.location)}</dd></div>` : ""}
          ${lab.phone ? `<div><dt>전화</dt><dd>${escapeHtml(lab.phone)}</dd></div>` : ""}
          <div><dt>분류 근거</dt><dd>${escapeHtml(lab.researchText || "(비어 있음)")}</dd></div>
          <div><dt>최종 분류</dt><dd>${labels.length > 0 ? labels.map((label) => `<span class="chip">${escapeHtml(label)}</span>`).join("") : `<span class="empty">매칭 없음</span>`}</dd></div>
          ${suggested.length > 0 ? `<div><dt>새 카테고리 후보</dt><dd>${suggested.map((label) => `<span class="chip suggestion">${escapeHtml(label)}</span>`).join("")}</dd></div>` : ""}
          <div><dt>경고/리뷰</dt><dd>${warnings.map((warning) => `<span class="chip ${warning === "없음" ? "ok-chip" : "warn-chip"}">${escapeHtml(warning)}</span>`).join("")}</dd></div>
        </dl>
      </article>
    `;
  }).join("\n");
}

function renderProfessorSummary(professors: HanyangProfessorCandidate[]): string {
  if (professors.length === 0) {
    return `<p class="muted">이 학과는 현재 별도 학과 홈페이지 교수 후보 보강 결과가 없습니다. 대학원 연구실 카드의 교수명/이메일을 기준으로 확인하세요.</p>`;
  }
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>교수</th><th>이메일</th><th>연구분야</th><th>상세</th></tr></thead>
        <tbody>
          ${professors.map((professor) => `
            <tr>
              <td>${escapeHtml(professor.name)}</td>
              <td>${escapeHtml(professor.email || "")}</td>
              <td>${escapeHtml(professor.researchText || "")}</td>
              <td>${professor.profileUrl ? `<a href="${escapeHtml(professor.profileUrl)}">profile</a>` : ""}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderHtml(params: {
  department: string;
  generatedAt: string;
  labs: HanyangLabCandidate[];
  professors: HanyangProfessorCandidate[];
  sourceReport: string;
}): string {
  const { department, generatedAt, labs, professors, sourceReport } = params;
  const homepageCount = labs.filter((lab) => lab.labHomepageUrl).length;
  const fallbackCount = labs.length - homepageCount;
  const categorizedCount = labs.filter((lab) => taxonomyLabels(lab).length > 0).length;
  const uncategorizedCount = labs.length - categorizedCount;
  const missingResearchCount = labs.filter((lab) => !lab.researchText?.trim()).length;
  const taxonomyCounts = countBy(labs.flatMap((lab) => taxonomyLabels(lab)), (label) => label);
  const warningCounts = countBy(labs.flatMap((lab) => lab.warnings), (warning) => warning);

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>한양대 ${escapeHtml(department)} 연구실 리포트</title>
  <style>
    :root { color-scheme: light; --ink: #172026; --muted: #65717b; --line: #d9e0e6; --soft: #f5f7f8; --accent: #16615a; --warn: #a45b0b; --warn-bg: #fff5e8; --ok: #1f6f43; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: #fff; }
    header { padding: 36px 40px 24px; border-bottom: 1px solid var(--line); background: #f8faf9; }
    h1 { margin: 0 0 8px; font-size: 30px; line-height: 1.25; letter-spacing: 0; }
    h2 { margin: 0; font-size: 20px; line-height: 1.35; letter-spacing: 0; }
    h3 { margin: 30px 0 12px; font-size: 18px; letter-spacing: 0; }
    p { line-height: 1.6; }
    a { color: #115d8c; overflow-wrap: anywhere; }
    main { padding: 24px 40px 44px; max-width: 1260px; }
    .muted { color: var(--muted); }
    .metrics { display: grid; grid-template-columns: repeat(5, minmax(140px, 1fr)); gap: 10px; margin-top: 20px; }
    .metric { border: 1px solid var(--line); background: #fff; padding: 14px 16px; min-height: 74px; }
    .metric span { display: block; color: var(--muted); font-size: 13px; margin-bottom: 8px; }
    .metric strong { font-size: 26px; line-height: 1; }
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 24px 0; }
    .panel { border: 1px solid var(--line); padding: 18px; background: #fff; }
    .list { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { display: inline-flex; align-items: center; min-height: 24px; margin: 2px 5px 2px 0; padding: 3px 8px; border: 1px solid #b7ccd0; background: #eef7f6; color: #174e4a; font-size: 12px; }
    .chip.suggestion { border-color: #d5b777; background: #fff8de; color: #6e5200; }
    .warn-chip { border-color: #f0cf9d; background: var(--warn-bg); color: var(--warn); }
    .ok-chip { border-color: #bad6c5; background: #eff8f1; color: var(--ok); }
    .empty { color: #8a4700; font-weight: 650; }
    .lab-card { border-top: 3px solid var(--accent); border-left: 1px solid var(--line); border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); margin: 14px 0; padding: 18px; background: #fff; }
    .lab-card.needs-review { border-top-color: var(--warn); background: #fffdf9; }
    .lab-header { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; margin-bottom: 16px; }
    .lab-header p { margin: 5px 0 0; color: var(--muted); }
    .index { color: var(--muted); font-size: 12px; margin-bottom: 4px; }
    .badge { white-space: nowrap; border: 1px solid var(--line); padding: 5px 9px; font-size: 12px; background: var(--soft); }
    .badge.ok { border-color: #bad6c5; color: var(--ok); background: #eff8f1; }
    .badge.warn { border-color: #f0cf9d; color: var(--warn); background: var(--warn-bg); }
    dl { display: grid; gap: 10px; margin: 0; }
    dl > div { display: grid; grid-template-columns: 130px 1fr; gap: 14px; border-top: 1px solid #edf1f3; padding-top: 10px; }
    dt { color: var(--muted); font-size: 13px; }
    dd { margin: 0; line-height: 1.55; overflow-wrap: anywhere; }
    .table-wrap { overflow-x: auto; border: 1px solid var(--line); }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { background: var(--soft); color: #33404a; }
    @media (max-width: 900px) {
      header, main { padding-left: 18px; padding-right: 18px; }
      .metrics { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      .split { grid-template-columns: 1fr; }
      .lab-header { flex-direction: column; }
      dl > div { grid-template-columns: 1fr; gap: 4px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>한양대 ${escapeHtml(department)} 연구실 리포트</h1>
    <p class="muted">생성 시각: ${escapeHtml(generatedAt)} · 원본: ${escapeHtml(sourceReport)}</p>
    <div class="metrics">
      ${metric("연구실 후보", labs.length)}
      ${metric("홈페이지 URL 있음", homepageCount)}
      ${metric("fallback URL", fallbackCount)}
      ${metric("분류 매칭", categorizedCount)}
      ${metric("분류 리뷰", uncategorizedCount)}
      ${metric("연구텍스트 누락", missingResearchCount)}
      ${metric("교수 보강 후보", professors.length)}
    </div>
  </header>
  <main>
    <section class="split">
      <div class="panel">
        <h3>분류 분포</h3>
        <div class="list">
          ${Object.entries(taxonomyCounts).length > 0 ? Object.entries(taxonomyCounts).map(([label, count]) => `<span class="chip">${escapeHtml(label)} ${count}</span>`).join("") : `<span class="empty">매칭 없음</span>`}
        </div>
      </div>
      <div class="panel">
        <h3>리뷰 신호</h3>
        <div class="list">
          ${Object.entries(warningCounts).length > 0 ? Object.entries(warningCounts).map(([label, count]) => `<span class="chip warn-chip">${escapeHtml(label)} ${count}</span>`).join("") : `<span class="chip ok-chip">경고 없음</span>`}
        </div>
      </div>
    </section>
    <section>
      <h3>교수 보강 후보</h3>
      ${renderProfessorSummary(professors)}
    </section>
    <section>
      <h3>연구실 목록</h3>
      ${renderLabs(labs)}
    </section>
  </main>
</body>
</html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = JSON.parse(await readFile(args.report, "utf8")) as HanyangGraduateDiscoveryReport;
  const labs = report.labCandidates
    .filter((lab) => lab.departmentName === args.department)
    .sort((a, b) => (a.collegeName.localeCompare(b.collegeName) || String(a.labName).localeCompare(String(b.labName))));
  const professors = report.professorCandidates
    .filter((professor) => professor.departmentName === args.department)
    .sort((a, b) => a.name.localeCompare(b.name));
  const outputHtml = args.output ?? join("reports", `hanyang-${slugifyDepartment(args.department)}-labs.html`);
  const outputJson = outputHtml.replace(/\.html$/i, ".json");
  await mkdir("reports", { recursive: true });
  await writeFile(outputHtml, renderHtml({
    department: args.department,
    generatedAt: new Date().toISOString(),
    labs,
    professors,
    sourceReport: args.report,
  }), "utf8");
  await writeFile(outputJson, `${JSON.stringify({
    department: args.department,
    generatedAt: new Date().toISOString(),
    sourceReport: args.report,
    summary: {
      labCount: labs.length,
      labHomepageUrlCount: labs.filter((lab) => lab.labHomepageUrl).length,
      fallbackUrlCount: labs.filter((lab) => !lab.labHomepageUrl).length,
      categorizedCount: labs.filter((lab) => taxonomyLabels(lab).length > 0).length,
      uncategorizedCount: labs.filter((lab) => taxonomyLabels(lab).length === 0).length,
      professorCandidateCount: professors.length,
    },
    professors,
    labs,
  }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputHtml, outputJson, labCount: labs.length, professorCandidateCount: professors.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
