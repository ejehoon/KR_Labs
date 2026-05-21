import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "playwright";
import { classifyResearchText } from "../packages/crawler/src/taxonomy/researchTaxonomy.js";

type OfficialProfessor = {
  name: string;
  role: string;
  researchFields: string;
  phone?: string;
  email?: string;
  homepage?: string;
  profileDetailText?: string;
  sourceUrl: string;
};

type OfficialLab = {
  labName: string;
  professorName: string;
  location?: string;
  phone?: string;
  homepage?: string;
  researchText: string;
  sourceUrl: string;
  taxonomy: ReturnType<typeof classifyResearchText>;
};

type ExtractedLab = {
  professorName?: string;
  email?: string;
  phone?: string;
  labName?: string;
  labUrl?: string;
  pdfUrl?: string;
  researchText?: string;
  warnings?: string[];
};

type ProfessorAudit = {
  name: string;
  official?: OfficialProfessor;
  officialLab?: OfficialLab;
  extracted?: ExtractedLab;
  status: "matched" | "missing_from_grad_extraction" | "extracted_only";
  notes: string[];
};

const facultyUrl = "https://fn.hanyang.ac.kr/-13";
const labUrls = [
  "https://fn.hanyang.ac.kr/-33",
  "https://fn.hanyang.ac.kr/-34",
  "https://fn.hanyang.ac.kr/-35",
  "https://fn.hanyang.ac.kr/-36",
  "https://fn.hanyang.ac.kr/-32",
];
const gradLabUrl = "http://www.grad.hanyang.ac.kr/graduate/lab_03.php?catcode=141000";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeName(value: string | undefined): string {
  return String(value ?? "")
    .replace(/\/.*$/, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function isPhone(value: string | undefined): boolean {
  return /^0\d{1,2}-\d{3,4}-\d{4}$/.test(value ?? "");
}

function isEmail(value: string | undefined): boolean {
  return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value ?? "");
}

function isUrl(value: string | undefined): boolean {
  return /^https?:\/\//i.test(value ?? "");
}

async function pageLines(url: string): Promise<string[]> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1400 } });
  try {
    await page.addInitScript("globalThis.__name = (target) => target;");
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 }).catch(async () => {
      await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
    });
    const text = await page.locator("body").innerText();
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } finally {
    await page.close();
    await browser.close();
  }
}

function parseProfessors(lines: string[]): OfficialProfessor[] {
  const professors: OfficialProfessor[] = [];
  for (let index = 0; index < lines.length - 4; index += 1) {
    const role = lines[index + 1] ?? "";
    const fields = lines[index + 2] ?? "";
    const phone = lines[index + 3] ?? "";
    const email = lines[index + 4] ?? "";
    const homepage = lines[index + 5] ?? "";
    if (!/^(교수|Professor)$/.test(role) || !isPhone(phone) || !isEmail(email)) {
      continue;
    }
    const rawName = lines[index] ?? "";
    const name = rawName.replace(/\/학과장$/, "");
    professors.push({
      name,
      role: rawName.includes("학과장") ? "학과장 교수" : role,
      researchFields: fields,
      phone,
      email,
      homepage: isUrl(homepage) ? homepage : undefined,
      sourceUrl: facultyUrl,
    });
  }
  return professors;
}

function extractResearchInterestFromDetail(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }
  return text.match(/연구(?:관심)?분야\s+([\s\S]*?)(?:\s+주요논문|\s+주요저서|\s+수상경력|\s+학회활동|$)/)?.[1]?.replace(/\s+/g, " ").trim();
}

async function professorCards(url: string): Promise<OfficialProfessor[]> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1400 } });
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 }).catch(async () => {
      await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
    });
    await page.evaluate("globalThis.__name = (target) => target;");
    const rows = await page.$$eval(".hyu-fragment-component-profile", (cards) => {
      const clean = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
      return cards.map((card) => {
        const name = clean(card.querySelector(".hyu-profile-info-title-name")?.textContent);
        const titleBlock = clean(card.querySelector(".hyu-profile-info-title")?.textContent);
        const role = clean(titleBlock.replace(name, ""));
        const researchFields = clean(card.querySelector(".hyu-profile-info-desc")?.textContent);
        const links = [...card.querySelectorAll<HTMLAnchorElement>("a[href]")].map((link) => ({
          text: clean(link.textContent),
          href: link.href || link.getAttribute("href") || "",
        }));
        const phone = links.find((link) => link.href.startsWith("tel:"))?.text;
        const email = links.find((link) => link.href.startsWith("mailto:"))?.text.toLowerCase();
        const homepage = links.find((link) =>
          /^https?:\/\//i.test(link.href) && !link.href.includes("#none") && !link.href.startsWith("mailto:") && !link.href.startsWith("tel:"),
        )?.href;
        const profileDetailText = clean(card.querySelector(".more-info-modal")?.textContent);
        return { name, role, researchFields, phone, email, homepage, profileDetailText };
      }).filter((row) => row.name && (row.email || row.researchFields || row.profileDetailText));
    });
    return rows.map((row) => {
      const detailResearch = extractResearchInterestFromDetail(row.profileDetailText);
      return {
        name: row.name.replace(/\/학과장$/, ""),
        role: row.name.includes("학과장") ? "학과장 교수" : row.role,
        researchFields: detailResearch ?? row.researchFields,
        phone: row.phone,
        email: row.email,
        homepage: row.homepage,
        profileDetailText: row.profileDetailText,
        sourceUrl: url,
      };
    });
  } finally {
    await page.close();
    await browser.close();
  }
}

function parseLab(lines: string[], sourceUrl: string): OfficialLab | undefined {
  const professorIndex = lines.findIndex((line) => line === "담당교수");
  const researchIndex = lines.findIndex((line) => line === "연구분야");
  if (professorIndex < 0 || researchIndex < 0) {
    return undefined;
  }

  const labName = lines.find((line) => line.endsWith(" - 식품영양학과"))?.replace(/\s*-\s*식품영양학과$/, "")
    ?? lines.find((line, index) => index < professorIndex && /연구실|실험실/.test(line) && line !== "연구실")
    ?? lines[0]
    ?? "";
  const professorName = lines[professorIndex + 1] ?? "";
  const location = lines[lines.findIndex((line) => line === "실험실 위치") + 1];
  const phone = lines[lines.findIndex((line) => line === "실험실 전화") + 1];
  const homepageCandidate = lines[lines.findIndex((line) => line === "홈페이지") + 1];
  const researchEnd = lines.findIndex((line, index) => index > researchIndex && line === "연구실 소개");
  const researchLines = lines
    .slice(researchIndex + 1, researchEnd > researchIndex ? researchEnd : researchIndex + 8)
    .filter((line) => !["●"].includes(line));
  const researchText = researchLines.join(" ").replace(/\s+/g, " ").trim();

  return {
    labName,
    professorName,
    location,
    phone: isPhone(phone) ? phone : undefined,
    homepage: isUrl(homepageCandidate) ? homepageCandidate : undefined,
    researchText,
    sourceUrl,
    taxonomy: classifyResearchText(`${labName} | ${researchText}`),
  };
}

async function loadExistingExtraction(): Promise<ExtractedLab[]> {
  const report = JSON.parse(await readFile("reports/hanyang-grad-discovery.json", "utf8")) as {
    labCandidates?: ExtractedLab[];
  };
  return (report.labCandidates ?? []).filter((item) => {
    const text = JSON.stringify(item);
    return text.includes("식품영양학과");
  });
}

function buildAudits(official: OfficialProfessor[], labs: OfficialLab[], extracted: ExtractedLab[]): ProfessorAudit[] {
  const audits: ProfessorAudit[] = official.map((professor) => {
    const normalized = normalizeName(professor.name);
    const officialLab = labs.find((lab) => normalizeName(lab.professorName) === normalized);
    const extractedLab = extracted.find((lab) => normalizeName(lab.professorName) === normalized || lab.email === professor.email);
    const notes: string[] = [];
    if (!extractedLab) {
      notes.push("기존 대학원 discovery 결과에는 없음");
    }
    if (!officialLab) {
      notes.push(professor.profileDetailText
        ? "교수 상세 프로필은 있으나 학과 연구실 메뉴에는 연결 연구실 없음"
        : "식품영양학과 공식 연구실 페이지에는 연결 연구실 없음");
    }
    if (officialLab && extractedLab && officialLab.labName !== extractedLab.labName) {
      notes.push("공식 학과 홈페이지 연구실명과 대학원 연구실 소개 연구실명이 다름");
    }
    return {
      name: professor.name,
      official: professor,
      officialLab,
      extracted: extractedLab,
      status: extractedLab ? "matched" : "missing_from_grad_extraction",
      notes,
    };
  });

  for (const extractedLab of extracted) {
    const normalized = normalizeName(extractedLab.professorName);
    if (!audits.some((audit) => normalizeName(audit.name) === normalized || audit.official?.email === extractedLab.email)) {
      audits.push({
        name: extractedLab.professorName ?? extractedLab.email ?? "unknown",
        extracted: extractedLab,
        status: "extracted_only",
        notes: ["대학원 연구실 소개에는 있으나 식품영양학과 공식 교수진 페이지에는 없음"],
      });
    }
  }

  return audits;
}

function pill(label: string, tone: "good" | "warn" | "bad" | "muted" = "muted") {
  return `<span class="pill ${tone}">${escapeHtml(label)}</span>`;
}

function renderHtml(input: {
  generatedAt: string;
  officialProfessors: OfficialProfessor[];
  officialLabs: OfficialLab[];
  extractedLabs: ExtractedLab[];
  audits: ProfessorAudit[];
}) {
  const matched = input.audits.filter((audit) => audit.status === "matched").length;
  const missing = input.audits.filter((audit) => audit.status === "missing_from_grad_extraction").length;
  const extractedOnly = input.audits.filter((audit) => audit.status === "extracted_only").length;
  const professorHomepageCount = input.officialProfessors.filter((professor) => professor.homepage).length;
  const generated = new Date(input.generatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  const rows = input.audits.map((audit) => {
    const official = audit.official;
    const officialLab = audit.officialLab;
    const extracted = audit.extracted;
    const statusTone = audit.status === "matched" ? "good" : audit.status === "extracted_only" ? "bad" : "warn";
    const statusLabel = audit.status === "matched"
      ? "기존 추출 매칭"
      : audit.status === "extracted_only"
        ? "추출 결과만 존재"
        : "기존 추출 누락";
    const taxonomy = officialLab?.taxonomy.matches.length
      ? officialLab.taxonomy.matches.map((match) => pill(`${match.labelKo} ${(match.confidence * 100).toFixed(0)}%`, match.confidence >= 0.8 ? "good" : "muted")).join(" ")
      : officialLab?.taxonomy.suggestions.map((suggestion) => pill(suggestion.suggestedLabel, "warn")).join(" ") || pill("근거 없음", "muted");

    return `<tr>
      <td><strong>${escapeHtml(audit.name)}</strong><div class="small">${escapeHtml(official?.role ?? "")}</div></td>
      <td>${statusLabel ? pill(statusLabel, statusTone) : ""}<div class="notes">${audit.notes.map((note) => `<div>${escapeHtml(note)}</div>`).join("")}</div></td>
      <td>
        ${official ? `${escapeHtml(official.researchFields)}<div class="small">${escapeHtml(official.phone)} · ${escapeHtml(official.email)}</div>${official.homepage ? `<a href="${escapeHtml(official.homepage)}">${escapeHtml(official.homepage)}</a>` : ""}` : pill("공식 교수진 페이지 없음", "bad")}
      </td>
      <td>
        ${officialLab ? `<a href="${escapeHtml(officialLab.sourceUrl)}">${escapeHtml(officialLab.labName)}</a><div class="small">${escapeHtml(officialLab.location ?? "")} · ${escapeHtml(officialLab.phone ?? "")}</div><p>${escapeHtml(officialLab.researchText)}</p>` : pill("공식 연구실 페이지 없음", "warn")}
      </td>
      <td>${taxonomy}</td>
      <td>
        ${extracted ? `${escapeHtml(extracted.labName ?? "")}<div class="small">${escapeHtml(extracted.email ?? "")} · ${escapeHtml(extracted.phone ?? "")}</div>${extracted.labUrl ? `<a href="${escapeHtml(extracted.labUrl)}">대학원 연구실 소개</a>` : ""}${extracted.warnings?.length ? `<div>${extracted.warnings.map((warning) => pill(warning, "warn")).join(" ")}</div>` : ""}` : pill("없음", "warn")}
      </td>
    </tr>`;
  }).join("");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>한양대 식품영양학과 교수 추출 검증 리포트</title>
  <style>
    :root {
      --bg: #f6f8fb;
      --surface: #fff;
      --ink: #1e2632;
      --muted: #687385;
      --line: #dbe2eb;
      --good: #147a4b;
      --good-bg: #e7f6ee;
      --warn: #975a16;
      --warn-bg: #fff4de;
      --bad: #b42318;
      --bad-bg: #fee4e2;
      --muted-bg: #eef2f6;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.5; }
    header { background: #263549; color: #fff; padding: 34px 40px; }
    header h1 { margin: 0 0 10px; font-size: 29px; letter-spacing: 0; }
    header p { margin: 0; color: #d9e1ed; }
    main { max-width: 1380px; margin: 0 auto; padding: 28px; }
    section { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 22px; margin-bottom: 18px; }
    h2 { margin: 0 0 14px; font-size: 20px; }
    a { color: #175cd3; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
    .metric { border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: #fbfcfe; }
    .metric span { display: block; color: var(--muted); }
    .metric strong { display: block; margin-top: 5px; font-size: 28px; }
    .finding { border-left: 4px solid var(--warn); background: #fbfcfe; border-radius: 8px; padding: 14px 16px; margin: 10px 0; }
    .finding.good { border-color: var(--good); }
    .finding.bad { border-color: var(--bad); }
    .pill { display: inline-flex; align-items: center; min-height: 24px; padding: 3px 8px; border-radius: 999px; font-size: 12px; font-weight: 800; margin: 2px 3px 2px 0; white-space: nowrap; }
    .pill.good { color: var(--good); background: var(--good-bg); }
    .pill.warn { color: var(--warn); background: var(--warn-bg); }
    .pill.bad { color: var(--bad); background: var(--bad-bg); }
    .pill.muted { color: #526071; background: var(--muted-bg); }
    .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 1280px; }
    th, td { text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); padding: 12px 10px; }
    th { color: var(--muted); background: #f3f6fa; font-size: 12px; position: sticky; top: 0; z-index: 1; }
    td p { margin: 6px 0 0; max-width: 390px; }
    .small, .notes { color: var(--muted); font-size: 12px; margin-top: 4px; }
    ul { margin: 0; padding-left: 18px; }
    @media (max-width: 820px) {
      header { padding: 26px 20px; }
      main { padding: 16px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>한양대 식품영양학과 교수 추출 검증 리포트</h1>
    <p>공식 교수진: <a href="${facultyUrl}">${facultyUrl}</a> · 학과 연구실 소개: 학과 홈페이지 연구실 메뉴 · 기존 대학원 연구실 소개: <a href="${gradLabUrl}">${gradLabUrl}</a> · 생성: ${escapeHtml(generated)}</p>
  </header>
  <main>
    <section>
      <div class="metrics">
        <div class="metric"><span>공식 교수진</span><strong>${input.officialProfessors.length}</strong></div>
        <div class="metric"><span>교수진 외부 홈페이지 URL</span><strong>${professorHomepageCount}</strong></div>
        <div class="metric"><span>학과 연구실 소개 페이지</span><strong>${input.officialLabs.length}</strong></div>
        <div class="metric"><span>현재 파이프라인 연구실</span><strong>${input.extractedLabs.length}</strong></div>
        <div class="metric"><span>매칭</span><strong>${matched}</strong></div>
        <div class="metric"><span>기존 추출 누락</span><strong>${missing}</strong></div>
        <div class="metric"><span>추출 결과만 존재</span><strong>${extractedOnly}</strong></div>
      </div>
    </section>

    <section>
      <h2>판정</h2>
      <div class="finding good"><strong>현재 파이프라인은 식품영양학과 공식 교수진 6명과 학과 연구실 소개 페이지 5개를 기준으로 대조합니다.</strong><br />교수진 페이지의 집 아이콘으로 노출되는 외부 홈페이지 URL은 이현규, 박용순, 고광웅 3명만 있습니다.</div>
      <div class="finding"><strong>여기서 5개는 외부 연구실 홈페이지 주소가 아니라 학과 홈페이지 연구실 메뉴에 있는 소개 페이지 수입니다.</strong><br />각 페이지는 담당교수와 연구분야를 적은 학과 내부 소개 페이지이며, 일부만 외부 홈페이지 URL을 추가로 가집니다.</div>
      <div class="finding"><strong>Hyunsook Kim은 교수 상세 프로필 모달이 있으므로 연구관심분야까지 교수 레코드에 저장합니다.</strong><br />다만 학과 연구실 메뉴에는 담당 연구실 소개 페이지가 없고, 교수 카드에도 외부 홈페이지 URL이 없으므로 별도 연구실 레코드는 만들지 않습니다.</div>
    </section>

    <section>
      <h2>교수별 대조</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>교수</th>
              <th>상태</th>
              <th>공식 교수진</th>
              <th>학과 연구실 소개 페이지</th>
              <th>연구분야 분류</th>
              <th>현재 파이프라인 추출</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  </main>
</body>
</html>`;
}

async function main() {
  const officialProfessors = await professorCards(facultyUrl);
  const officialLabs = (await Promise.all(labUrls.map(async (url) => parseLab(await pageLines(url), url))))
    .filter((lab): lab is OfficialLab => Boolean(lab));
  const extractedLabs = await loadExistingExtraction();
  const audits = buildAudits(officialProfessors, officialLabs, extractedLabs);

  const outputJson = "reports/hanyang-food-nutrition-professor-audit.json";
  const outputHtml = "reports/hanyang-food-nutrition-professor-audit.html";
  const generatedAt = new Date().toISOString();

  await mkdir(dirname(outputJson), { recursive: true });
  await writeFile(outputJson, `${JSON.stringify({ generatedAt, facultyUrl, labUrls, gradLabUrl, officialProfessors, officialLabs, extractedLabs, audits }, null, 2)}\n`, "utf8");
  await writeFile(outputHtml, renderHtml({ generatedAt, officialProfessors, officialLabs, extractedLabs, audits }), "utf8");

  console.log(JSON.stringify({
    outputJson,
    outputHtml,
    officialProfessorCount: officialProfessors.length,
    professorHomepageUrlCount: officialProfessors.filter((professor) => professor.homepage).length,
    departmentLabPageCount: officialLabs.length,
    extractedLabCount: extractedLabs.length,
    matched: audits.filter((audit) => audit.status === "matched").length,
    missingFromGradExtraction: audits.filter((audit) => audit.status === "missing_from_grad_extraction").length,
    extractedOnly: audits.filter((audit) => audit.status === "extracted_only").length,
  }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
