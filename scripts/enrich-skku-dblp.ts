import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";
import { cleanText } from "../packages/crawler/src/core/html.js";
import { fetchDblpPublicationCount, resolveDirectDblpLink, resolveExactDblpAuthor } from "../packages/crawler/src/core/dblp.js";
import { snapshotPlaywrightPage, type PlaywrightPageSnapshot } from "../packages/crawler/src/core/playwrightExtract.js";

type ResearchClassification = {
  matches?: Array<{ labelKo: string }>;
};

type SkkuLabCandidate = {
  collegeNameKo: string;
  departmentName: string;
  labName?: string;
  professorName?: string;
  researchText?: string;
  homepageResearchText?: string;
  email?: string;
  labUrl?: string;
  sourceUrl: string;
  classification?: ResearchClassification;
  dblpUrl?: string;
  dblpAuthorName?: string;
  dblpResolutionMethod?: "direct_link" | "exact_author_search";
  dblpEvidence?: string;
  dblpWarnings?: string[];
  paperCount?: number;
  paperCountSource?: "dblp" | "publication_page";
  paperCountSourceUrl?: string;
};

type SkkuDiscoveryReport = {
  generatedAt: string;
  labCandidates: SkkuLabCandidate[];
  summary?: Record<string, unknown>;
  dblpEnrichedAt?: string;
};

const dblpRelevantLabels = new Set([
  "AI",
  "AI Agent",
  "AI Safety",
  "AI for Science",
  "LLM",
  "RF/무선통신",
  "네트워크",
  "데이터 분석",
  "데이터베이스",
  "딥러닝",
  "멀티모달 AI",
  "머신러닝",
  "보안",
  "분산시스템",
  "소프트웨어 공학",
  "신호처리",
  "알고리즘",
  "음성/오디오 AI",
  "의료영상",
  "임베디드 시스템",
  "자연어처리",
  "컴퓨터 구조",
  "컴퓨터 그래픽스",
  "컴퓨터 비전",
]);

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

function printHelp() {
  console.log(`Usage: pnpm enrich:skku-grad:dblp [--report=reports/skku-grad-discovery.json] [--public=apps/web/public/data/skku-grad-discovery.json] [--max-candidates=220] [--concurrency=3] [--force=true]

Conservatively enriches SKKU CS-adjacent labs with DBLP URLs and publication
counts. Korean names are not transliterated; exact English author evidence or
direct DBLP links are required.
`);
}

async function mapLimit<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index] as T, index);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, run));
  return results;
}

function isLikelyDblpRelevant(candidate: SkkuLabCandidate): boolean {
  if (/소프트웨어|인공지능|데이터|실감미디어|인터랙션|전자전기|반도체|컴퓨터|정보통신/i.test(candidate.departmentName)) {
    return true;
  }
  return (candidate.classification?.matches ?? []).some((match) => dblpRelevantLabels.has(match.labelKo));
}

function isSchoolIndexFallbackLabUrl(labUrl: string | undefined): boolean {
  return /gradschool\.skku\.edu\/grad\/prepare\/laboratory_01\.htm\?college_id=/i.test(labUrl ?? "");
}

function isEnglishPersonName(value: string | undefined): value is string {
  return Boolean(value)
    && /^[A-Z][A-Za-z.'’-]{1,40}(?:\s+[A-Z][A-Za-z.'’-]{1,40}){1,3}$/.test(value)
    && !/University|Laboratory|Research|Group|System|Systems|Network|Machine|Learning|Data|Science|Engineering|Computer|Artificial|Intelligence|Homepage|Google|Scholar|Sungkyunkwan|SKKU/i.test(value);
}

function compactAscii(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function englishNameTokens(name: string): string[] {
  return name
    .replace(/[.'’`-]/g, " ")
    .split(/\s+/)
    .map((part) => compactAscii(part))
    .filter(Boolean);
}

function emailLocalMatchesEnglishName(candidate: SkkuLabCandidate, name: string): boolean {
  const local = compactAscii(candidate.email?.split("@")[0]);
  if (!local) {
    return false;
  }

  const tokens = englishNameTokens(name);
  if (tokens.length < 2) {
    return false;
  }

  const surname = tokens[tokens.length - 1] as string;
  const givenTokens = tokens.slice(0, -1);
  const initials = givenTokens.map((token) => token[0]).join("");
  const given = givenTokens.join("");
  const compactName = `${given}${surname}`;

  return local.includes(compactName)
    || local.includes(`${initials}${surname}`)
    || local.includes(`${given}${surname[0] ?? ""}`)
    || (surname.length >= 3 && local.includes(surname))
    || (given.length >= 5 && local.includes(given.slice(0, 5)));
}

function professorEnglishNameIsCompatible(candidate: SkkuLabCandidate, name: string, context = ""): boolean {
  if (isEnglishPersonName(candidate.professorName)) {
    return compactAscii(candidate.professorName) === compactAscii(name);
  }

  const professorNameKo = candidate.professorName?.match(/[가-힣]{2,8}/u)?.[0];
  if (professorNameKo && context.includes(professorNameKo)) {
    return true;
  }

  if (emailLocalMatchesEnglishName(candidate, name)) {
    return true;
  }

  if (/family labs?|former|alumni|founded by|left sungkyunkwan|joined samsung/i.test(context)) {
    return false;
  }

  return /\b(?:led by|directed by|contact:?|principal investigator|PI|professor|prof\.)\b/i.test(context);
}

function extractEnglishNameCandidates(candidate: SkkuLabCandidate, snapshot: PlaywrightPageSnapshot): string[] {
  const names = new Set<string>();
  if (isEnglishPersonName(candidate.professorName)) {
    names.add(candidate.professorName);
  }

  const text = `${snapshot.title}\n${snapshot.headings.join("\n")}\n${snapshot.text.slice(0, 8_000)}`;
  const professorNameKo = candidate.professorName && /^[가-힣]{2,8}/u.test(candidate.professorName) ? candidate.professorName.match(/[가-힣]{2,8}/u)?.[0] : undefined;
  const englishName = String.raw`([A-Z][A-Za-z.'’-]{1,40}(?:\s+[A-Z][A-Za-z.'’-]{1,40}){1,3})`;

  if (professorNameKo) {
    const escapedKo = escapeRegExp(professorNameKo);
    const bilingualPatterns = [
      new RegExp(`${englishName}\\s*[\\(\\[]\\s*${escapedKo}\\s*[\\)\\]]`, "g"),
      new RegExp(`${escapedKo}\\s*[\\(\\[]\\s*${englishName}\\s*[\\)\\]]`, "g"),
      new RegExp(`${englishName}\\s*[,/|·-]\\s*${escapedKo}`, "g"),
      new RegExp(`${escapedKo}\\s*[,/|·-]\\s*${englishName}`, "g"),
    ];
    for (const pattern of bilingualPatterns) {
      for (const match of text.matchAll(pattern)) {
        const context = text.slice(Math.max(0, (match.index ?? 0) - 140), (match.index ?? 0) + 220);
        if (isEnglishPersonName(match[1]) && professorEnglishNameIsCompatible(candidate, match[1], context)) {
          names.add(cleanText(match[1]) as string);
        }
      }
    }
  }

  const professorPatterns = [
    new RegExp(String.raw`(?:Professor|Prof\.|Dr\.|Principal Investigator|PI)\s+${englishName}`, "g"),
    new RegExp(String.raw`${englishName}\s+(?:Professor|Prof\.|Ph\.?\s?D|Principal Investigator|PI)\b`, "g"),
  ];
  for (const pattern of professorPatterns) {
    for (const match of text.matchAll(pattern)) {
      const context = text.slice(Math.max(0, (match.index ?? 0) - 140), (match.index ?? 0) + 220);
      if (isEnglishPersonName(match[1]) && professorEnglishNameIsCompatible(candidate, match[1], context)) {
        names.add(cleanText(match[1]) as string);
      }
    }
  }

  return [...names].slice(0, 5);
}

function directDblpLink(snapshot: PlaywrightPageSnapshot): string | undefined {
  if (/dblp\.(?:org|uni-trier\.de)\/pid\//i.test(snapshot.finalUrl)) {
    return snapshot.finalUrl;
  }
  return snapshot.links.find((link) => /dblp\.(?:org|uni-trier\.de)\/pid\//i.test(`${link.href} ${link.text}`))?.href;
}

async function enrichCandidate(candidate: SkkuLabCandidate, snapshot: PlaywrightPageSnapshot): Promise<Partial<SkkuLabCandidate>> {
  const directUrl = directDblpLink(snapshot);
  if (directUrl) {
    const direct = await resolveDirectDblpLink(directUrl);
    if (direct?.url) {
      return {
        dblpUrl: direct.url,
        dblpAuthorName: direct.authorName,
        dblpResolutionMethod: direct.method,
        dblpEvidence: "direct_dblp_link_on_lab_or_profile_page",
        paperCount: direct.paperCount ?? candidate.paperCount,
        paperCountSource: direct.paperCount ? "dblp" : candidate.paperCountSource,
        paperCountSourceUrl: direct.paperCount ? direct.url : candidate.paperCountSourceUrl,
      };
    }
  }

  const names = extractEnglishNameCandidates(candidate, snapshot);
  for (const name of names) {
    const resolved = await resolveExactDblpAuthor(name);
    if (!resolved?.url) {
      continue;
    }
    return {
      dblpUrl: resolved.url,
      dblpAuthorName: resolved.authorName,
      dblpResolutionMethod: resolved.method,
      dblpEvidence: `exact_author_search:${name}`,
      paperCount: resolved.paperCount ?? candidate.paperCount,
      paperCountSource: resolved.paperCount ? "dblp" : candidate.paperCountSource,
      paperCountSourceUrl: resolved.paperCount ? resolved.url : candidate.paperCountSourceUrl,
    };
  }

  return { dblpWarnings: names.length > 0 ? [`dblp_no_exact_match:${names.join("|")}`] : ["dblp_no_english_author_evidence"] };
}

function updateSummary(report: SkkuDiscoveryReport) {
  const dblpRows = report.labCandidates.filter((row) => row.dblpUrl);
  report.summary = {
    ...(report.summary ?? {}),
    dblpEnrichment: {
      labCandidates: report.labCandidates.length,
      withDblpUrl: dblpRows.length,
      withDblpPaperCount: report.labCandidates.filter((row) => row.paperCountSource === "dblp").length,
      dblpPaperSum: report.labCandidates.filter((row) => row.paperCountSource === "dblp").reduce((total, row) => total + (row.paperCount ?? 0), 0),
      directLinks: dblpRows.filter((row) => row.dblpResolutionMethod === "direct_link").length,
      exactAuthorSearch: dblpRows.filter((row) => row.dblpResolutionMethod === "exact_author_search").length,
    },
  };
}

async function enrichReport(reportPath: string, options: { maxCandidates?: number; concurrency: number; force: boolean }) {
  const report = JSON.parse(await readFile(reportPath, "utf8")) as SkkuDiscoveryReport;
  const browser = await createBrowserManager();

  try {
    const indexedCandidates = report.labCandidates
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => Boolean(candidate.labUrl))
      .filter(({ candidate }) => !isSchoolIndexFallbackLabUrl(candidate.labUrl))
      .filter(({ candidate }) => isLikelyDblpRelevant(candidate))
      .filter(({ candidate }) => options.force || !candidate.dblpUrl)
      .slice(0, options.maxCandidates);

    const enriched = await mapLimit(indexedCandidates, options.concurrency, async ({ candidate, index }, localIndex) => {
      let next: SkkuLabCandidate = { ...candidate };
      try {
        const snapshot = await snapshotPlaywrightPage(browser.context, candidate.labUrl as string);
        const patch = await enrichCandidate(candidate, snapshot);
        next = {
          ...candidate,
          ...patch,
          dblpWarnings: patch.dblpUrl ? undefined : (patch.dblpWarnings ?? (options.force ? undefined : candidate.dblpWarnings)),
        };
      } catch (error) {
        next.dblpWarnings = [`dblp_page_failed:${error instanceof Error ? error.message : String(error)}`];
      }

      console.log(
        JSON.stringify({
          progress: `${localIndex + 1}/${indexedCandidates.length}`,
          index,
          professor: candidate.professorName,
          lab: candidate.labName,
          labUrl: candidate.labUrl,
          dblpUrl: next.dblpUrl,
          dblpAuthorName: next.dblpAuthorName,
          paperCount: next.paperCount ?? null,
          paperCountSource: next.paperCountSource,
          warning: next.dblpWarnings?.[0],
        }),
      );

      return { index, candidate: next };
    });

    for (const item of enriched) {
      report.labCandidates[item.index] = item.candidate;
    }

    report.dblpEnrichedAt = new Date().toISOString();
    updateSummary(report);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    return {
      reportPath,
      processed: indexedCandidates.length,
      summary: report.summary?.dblpEnrichment,
    };
  } finally {
    await browser.close();
  }
}

async function copyReport(sourcePath: string, publicPath: string) {
  const report = await readFile(sourcePath, "utf8");
  await mkdir(dirname(publicPath), { recursive: true });
  await writeFile(publicPath, report, "utf8");
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const reportPath = String(args.get("report") ?? "reports/skku-grad-discovery.json");
  const publicPath = String(args.get("public") ?? "apps/web/public/data/skku-grad-discovery.json");
  const maxCandidatesArg = args.get("max-candidates");
  const maxCandidates = typeof maxCandidatesArg === "string" ? Number(maxCandidatesArg) : undefined;
  const concurrency = Number(args.get("concurrency") ?? 3);
  const force = args.get("force") === true || args.get("force") === "true";

  const result = await enrichReport(reportPath, { maxCandidates, concurrency, force });
  await copyReport(reportPath, publicPath);

  console.log(JSON.stringify({ ...result, publicPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
