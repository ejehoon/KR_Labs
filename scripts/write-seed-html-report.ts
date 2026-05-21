import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

type SeedDiscoveryPage = {
  url: string;
  finalUrl?: string;
  status?: number;
  title?: string;
  pageType: string;
  textLength: number;
  headings: string[];
  topLinks: Array<{ url: string; text: string; score: number; pageType: string }>;
  entityCounts: {
    departments: number;
    professors: number;
    labs: number;
    publications: number;
  };
  taxonomy: {
    status?: string;
    matches: Array<{ fieldId: string; labelKo: string; confidence: number; evidence: string[] }>;
    suggestions: Array<{ suggestedLabel: string; reason: string; evidence: string[] }>;
    rejectedMatches?: Array<{ fieldId: string; labelKo: string; confidence: number; evidence: string[] }>;
  };
  reviewReasons: string[];
};

type SeedDiscoveryReport = {
  seedUrl: string;
  schoolSlug: string;
  schoolName: string;
  generatedAt: string;
  config: {
    allowedDomains: string[];
    maxDepth: number;
    maxPages: number;
    minLinkScore: number;
  };
  summary: {
    visitedPages: number;
    successfulPages: number;
    failedPages: number;
    skippedPages: number;
    departmentsFound: number;
    professorsFound: number;
    labsFound: number;
    publicationsFound: number;
    reviewItemsCreated: number;
    pageTypeCounts: Record<string, number>;
    taxonomyMatchedPages: number;
    taxonomySuggestionPages: number;
    reviewPageCount: number;
  };
  pages: SeedDiscoveryPage[];
  failedPages: Array<{ url: string; reason: string }>;
  nextActions: string[];
};

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      args.set("help", true);
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      args.set(match[1] ?? "", match[2] ?? "");
    }
  }
  return args;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pct(part: number, total: number): string {
  if (total === 0) {
    return "0%";
  }
  return `${Math.round((part / total) * 100)}%`;
}

function compactUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "");
}

function pill(value: string, tone: "good" | "warn" | "info" | "muted" = "muted") {
  return `<span class="pill ${tone}">${escapeHtml(value)}</span>`;
}

function metric(label: string, value: string | number, hint = "") {
  return `<section class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</section>`;
}

function classifyFindings(report: SeedDiscoveryReport): Array<{ title: string; body: string; tone: "good" | "warn" | "bad" }> {
  const findings: Array<{ title: string; body: string; tone: "good" | "warn" | "bad" }> = [];
  const summary = report.summary;

  if (summary.failedPages === 0 && summary.successfulPages === summary.visitedPages) {
    findings.push({
      title: "페이지 접근 안정성은 좋음",
      body: `${summary.visitedPages}개 방문 페이지가 모두 200 계열로 처리되었고 실패 페이지는 없습니다.`,
      tone: "good",
    });
  } else {
    findings.push({
      title: "실패 페이지 확인 필요",
      body: `${summary.failedPages}개 페이지가 실패했습니다. URL 차단, 인코딩, 리다이렉트 여부를 먼저 확인해야 합니다.`,
      tone: "bad",
    });
  }

  if (summary.professorsFound <= 1) {
    findings.push({
      title: "교수 추출은 약함",
      body: `교수 후보가 ${summary.professorsFound}명만 잡혔습니다. 한양대 대학원 사이트는 학과 index와 연구실 소개 링크 중심이라 교수 상세 페이지까지 가는 adapter가 필요합니다.`,
      tone: "warn",
    });
  }

  if (summary.labsFound > 0) {
    findings.push({
      title: "연구실 후보는 잡히지만 정제 필요",
      body: `연구실 후보 ${summary.labsFound}개가 잡혔습니다. 다만 학과 index 공통 메뉴에서 반복되는 항목도 포함될 수 있어 lab.php 및 상세 페이지 기준으로 중복 제거가 필요합니다.`,
      tone: "warn",
    });
  }

  const departmentPages = summary.pageTypeCounts.department ?? 0;
  if (departmentPages / Math.max(summary.visitedPages, 1) > 0.75) {
    findings.push({
      title: "탐색이 학과 소개 페이지에 치우침",
      body: `방문 페이지 중 ${departmentPages}/${summary.visitedPages}개가 department로 분류되었습니다. 연구실/교수 링크를 더 강하게 따라가려면 link score나 학교별 include rule 보강이 좋습니다.`,
      tone: "warn",
    });
  }

  if (summary.taxonomyMatchedPages === summary.successfulPages && summary.taxonomySuggestionPages === 0) {
    findings.push({
      title: "분류는 모두 매칭됐지만 과신 위험 있음",
      body: "모든 페이지가 기존 taxonomy에 매칭되었습니다. 하지만 학과 소개 같은 넓은 페이지에서는 여러 분야 키워드가 섞여 있으므로 학과별/교수별 근거 텍스트 단위로 재분류하는 것이 안전합니다.",
      tone: "warn",
    });
  }

  return findings;
}

function renderPageRow(page: SeedDiscoveryPage, index: number) {
  const matches = page.taxonomy.matches
    .slice(0, 5)
    .map((match) => pill(`${match.labelKo} ${(match.confidence * 100).toFixed(0)}%`, match.confidence >= 0.8 ? "good" : "info"))
    .join(" ");
  const rejected = (page.taxonomy.rejectedMatches ?? [])
    .slice(0, 4)
    .map((match) => pill(`${match.labelKo} ${(match.confidence * 100).toFixed(0)}%`, "muted"))
    .join(" ");
  const links = page.topLinks
    .slice(0, 4)
    .map((link) => `<li><a href="${escapeHtml(link.url)}">${escapeHtml(link.text || compactUrl(link.url))}</a> ${pill(link.pageType, "muted")} <small>score ${escapeHtml(link.score)}</small></li>`)
    .join("");
  const review = page.reviewReasons.length > 0
    ? page.reviewReasons.map((reason) => pill(reason, "warn")).join(" ")
    : pill("자동 review reason 없음", "good");

  return `<tr>
    <td class="index">${index + 1}</td>
    <td>
      <a href="${escapeHtml(page.finalUrl ?? page.url)}">${escapeHtml(compactUrl(page.finalUrl ?? page.url))}</a>
      <div class="muted-text">${escapeHtml(page.title ?? "")}</div>
    </td>
    <td>${pill(page.pageType, page.pageType === "lab" ? "info" : "muted")}</td>
    <td class="counts">
      <span>D ${page.entityCounts.departments}</span>
      <span>P ${page.entityCounts.professors}</span>
      <span>L ${page.entityCounts.labs}</span>
      <span>Pub ${page.entityCounts.publications}</span>
    </td>
    <td>${matches || pill("없음", "muted")}<div class="rejected">${rejected}</div></td>
    <td><ul>${links}</ul></td>
    <td>${review}</td>
  </tr>`;
}

function renderHtml(report: SeedDiscoveryReport) {
  const summary = report.summary;
  const generated = new Date(report.generatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const findings = classifyFindings(report);
  const statusTone = summary.failedPages === 0 ? "good" : "bad";
  const pageTypeRows = Object.entries(summary.pageTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `<div class="bar-row"><span>${escapeHtml(type)}</span><div><i style="width:${pct(count, summary.visitedPages)}"></i></div><strong>${count}</strong></div>`)
    .join("");
  const failedRows = report.failedPages.length === 0
    ? `<p class="muted-text">실패 페이지 없음</p>`
    : `<ul>${report.failedPages.map((item) => `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.url)}</a> ${escapeHtml(item.reason)}</li>`).join("")}</ul>`;

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(report.schoolName)} Seed Discovery 검증 리포트</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fb;
      --surface: #ffffff;
      --ink: #1c2430;
      --muted: #687385;
      --line: #dce2ea;
      --good: #147a4b;
      --good-bg: #e7f6ee;
      --warn: #9a5a00;
      --warn-bg: #fff2d8;
      --bad: #b42318;
      --bad-bg: #fee4e2;
      --info: #175cd3;
      --info-bg: #e6f0ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    header {
      background: #243244;
      color: white;
      padding: 34px 40px 30px;
    }
    header h1 { margin: 0 0 10px; font-size: 30px; letter-spacing: 0; }
    header p { margin: 0; color: #d7deea; max-width: 980px; }
    main { max-width: 1280px; margin: 0 auto; padding: 28px; }
    section.panel {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 22px;
      margin-bottom: 18px;
    }
    h2 { margin: 0 0 16px; font-size: 20px; }
    h3 { margin: 0 0 8px; font-size: 16px; }
    a { color: var(--info); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
    }
    .metric {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      background: #fbfcfe;
    }
    .metric span, .metric small { display: block; color: var(--muted); }
    .metric strong { display: block; margin-top: 5px; font-size: 26px; }
    .findings {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
    }
    .finding {
      border-left: 4px solid var(--line);
      background: #fbfcfe;
      border-radius: 8px;
      padding: 14px 16px;
    }
    .finding.good { border-color: var(--good); }
    .finding.warn { border-color: var(--warn); }
    .finding.bad { border-color: var(--bad); }
    .finding p { margin: 0; color: var(--muted); }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      margin: 2px 3px 2px 0;
      white-space: nowrap;
    }
    .pill.good { color: var(--good); background: var(--good-bg); }
    .pill.warn { color: var(--warn); background: var(--warn-bg); }
    .pill.bad { color: var(--bad); background: var(--bad-bg); }
    .pill.info { color: var(--info); background: var(--info-bg); }
    .pill.muted { color: #526071; background: #eef2f6; }
    .grid-2 {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 18px;
    }
    .bar-row {
      display: grid;
      grid-template-columns: 120px minmax(0, 1fr) 44px;
      gap: 10px;
      align-items: center;
      margin: 10px 0;
    }
    .bar-row div {
      height: 10px;
      background: #edf1f6;
      border-radius: 999px;
      overflow: hidden;
    }
    .bar-row i {
      display: block;
      height: 100%;
      background: #4b6b91;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      text-align: left;
      vertical-align: top;
      border-bottom: 1px solid var(--line);
      padding: 12px 10px;
    }
    th {
      color: var(--muted);
      font-size: 12px;
      background: #f3f6fa;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    td.index { color: var(--muted); width: 42px; }
    td.counts span { display: inline-block; margin-right: 8px; color: var(--muted); }
    ul { margin: 0; padding-left: 18px; }
    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .muted-text { color: var(--muted); font-size: 12px; }
    .rejected { margin-top: 6px; }
    .verdict {
      display: inline-flex;
      align-items: center;
      padding: 7px 11px;
      border-radius: 999px;
      font-weight: 800;
      margin-bottom: 10px;
    }
    .verdict.good { color: var(--good); background: var(--good-bg); }
    .verdict.bad { color: var(--bad); background: var(--bad-bg); }
    code {
      background: #eef2f6;
      border-radius: 5px;
      padding: 2px 5px;
    }
    @media (max-width: 820px) {
      header { padding: 26px 22px; }
      main { padding: 16px; }
      .grid-2 { grid-template-columns: 1fr; }
      table { min-width: 1100px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(report.schoolName)} Seed Discovery 검증 리포트</h1>
    <p>Seed URL: <a href="${escapeHtml(report.seedUrl)}">${escapeHtml(report.seedUrl)}</a> · 생성: ${escapeHtml(generated)} · 설정: depth ${report.config.maxDepth}, max pages ${report.config.maxPages}, domains ${escapeHtml(report.config.allowedDomains.join(", "))}</p>
  </header>
  <main>
    <section class="panel">
      <span class="verdict ${statusTone}">${summary.failedPages === 0 ? "접근 검증 통과" : "접근 실패 포함"}</span>
      <div class="metrics">
        ${metric("방문 페이지", summary.visitedPages)}
        ${metric("성공 페이지", summary.successfulPages, pct(summary.successfulPages, summary.visitedPages))}
        ${metric("실패 페이지", summary.failedPages)}
        ${metric("학과 후보", summary.departmentsFound)}
        ${metric("교수 후보", summary.professorsFound)}
        ${metric("연구실 후보", summary.labsFound)}
        ${metric("분류 매칭 페이지", summary.taxonomyMatchedPages, pct(summary.taxonomyMatchedPages, summary.successfulPages))}
        ${metric("검토 필요 페이지", summary.reviewPageCount)}
      </div>
    </section>

    <section class="panel">
      <h2>검증 요약</h2>
      <div class="findings">
        ${findings.map((finding) => `<article class="finding ${finding.tone}"><h3>${escapeHtml(finding.title)}</h3><p>${escapeHtml(finding.body)}</p></article>`).join("")}
      </div>
    </section>

    <section class="panel grid-2">
      <div>
        <h2>페이지 타입 분포</h2>
        ${pageTypeRows}
      </div>
      <div>
        <h2>다음 보강 포인트</h2>
        <ul>
          ${[
            ...report.nextActions,
            "학과 소개 index에서 추출한 taxonomy는 최종 라벨로 바로 쓰지 말고, 교수/연구실 상세 텍스트 기준으로 재분류하세요.",
            "한양대는 `graduate/lab.php`와 학과별 `departmentintro_view.php`를 분리해 adapter 후보로 승격하는 것이 좋습니다.",
          ].map((action) => `<li>${escapeHtml(action)}</li>`).join("")}
        </ul>
      </div>
    </section>

    <section class="panel">
      <h2>실패 페이지</h2>
      ${failedRows}
    </section>

    <section class="panel">
      <h2>페이지별 상세</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>URL</th>
              <th>타입</th>
              <th>엔티티</th>
              <th>Taxonomy</th>
              <th>상위 링크</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            ${report.pages.map(renderPageRow).join("")}
          </tbody>
        </table>
      </div>
    </section>
  </main>
</body>
</html>
`;
}

function printHelp() {
  console.log(`Usage: pnpm report:seed-html --input=reports/seed-discovery-hanyang-grad.json [--output=reports/seed-discovery-hanyang-grad.html]`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const input = String(args.get("input") ?? "");
  if (!input) {
    throw new Error("Missing --input");
  }
  const output = String(args.get("output") ?? input.replace(/\.json$/i, ".html"));
  const report = JSON.parse(await readFile(input, "utf8")) as SeedDiscoveryReport;

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, renderHtml(report), "utf8");
  console.log(JSON.stringify({ input, output, pages: report.pages.length, generatedAt: new Date().toISOString() }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
