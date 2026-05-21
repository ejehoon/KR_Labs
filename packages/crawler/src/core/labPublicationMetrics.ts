import type { BrowserContext } from "playwright";
import { cleanText, uniqueBy } from "./html.js";
import { snapshotPlaywrightPage, type PlaywrightPageSnapshot } from "./playwrightExtract.js";

export type LabPublicationCountResult = {
  count?: number;
  sourceUrl?: string;
  method?: "publication_page_lines";
  candidatePages: Array<{ url: string; score: number; reason: string }>;
  warnings: string[];
};

type ScoredLink = {
  url: string;
  score: number;
  reason: string;
};

const publicationSignalPattern = /publications?|papers?|selected[-_\s]?publications?|research[-_\s]?(?:outputs?|achievements?)|논문|연구실적|연구성과|학술/i;
const negativePublicationLinkPattern = /members?|people|students?|alumni|former|news|notice|board|announcement|contact|login|privacy|calendar|seminar|gallery|photo|구성원|멤버|학생|졸업|게시|공지|뉴스|연락|오시는/i;
const publicationLinePattern = /\b(?:19|20)\d{2}\b.*(?:doi|arxiv|ieee|acm|springer|elsevier|wiley|nature|science|cell|journal|conference|proceedings|transactions|letters|communications|advanced|acs|rsc|mdpi|frontiers|plos|논문|학회|저널|특허|patent)/i;
const noisyPublicationLinePattern = /accepted|award|news|notice|announcement|공지|수상|선정|모집|copyright|all rights reserved|google sites|불건전 게시물/i;
const maxAutomaticPublicationCount = Number(process.env.LAB_METRICS_MAX_PUBLICATION_COUNT ?? 1_000);

export async function enrichLabPublicationCount(
  context: BrowserContext,
  labUrl: string | undefined,
): Promise<LabPublicationCountResult> {
  if (!labUrl) {
    return { candidatePages: [], warnings: ["lab_homepage_missing"] };
  }

  const candidatePages: ScoredLink[] = [];
  const warnings: string[] = [];

  try {
    const root = await snapshotPlaywrightPage(context, labUrl);
    const rootScore = scorePublicationSnapshot(root);
    if (rootScore > 0) {
      candidatePages.push({ url: root.finalUrl, score: rootScore, reason: "root_publication_signal" });
    }

    const links = discoverPublicationLinks(root).slice(0, 4);
    candidatePages.push(...links);
    const snapshots: PlaywrightPageSnapshot[] = rootScore > 0 ? [root] : [];

    for (const link of links) {
      try {
        snapshots.push(await snapshotPlaywrightPage(context, link.url));
      } catch (error) {
        warnings.push(`publication_page_failed:${link.url}:${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const counted = snapshots
      .filter((snapshot) => !isErrorPage(snapshot))
      .filter((snapshot) => scorePublicationSnapshot(snapshot) > 0)
      .map((snapshot) => ({ snapshot, count: countPublicationLines(snapshot.text) }))
      .filter((item) => item.count >= 2 && item.count <= maxAutomaticPublicationCount)
      .sort((a, b) => b.count - a.count)[0];

    return {
      count: counted?.count,
      sourceUrl: counted?.snapshot.finalUrl,
      method: counted ? "publication_page_lines" : undefined,
      candidatePages: uniqueBy(candidatePages, (page) => page.url).sort((a, b) => b.score - a.score),
      warnings,
    };
  } catch (error) {
    return {
      candidatePages,
      warnings: [`lab_publication_count_failed:${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

function discoverPublicationLinks(root: PlaywrightPageSnapshot): ScoredLink[] {
  let rootHostname = "";
  try {
    rootHostname = new URL(root.finalUrl).hostname;
  } catch {
    return [];
  }

  return uniqueBy(
    root.links
      .map((link) => {
        const haystack = `${link.text} ${link.href} ${link.className ?? ""}`;
        if (!publicationSignalPattern.test(haystack) || negativePublicationLinkPattern.test(haystack)) {
          return undefined;
        }
        try {
          const url = new URL(link.href, root.finalUrl);
          if (url.hostname !== rootHostname || !/^https?:$/.test(url.protocol) || /\.(?:pdf|docx?|pptx?|xlsx?)(?:$|[?#])/i.test(url.pathname)) {
            return undefined;
          }
          const score = /publications?|papers?|논문|연구실적|연구성과/i.test(haystack) ? 30 : 16;
          return { url: url.toString(), score, reason: "publication_link" };
        } catch {
          return undefined;
        }
      })
      .filter((link): link is ScoredLink => Boolean(link)),
    (link) => link.url,
  ).sort((a, b) => b.score - a.score);
}

function scorePublicationSnapshot(snapshot: PlaywrightPageSnapshot): number {
  const haystack = `${snapshot.finalUrl} ${snapshot.title} ${snapshot.headings.join(" ")}`;
  let score = 0;
  if (publicationSignalPattern.test(haystack)) {
    score += 30;
  }
  if (/publications?|papers?|논문|연구실적|연구성과/i.test(snapshot.finalUrl)) {
    score += 20;
  }
  if (/news|notice|board|announcement|공지|뉴스|게시/i.test(snapshot.finalUrl)) {
    score -= 25;
  }
  return score;
}

function isErrorPage(snapshot: PlaywrightPageSnapshot): boolean {
  return (snapshot.status !== undefined && snapshot.status >= 400)
    || /accounts\.google\.com\/lifecycle|\/signin|\/login|signup|로그인|가입|sign in|sign up|create your google account/i.test(`${snapshot.title} ${snapshot.finalUrl} ${snapshot.text.slice(0, 500)}`)
    || /404|not found|페이지를 찾을 수 없습니다|존재하지 않아 요청하신 페이지|경로가 변경되었거나/i.test(`${snapshot.title} ${snapshot.finalUrl} ${snapshot.text.slice(0, 500)}`);
}

function countPublicationLines(text: string): number {
  const lines = text
    .split(/\n+|(?=\[\d+\])|(?=\b(?:19|20)\d{2}\b\s*[-.])|(?<=\.)\s+(?=(?:19|20)\d{2}\b|[A-Z][A-Za-z.-]+,\s+[A-Z])/)
    .map((line) => cleanText(line))
    .filter((line): line is string => Boolean(line))
    .filter((line) => line.length >= 35 && line.length <= 1_000)
    .filter((line) => publicationLinePattern.test(line))
    .filter((line) => !noisyPublicationLinePattern.test(line));

  return uniqueBy(lines, (line) => line.replace(/\s+/g, " ").toLowerCase()).length;
}
