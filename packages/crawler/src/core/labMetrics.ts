import type { BrowserContext } from "playwright";
import { cleanText, decodeHtmlEntities, resolveUrl, textFromHtml, uniqueBy } from "./html.js";
import { snapshotPlaywrightPage } from "./playwrightExtract.js";

export type LabMemberCountResult = {
  count?: number;
  breakdown?: Record<string, number>;
  sourceUrl?: string;
  method?: "structured_html_sections" | "text_section";
  candidatePages: Array<{ url: string; score: number; reason: string }>;
};

type PageData = {
  url: string;
  finalUrl: string;
  title?: string;
  html: string;
  text: string;
  links: Array<{ href: string; text: string }>;
};

type PageLoader = (url: string) => Promise<PageData | undefined>;

const userAgent = process.env.CRAWLER_USER_AGENT ?? "Mozilla/5.0 (compatible; KR-Labs-Crawler/0.1)";
const httpTimeoutMs = Number(process.env.LAB_METRICS_HTTP_TIMEOUT_MS ?? 8_000);
const maxAutomaticMemberCount = Number(process.env.LAB_METRICS_MAX_MEMBER_COUNT ?? 80);
const pageCache = new Map<string, Promise<PageData | undefined>>();
const unreliableMemberSourcePattern = /(?:^|[\/_-])(?:publications?|papers?|projects?|research|current[-_]?news|news|awards?|posts?|contact|articles?|policy|privacy|terms|current[-_]?students|admissions?|welfare|support|schoollife\d*|activity|exchange[-_]?students|exhange[-_]?students|cscience[-_]?current|student[-_]?scg|student[-_]?sw|student[-_]?global[-_]?stu|student[-_]?(?:[a-z]+[-_])*[a-z]*stu|lecture[-_]?student|research[-_]?biotech|alumi|links?|group[-_]?photos?|photos?|galler(?:y|ies))(?:[\/_.-]|$|[?#])|(?:^|\/)(?:prof|professor|faculty|principal(?:[-_]?investigator)?|pi|fulltime)(?:[-_/]|$|[?#])|#role-member-pages$|bo_table=student|peopleprofe|researchfaculty|faculty|professor|교수진|전임교원|교원소개|login(?:\.php)?|nature\.com|samsungstf\.org|samsunghospital\.com\/home\/future\/|success\.skku\.edu\/success\/index\.do|coefs\.charlotte\.edu\/(?:ttxu|hzhang3)|coefs\.uncc\.edu\/(?:hcho17|ttxu)|microsoft\.com\/en-us\/research\/people|researcher\/viewresearcher|viewresearcher\.do|researchgate\.net|scientific-contributions/i;
const memberKeywordPattern = /members?|people|team|students?|researchers?|group|current|구성원|멤버|맴버|구성|학생|대학원생|연구원|재학생|연구실\s*구성원|연구실\s*인원/i;

function stripHtmlNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");
}

function htmlToTextWithBreaks(html: string): string {
  return decodeHtmlEntities(
    stripHtmlNoise(html)
      .replace(/<\/(?:h1|h2|h3|h4|p|div|li|tr|section|article)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchPage(url: string): Promise<PageData | undefined> {
  const normalizedUrl = resolveUrl(url, url);
  if (!normalizedUrl) {
    return undefined;
  }

  const cached = pageCache.get(normalizedUrl);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), httpTimeoutMs);
    try {
      const response = await fetch(normalizedUrl, {
        headers: { "user-agent": userAgent },
        signal: controller.signal,
        redirect: "follow",
      });
      if (!response.ok) {
        return undefined;
      }

      const html = await response.text();
      const finalUrl = response.url || normalizedUrl;
      const title = textFromHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
      const links = extractLinks(html, finalUrl);
      return {
        url: normalizedUrl,
        finalUrl,
        title,
        html,
        text: htmlToTextWithBreaks(html),
        links,
      };
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  })();

  pageCache.set(normalizedUrl, promise);
  return promise;
}

async function fetchPlaywrightPage(context: BrowserContext, url: string): Promise<PageData | undefined> {
  try {
    const snapshot = await snapshotPlaywrightPage(context, url);
    return {
      url,
      finalUrl: snapshot.finalUrl,
      title: snapshot.title,
      html: snapshot.html,
      text: htmlToTextWithBreaks(snapshot.html),
      links: snapshot.links.map((link) => ({ href: link.href, text: link.text })),
    };
  } catch {
    return undefined;
  }
}

function extractLinks(html: string, baseUrl: string): Array<{ href: string; text: string }> {
  const links = [...stripHtmlNoise(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => {
      const href = resolveUrl(match[1], baseUrl);
      const text = textFromHtml(match[2]);
      return href && text ? { href, text } : undefined;
    })
    .filter((link): link is { href: string; text: string } => Boolean(link));

  return uniqueBy(links, (link) => `${link.href}|${link.text}`);
}

function memberLinkScore(link: { href: string; text: string }): { score: number; reason: string } {
  const haystack = `${link.href} ${link.text}`.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  if (memberKeywordPattern.test(haystack)) {
    score += 12;
    reasons.push("member_keyword");
  }
  if (/\/(?:member|members|people|student|students|team)(?:\/|$|\?)|group-member|current/i.test(haystack)) {
    score += 10;
    reasons.push("member_path");
  }
  if (/alumni|alumi|former|past|졸업|동문/i.test(haystack)) {
    score -= 12;
    reasons.push("former_member_penalty");
  }
  if (/faculty|professor|교수|교수진|profile/i.test(haystack)) {
    score -= 8;
    reasons.push("faculty_penalty");
  }
  if (/news|notice|award|activity|publication|paper|논문|뉴스|공지|수상|활동/i.test(haystack)) {
    score -= 20;
    reasons.push("non_member_content_penalty");
  }

  return { score, reason: reasons.join(",") || "unknown" };
}

function candidateMemberUrls(rootPage: PageData): Array<{ url: string; score: number; reason: string }> {
  const scoredLinks = rootPage.links
    .map((link) => {
      const score = memberLinkScore(link);
      return { url: link.href, ...score };
    })
    .filter((link) => link.score > 0);

  const derivedPaths = [
    "members/",
    "members",
    "member/",
    "people/",
    "people",
    "team/",
    "students/",
    "current-members/",
    "lab-members/",
    "group-members/",
    "people/members/",
    "people/current-members/",
    "members/current/",
    "members/current-members/",
    "team/members/",
    "team/current-members/",
    "people/students/",
    "people/researchers/",
    "the-group/present/",
    "member/current/",
    "member/students/",
    "members/students/",
    "people/current/",
    "구성원/",
    "멤버/",
    "학생/",
    "연구원/",
  ]
    .map((path) => {
      const base = rootPage.finalUrl.endsWith("/") ? rootPage.finalUrl : `${rootPage.finalUrl}/`;
      return resolveUrl(path, base);
    })
    .filter((url): url is string => Boolean(url))
    .map((url) => ({ url, score: 8, reason: "derived_common_member_path" }));

  const rootLooksLikeMemberPage = memberKeywordPattern.test(`${rootPage.title ?? ""} ${rootPage.finalUrl}`);
  const rootCandidate = rootLooksLikeMemberPage ? [{ url: rootPage.finalUrl, score: 20, reason: "root_is_member_page" }] : [];

  return uniqueBy([...rootCandidate, ...scoredLinks, ...derivedPaths], (item) => item.url)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function normalizeHeading(text: string | undefined): string {
  return cleanText(text)?.toLowerCase() ?? "";
}

function isFormerHeading(heading: string): boolean {
  return /alumni|alumi|former|past|\bgraduates?\b|dissertation research|co-mentored|co-mentee|previous|졸업|동문|이전/.test(heading);
}

function isProfessorHeading(heading: string): boolean {
  return /professor|faculty|principal investigator|\bpi\b|교수/.test(heading);
}

function isCurrentMemberHeading(heading: string): boolean {
  return /members?|people|team|students?|researchers?|post-?doc|postdoctoral|visiting|on leave|ph\.?\s*d|doctoral|master|\bm\.?\s*s\.?\b|undergraduate|intern|구성원|멤버|맴버|학생|대학원생|연구원|재학생|박사|석사|학부|방문|휴학/.test(heading)
    && !isFormerHeading(heading)
    && !isProfessorHeading(heading);
}

function isSpecificCurrentMemberHeading(heading: string): boolean {
  return /post-?doc|postdoctoral|visiting|on leave|ph\.?\s*d|doctoral|master|\bm\.?\s*s\.?\b|undergraduate|intern|students?|researchers?|학생|대학원생|연구원|재학생|박사|석사|학부|방문|휴학/.test(heading)
    && !isFormerHeading(heading)
    && !isProfessorHeading(heading);
}

function hasMemberPageSignal(value: string | undefined): boolean {
  return memberKeywordPattern.test(value ?? "") || /group[-_ ]?members?|lab[-_ ]?members?|current[-_ ]?members?|our[-_ ]?team/i.test(value ?? "");
}

function redirectedAwayFromMemberPage(requestedUrl: string, page: PageData): boolean {
  if (!hasMemberPageSignal(requestedUrl)) {
    return false;
  }

  return !hasMemberPageSignal(`${page.finalUrl} ${page.title ?? ""}`);
}

function headingRole(heading: string): string {
  if (/on leave|휴학/.test(heading)) return "on_leave";
  if (/visiting|방문/.test(heading)) return "visiting";
  if (/post-?doc|postdoctoral/.test(heading)) return "postdoc";
  if (/undergraduate|intern|학부|인턴/.test(heading)) return "undergraduate_or_intern";
  if (/researcher|연구원/.test(heading)) return "researcher";
  if (/ph\.?\s*d|doctoral|박사/.test(heading)) return "phd";
  if (/master|\bm\.?\s*s\.?\b|석사/.test(heading)) return "master";
  if (/student|학생|대학원생/.test(heading)) return "student";
  return "member";
}

function countPeopleInMemberSection(sectionHtml: string): number {
  const lines = htmlToTextWithBreaks(sectionHtml).split(/\n+/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const names = new Set<string>();
  const emails = new Set<string>();
  for (const line of lines) {
    if (shouldIgnoreMemberLine(line) && !/@/.test(line)) {
      continue;
    }
    const compactKoreanName = line.match(/(?:^|[\s:·,-])([가-힣]{2,4})(?:\s|$|[,/()·-])/u)?.[1];
    const spacedKoreanName = line.match(/(?:^|[\s:·,-])([가-힣]\s*[가-힣]\s*[가-힣](?:\s*[가-힣])?)(?:\s|$|[,/()·-])/u)?.[1]?.replace(/\s+/g, "");
    const englishName = line.match(/\b([A-Z][a-z]+(?:[-'][A-Z][a-z]+)?\s+[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?)\b/)?.[1];
    const name = cleanText(compactKoreanName ?? spacedKoreanName ?? englishName);
    if (name) {
      names.add(name.toLowerCase());
    }
    for (const email of line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []) {
      emails.add(email.toLowerCase());
    }
  }
  return names.size > 0 ? names.size : emails.size;
}

function countStructuredHtmlMembers(html: string): { count?: number; breakdown?: Record<string, number> } {
  const cleanHtml = stripHtmlNoise(html);
  const headingPattern = /<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  const headings = [...cleanHtml.matchAll(headingPattern)]
    .map((match) => ({
      index: match.index ?? 0,
      html: match[0],
      heading: normalizeHeading(textFromHtml(match[2])),
    }))
    .filter((item) => item.heading);

  if (headings.length === 0) {
    return {};
  }

  let total = 0;
  const breakdown: Record<string, number> = {};

  for (let index = 0; index < headings.length; index += 1) {
    const current = headings[index];
    if (!current || isFormerHeading(current.heading) || isProfessorHeading(current.heading) || !isCurrentMemberHeading(current.heading)) {
      continue;
    }

    const nextHeadingIndex = headings.slice(index + 1).find((item) =>
      isCurrentMemberHeading(item.heading) || isFormerHeading(item.heading) || isProfessorHeading(item.heading),
    )?.index ?? cleanHtml.length;
    const sectionHtml = cleanHtml.slice(current.index + current.html.length, nextHeadingIndex);
    if (isFormerHeading(current.heading)) {
      break;
    }

    const portraitCount = (sectionHtml.match(/class=["'][^"']*portrait-title[^"']*["']/gi) ?? []).length;
    const cardTitleCount = (sectionHtml.match(/class=["'][^"']*(?:member|people|profile|person)[^"']*["'][^>]*>[\s\S]{0,1200}?<h[2-4]\b/gi) ?? []).length;
    const wixRepeaterCount = Number(sectionHtml.match(/<fluid-columns-repeater\b[^>]*\bitems=["'](\d+)["']/i)?.[1] ?? 0);
    const textPersonCount = isSpecificCurrentMemberHeading(current.heading) ? countPeopleInMemberSection(sectionHtml) : 0;
    const personCount = Math.max(portraitCount, cardTitleCount, wixRepeaterCount, textPersonCount);
    if (personCount > 0) {
      const role = headingRole(current.heading);
      total += personCount;
      breakdown[role] = (breakdown[role] ?? 0) + personCount;
    }
  }

  return total > 0 ? { count: total, breakdown } : {};
}

function shouldIgnoreMemberLine(line: string): boolean {
  return /@|copyright|all rights reserved|publication|journal|conference|doi|abstract|논문|특허|course|lecture|강의|수업|education|experience|appointment|activity|committee|society|editorial|award|honors|professor|faculty|principal investigator|\bPI\b|지도교수|교수님|교수\s*$/i.test(line);
}

function extractTextMemberCount(text: string): { count?: number; breakdown?: Record<string, number> } {
  const lines = text.split(/\n+/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const specificStart = lines.findIndex((line) => isSpecificCurrentMemberHeading(normalizeHeading(line)));
  const start = specificStart >= 0
    ? specificStart
    : lines.findIndex((line) => isCurrentMemberHeading(normalizeHeading(line)));
  if (start < 0) {
    return {};
  }

  const people = new Set<string>();
  const emailPeople = new Set<string>();
  const breakdown: Record<string, number> = {};
  const emailBreakdown: Record<string, number> = {};
  let currentRole = "member";

  for (const line of lines.slice(start)) {
    const normalized = normalizeHeading(line);
    if (isFormerHeading(normalized)) {
      break;
    }
    if (isProfessorHeading(normalized)) {
      currentRole = "professor";
      continue;
    }
    if (isCurrentMemberHeading(normalized)) {
      currentRole = headingRole(normalized);
      continue;
    }
    if (currentRole !== "professor") {
      const email = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase();
      if (email) {
        emailPeople.add(email);
        emailBreakdown[currentRole] = (emailBreakdown[currentRole] ?? 0) + 1;
      }
    }
    if (currentRole === "professor" || line.length > 140 || shouldIgnoreMemberLine(line)) {
      continue;
    }

    const compactKoreanName = line.match(/(?:^|[\s:·,-])([가-힣]{2,4})(?:\s|$|[,/()·-])/u)?.[1];
    const spacedKoreanName = line.match(/(?:^|[\s:·,-])([가-힣]\s*[가-힣]\s*[가-힣](?:\s*[가-힣])?)(?:\s|$|[,/()·-])/u)?.[1]?.replace(/\s+/g, "");
    const englishName = line.match(/\b([A-Z][a-z]+(?:[-'][A-Z][a-z]+)?\s+[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?)\b/)?.[1];
    const key = cleanText(compactKoreanName ?? spacedKoreanName ?? englishName);
    if (!key) {
      continue;
    }
    if (people.has(key)) {
      continue;
    }
    people.add(key);
    breakdown[currentRole] = (breakdown[currentRole] ?? 0) + 1;
  }

  if (people.size > 0) {
    return { count: people.size, breakdown };
  }
  return emailPeople.size > 0 ? { count: emailPeople.size, breakdown: emailBreakdown } : {};
}

function safeCount(result: { count?: number; breakdown?: Record<string, number> }, sourceUrl: string, method: LabMemberCountResult["method"], candidatePages: LabMemberCountResult["candidatePages"]): LabMemberCountResult {
  if (!result.count || result.count > maxAutomaticMemberCount) {
    return { candidatePages };
  }
  if (unreliableMemberSourcePattern.test(sourceUrl)) {
    return { candidatePages };
  }

  return {
    count: result.count,
    breakdown: result.breakdown,
    sourceUrl,
    method,
    candidatePages,
  };
}

async function countMembersFromPage(url: string, candidatePages: LabMemberCountResult["candidatePages"], loadPage: PageLoader): Promise<LabMemberCountResult> {
  const page = await loadPage(url);
  if (!page) {
    return { candidatePages };
  }
  if (redirectedAwayFromMemberPage(url, page)) {
    return { candidatePages };
  }

  const structured = countStructuredHtmlMembers(page.html);
  if (structured.count) {
    return safeCount(structured, page.finalUrl, "structured_html_sections", candidatePages);
  }

  const text = extractTextMemberCount(page.text);
  if (text.count) {
    return safeCount(text, page.finalUrl, "text_section", candidatePages);
  }

  return { candidatePages };
}

export async function enrichLabMemberCount(
  labUrl: string | undefined,
  options: { context?: BrowserContext } = {},
): Promise<LabMemberCountResult> {
  if (!labUrl) {
    return { candidatePages: [] };
  }

  const loadPage: PageLoader = options.context
    ? (url) => fetchPlaywrightPage(options.context as BrowserContext, url)
    : fetchPage;
  const rootPage = await loadPage(labUrl);
  if (!rootPage) {
    return { candidatePages: [] };
  }

  const candidates = candidateMemberUrls(rootPage);
  const results: LabMemberCountResult[] = [];
  for (const candidate of candidates) {
    const result = await countMembersFromPage(candidate.url, candidates, loadPage);
    if (result.count) {
      results.push(result);
    }
  }

  if (results.length > 0) {
    return results.sort((a, b) => {
      const countDelta = (b.count ?? 0) - (a.count ?? 0);
      if (countDelta !== 0) {
        return countDelta;
      }
      if (a.method !== b.method) {
        return a.method === "structured_html_sections" ? -1 : 1;
      }
      return 0;
    })[0] as LabMemberCountResult;
  }

  return { candidatePages: candidates };
}
