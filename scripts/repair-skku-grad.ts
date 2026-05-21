import { readFile, writeFile } from "node:fs/promises";
import { cleanText, resolveUrl, textFromHtml } from "../packages/crawler/src/core/html.js";

type SkkuLabCandidate = {
  collegeNameKo: string;
  departmentName: string;
  labName?: string;
  professorName?: string;
  researchText?: string;
  labUrl?: string;
  sourceUrl: string;
  classificationEvidenceText?: string;
  externalResolverSourceUrl?: string;
  externalResolverNote?: string;
  enrichmentWarnings?: string[];
  currentMemberCount?: number;
  memberCountBreakdown?: Record<string, number>;
  memberCountSourceUrl?: string;
  memberCountCrawledAt?: string;
  memberCountMethod?: string;
};

type SkkuDiscoveryReport = {
  labCandidates: SkkuLabCandidate[];
  summary?: Record<string, unknown>;
};

const reportPaths = [
  "reports/skku-grad-discovery.json",
  "apps/web/public/data/skku-grad-discovery.json",
];

const defaultHeaders = {
  "user-agent": process.env.CRAWLER_USER_AGENT ?? "KR-Labs-Crawler/0.1 contact@example.com",
};

function isBadLabUrl(url: string | undefined): boolean {
  const value = url ?? "";
  return /researchgate\.net|scholar\.google|youtube\.com|youtu\.be|viewresearcher\.do|researcher\/viewresearcher/i.test(value)
    || /gradschool\.skku\.edu\/grad\/prepare\/(?!laboratory_01\.htm)/i.test(value)
    || /^https?:\/\/(?:www\.)?skku\.edu\/?$/i.test(value)
    || /^https?:\/\/(?:www\.)?skkumed\.ac\.kr\/?$/i.test(value)
    || /give\.skku\.edu/i.test(value)
    || /ihappynanum\.com/i.test(value)
    || /samsunghospital\.com\/home\/main\/index\.do(?:$|[?#])/i.test(value)
    || /bk21plus\.skku\.edu\/med\/main\/main\.jsp(?:$|[?#])/i.test(value)
    || /^https?:\/\/pharmacy-70years\.skku\.edu\/?$/i.test(value)
    || /skb\.skku\.edu\/sportis\/index\.do(?:$|[?#])/i.test(value)
    || /gradschool\.skku\.edu\/grad\/index\.htm(?:$|[?#])/i.test(value)
    || /^https?:\/\/bio\.skku\.edu\/?$/i.test(value)
    || /skb\.skku\.edu\/eng_pharm\/?(?:$|[?#])/i.test(value)
    || /biotech\.skku\.edu\/biotech\/research_[^/]+\.do(?:$|[?#])/i.test(value)
    || /bio\.skku\.edu\/bbs\/board\.php/i.test(value)
    || /shb\.skku\.edu\/sport\/?(?:$|[?#])/i.test(value)
    || /biomedical\.skku\.edu\/eng\/html\/research\/laboratory\.asp(?:$|[?#])/i.test(value)
    || /pharm\.skku\.edu\/graduate\/graduate\d+_laboratory\.php(?:$|[?#])/i.test(value)
    || /sport\.skku\.edu\/sports\/research\/research_[^/]+\.do(?:$|[?#])/i.test(value)
    || /coe\.skku\.edu\/coe\/index\.jsp(?:$|[?#])/i.test(value);
}

function isBadMemberCountSource(url: string | undefined): boolean {
  return /bo_table=student|(?:^|[\/_-])(?:research|schoollife\d*|activity|exchange[-_]?students|exhange[-_]?students|cscience[-_]?current|student[-_]?scg|student[-_]?sw|student[-_]?global[-_]?stu|student[-_]?(?:[a-z]+[-_])*[a-z]*stu|research[-_]?biotech|alumi|links?|group[-_]?photos?|photos?|galler(?:y|ies)|agreement|login|privacy|terms|signup|mypage)(?:[\/_.-]|$|[?#])/i.test(url ?? "")
    || /give\.skku\.edu|ihappynanum\.com|pharmacy-70years\.skku\.edu|samsunghospital\.com\/home\/future\/|success\.skku\.edu\/success\/index\.do|coefs\.charlotte\.edu\/(?:ttxu|hzhang3)|coefs\.uncc\.edu\/hcho17|^https?:\/\/(?:www\.)?skku\.edu\/?$|^https?:\/\/(?:www\.)?skkumed\.ac\.kr\/?$/i.test(url ?? "");
}

function stripHtmlNoise(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ");
}

function extractLinks(html: string, baseUrl: string): Array<{ href: string; text: string; title: string }> {
  return [...stripHtmlNoise(html).matchAll(/<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map((match) => {
      const attrs = `${match[1] ?? ""} ${match[3] ?? ""}`;
      const href = resolveUrl(match[2], baseUrl);
      const text = textFromHtml(match[4]);
      const title = textFromHtml(attrs.match(/\btitle=["']([^"']+)["']/i)?.[1]);
      return href ? { href, text: cleanText(text) ?? "", title: cleanText(title) ?? "" } : undefined;
    })
    .filter((link): link is { href: string; text: string; title: string } => Boolean(link));
}

function isProfileLikeLabUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  return /biomedical\.skku\.edu\/.+laboratory_detail\.asp/i.test(url)
    || /(?:mode=view|perId=)/i.test(url)
    || /(?:faculty|professor|people\/professor|intro\/prof)/i.test(url);
}

function isLikelyBetterLabUrl(candidateUrl: string, currentUrl: string): boolean {
  if (/^(?:mailto|tel|javascript):/i.test(candidateUrl)) {
    return false;
  }
  if (candidateUrl === currentUrl) {
    return false;
  }
  if (isBadLabUrl(candidateUrl)) {
    return false;
  }

  const candidate = new URL(candidateUrl);
  const current = new URL(currentUrl);
  const isSameProfileHost = candidate.hostname === current.hostname;
  const looksLikeCurrentProfile =
    /(?:laboratory_detail\.asp|mode=view|perId=|faculty|professor|people\/professor|intro\/prof)/i.test(candidate.href);

  if (isSameProfileHost && looksLikeCurrentProfile) {
    return false;
  }

  return true;
}

function scoreExternalLabLink(link: { href: string; text: string; title: string }, currentUrl: string): number {
  if (!isLikelyBetterLabUrl(link.href, currentUrl)) {
    return -100;
  }

  const haystack = `${link.href} ${link.text} ${link.title}`.toLowerCase();
  let score = 0;
  if (/laboratory|homepage|website|home page|lab(?:oratory)?|연구실|홈페이지|웹사이트/i.test(haystack)) score += 16;
  if (/members?|people|team|students?|publication|research/i.test(haystack)) score += 4;
  if (/facebook|instagram|youtube|linkedin|twitter|naver|notice|news|publication|contact|admission|login|download|donation|fund|기부/i.test(haystack)) score -= 10;
  if (/biomedical\.skku\.edu|gradschool\.skku\.edu|www\.skku\.edu|skkumed\.ac\.kr|coe\.skku\.edu|bk21plus\.skku\.edu|pharmacy-70years\.skku\.edu|samsunghospital\.com\/home\/main|skb\.skku\.edu\/eng_pharm|skb\.skku\.edu\/sportis|bio\.skku\.edu(?:\/?$|\/bbs)|shb\.skku\.edu\/sport/i.test(link.href)) score -= 5;
  try {
    if (new URL(link.href).hostname !== new URL(currentUrl).hostname) score += 6;
  } catch {
    score -= 20;
  }
  return score;
}

async function findBetterLabUrlFromProfile(currentUrl: string): Promise<string | undefined> {
  try {
    const response = await fetch(currentUrl, { headers: defaultHeaders, redirect: "follow" });
    if (!response.ok) {
      return undefined;
    }
    const finalUrl = response.url || currentUrl;
    const html = await response.text();
    const links = extractLinks(html, finalUrl)
      .map((link) => ({ ...link, score: scoreExternalLabLink(link, finalUrl) }))
      .filter((link) => link.score > 0)
      .sort((a, b) => b.score - a.score);

    return links[0]?.href;
  } catch {
    return undefined;
  }
}

function repairMalformedUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  if (/^ttp:\/\//i.test(url)) {
    return `h${url}`;
  }
  return url;
}

function copyMemberCount(target: SkkuLabCandidate, source: SkkuLabCandidate) {
  target.currentMemberCount = source.currentMemberCount;
  target.memberCountBreakdown = source.memberCountBreakdown;
  target.memberCountSourceUrl = source.memberCountSourceUrl;
  target.memberCountCrawledAt = source.memberCountCrawledAt;
  target.memberCountMethod = source.memberCountMethod;
}

function clearMemberCount(row: SkkuLabCandidate) {
  delete row.currentMemberCount;
  delete row.memberCountBreakdown;
  delete row.memberCountSourceUrl;
  delete row.memberCountCrawledAt;
  delete row.memberCountMethod;
}

function isUsableSourceUrl(url: string | undefined): boolean {
  return /gradschool\.skku\.edu\/grad\/prepare\/laboratory_01\.htm\?college_id=/i.test(url ?? "");
}

function isWeakLabName(value: string | undefined): boolean {
  return !value || value === "-" || /^(?:lab|laboratory|homepage|website|홈페이지|웹사이트|연구실)$/i.test(value);
}

function cleanLabNameFallback(value: string | undefined): string | undefined {
  const cleaned = cleanText(value)
    ?.replace(/\s*\|\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!cleaned) {
    return undefined;
  }
  return /(?:연구실|실험실|센터|Lab|Laboratory)$/i.test(cleaned) ? cleaned : `${cleaned} 연구실`;
}

function cleanResearchFallback(value: string | undefined): string | undefined {
  return cleanText(value)
    ?.replace(/(?:연구실|실험실)$/g, "")
    .replace(/\b(?:Lab|Laboratory)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim() || undefined;
}

function addWarning(row: SkkuLabCandidate, warning: string) {
  row.enrichmentWarnings = [...new Set([...(row.enrichmentWarnings ?? []), warning])];
}

function refreshClassificationEvidence(row: SkkuLabCandidate) {
  row.classificationEvidenceText = [
    row.collegeNameKo,
    row.departmentName,
    row.labName,
    row.researchText,
  ]
    .map((value) => cleanText(value))
    .filter((value): value is string => Boolean(value))
    .join(" | ");
}

async function repair(path: string) {
  const report = JSON.parse(await readFile(path, "utf8")) as SkkuDiscoveryReport;
  let malformedFixed = 0;
  let badCleared = 0;
  let badMemberCountCleared = 0;
  let profileLinkPromoted = 0;
  let sourceUrlFallbackFilled = 0;
  let labNameFallbackFilled = 0;
  let researchTextFallbackFilled = 0;
  let duplicateFilled = 0;
  let memberCopied = 0;

  for (const row of report.labCandidates) {
    let restoredSourceUrl = false;
    const repairedUrl = repairMalformedUrl(row.labUrl);
    if (repairedUrl && repairedUrl !== row.labUrl) {
      row.labUrl = repairedUrl;
      malformedFixed += 1;
    }
    if (isBadLabUrl(row.labUrl)) {
      const fallbackUrl = row.externalResolverSourceUrl && !isBadLabUrl(row.externalResolverSourceUrl)
        ? row.externalResolverSourceUrl
        : undefined;
      if (fallbackUrl) {
        row.labUrl = fallbackUrl;
        row.externalResolverNote = `${row.externalResolverNote ?? "skku_bad_lab_url"}_restored_source_url`;
        restoredSourceUrl = true;
      } else {
        delete row.labUrl;
      }
      clearMemberCount(row);
      badCleared += 1;
    }
    if (isBadMemberCountSource(row.memberCountSourceUrl)) {
      clearMemberCount(row);
      badMemberCountCleared += 1;
    }
    if (!row.labUrl && isUsableSourceUrl(row.sourceUrl) && !(row.externalResolverSourceUrl && !isBadLabUrl(row.externalResolverSourceUrl))) {
      row.labUrl = row.sourceUrl;
      row.externalResolverNote = `${row.externalResolverNote ?? "skku_no_lab_homepage"}_source_index_fallback`;
      addWarning(row, "lab_url_fallback_to_school_index");
      sourceUrlFallbackFilled += 1;
    }
    if (isWeakLabName(row.labName) && row.researchText) {
      const fallback = cleanLabNameFallback(row.researchText);
      if (fallback) {
        row.labName = fallback;
        addWarning(row, "lab_name_inferred_from_research_text");
        labNameFallbackFilled += 1;
      }
    }
    if (!row.researchText && !isWeakLabName(row.labName)) {
      const fallback = cleanResearchFallback(row.labName);
      if (fallback) {
        row.researchText = fallback;
        addWarning(row, "research_text_inferred_from_lab_name");
        researchTextFallbackFilled += 1;
      }
    }
    refreshClassificationEvidence(row);
    if (!row.labUrl && row.externalResolverSourceUrl && !isBadLabUrl(row.externalResolverSourceUrl)) {
      row.labUrl = row.externalResolverSourceUrl;
      row.externalResolverNote = `${row.externalResolverNote ?? "skku_missing_lab_url"}_restored_source_url`;
      restoredSourceUrl = true;
      badCleared += 1;
    }
    if (!restoredSourceUrl && !row.externalResolverNote?.includes("restored_source_url") && isProfileLikeLabUrl(row.labUrl)) {
      const betterLabUrl = await findBetterLabUrlFromProfile(row.labUrl);
      if (betterLabUrl && betterLabUrl !== row.labUrl) {
        row.externalResolverSourceUrl = row.labUrl;
        row.externalResolverNote = "skku_profile_external_lab_link";
        row.labUrl = betterLabUrl;
        clearMemberCount(row);
        profileLinkPromoted += 1;
      }
    }
  }

  const byDepartmentProfessor = new Map<string, SkkuLabCandidate[]>();
  for (const row of report.labCandidates) {
    if (!row.professorName) {
      continue;
    }
    const key = `${row.departmentName}|${row.professorName}`;
    byDepartmentProfessor.set(key, [...(byDepartmentProfessor.get(key) ?? []), row]);
  }

  for (const row of report.labCandidates) {
    if (row.labUrl || !row.professorName) {
      continue;
    }
    const bucket = byDepartmentProfessor.get(`${row.departmentName}|${row.professorName}`) ?? [];
    const rowsWithUrl = bucket.filter((item) => item.labUrl);
    const urls = [...new Set(rowsWithUrl.map((item) => item.labUrl))];
    if (urls.length !== 1) {
      continue;
    }
    const source = rowsWithUrl.find((item) => item.labUrl === urls[0]);
    row.labUrl = urls[0];
    duplicateFilled += 1;
    if (source?.currentMemberCount !== undefined) {
      copyMemberCount(row, source);
      memberCopied += 1;
    }
  }

  report.summary = {
    ...(report.summary ?? {}),
    enrichment: {
      labCandidates: report.labCandidates.length,
      withLabUrl: report.labCandidates.filter((row) => row.labUrl).length,
      withMemberCount: report.labCandidates.filter((row) => typeof row.currentMemberCount === "number").length,
      memberCountMissing: report.labCandidates.filter((row) => row.labUrl && typeof row.currentMemberCount !== "number").length,
    },
  };

  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return {
    path,
    malformedFixed,
    badCleared,
    badMemberCountCleared,
    profileLinkPromoted,
    sourceUrlFallbackFilled,
    labNameFallbackFilled,
    researchTextFallbackFilled,
    duplicateFilled,
    memberCopied,
  };
}

async function main() {
  const results = [];
  for (const path of reportPaths) {
    results.push(await repair(path));
  }
  console.log(JSON.stringify({ results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
