import type { PageType } from "@kr-labs/db";
import type { DiscoveredLink, SchoolCrawlerConfig } from "../types.js";

const trackingParams = new Set(["fbclid", "gclid", "igshid", "mc_cid", "mc_eid"]);
const linkKeywords = [
  "학과",
  "대학원",
  "전공",
  "교수",
  "교수진",
  "구성원",
  "연구실",
  "연구분야",
  "연구",
  "논문",
  "실험실",
  "랩",
  "department",
  "graduate",
  "faculty",
  "professor",
  "people",
  "member",
  "lab",
  "laboratory",
  "research",
  "publication",
  "publications",
  "group",
];

export function normalizeUrl(rawUrl: string, baseUrl?: string): string | undefined {
  try {
    const url = new URL(rawUrl, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
      return undefined;
    }
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || trackingParams.has(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/$/, "");
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export function isAllowedDomain(url: string, allowedDomains: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function classifyPageType(url: string, text: string, config: SchoolCrawlerConfig): PageType {
  const urlLower = url.toLowerCase();
  if (/faculty|professor|people|교수|교원/.test(urlLower)) {
    return "faculty";
  }
  if (/graduate\/lab|\/lab(?:[_/-]?\d+)?(?:\.|\/|\?|$)|laboratory|연구실/.test(urlLower)) {
    return "lab";
  }
  if (/department|dept|학과|전공/.test(urlLower)) {
    return "department";
  }

  const haystack = `${url} ${text}`.toLowerCase();
  if (config.facultyKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
    return "faculty";
  }
  if (config.labKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
    return "lab";
  }
  if (config.departmentKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
    return "department";
  }
  if (/publication|논문|doi/i.test(haystack)) {
    return "publication";
  }
  return "unknown";
}

export function scoreLink(url: string, text: string, config: SchoolCrawlerConfig): number {
  const haystack = `${url} ${text}`.toLowerCase();
  let score = 0;
  for (const keyword of linkKeywords) {
    if (haystack.includes(keyword.toLowerCase())) {
      score += 5;
    }
  }
  if (config.includeUrlPatterns.some((pattern) => pattern.test(url) || pattern.test(text))) {
    score += 10;
  }
  if (config.excludeUrlPatterns.some((pattern) => pattern.test(url) || pattern.test(text))) {
    score -= 100;
  }
  if (!isAllowedDomain(url, config.allowedDomains)) {
    score -= 50;
  }
  return score;
}

export function discoverLinks(
  rawLinks: Array<{ href: string; text: string }>,
  baseUrl: string,
  config: SchoolCrawlerConfig,
): DiscoveredLink[] {
  const byUrl = new Map<string, DiscoveredLink>();

  for (const link of rawLinks) {
    const url = normalizeUrl(link.href, baseUrl);
    if (!url || !isAllowedDomain(url, config.allowedDomains)) {
      continue;
    }
    const text = link.text.replace(/\s+/g, " ").trim();
    const score = scoreLink(url, text, config);
    if (score < 0) {
      continue;
    }
    const existing = byUrl.get(url);
    const next = { url, text, score, pageType: classifyPageType(url, text, config) };
    if (!existing || next.score > existing.score) {
      byUrl.set(url, next);
    }
  }

  return [...byUrl.values()].sort((a, b) => b.score - a.score);
}
