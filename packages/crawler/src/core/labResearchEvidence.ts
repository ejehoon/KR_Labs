import type { BrowserContext } from "playwright";
import { cleanText, uniqueBy } from "./html.js";
import { snapshotPlaywrightPage, type PlaywrightPageSnapshot } from "./playwrightExtract.js";

export type LabResearchEvidenceResult = {
  text?: string;
  sourceUrl?: string;
  candidatePages: Array<{ url: string; score: number; reason: string }>;
  warnings: string[];
};

type ScoredLink = {
  url: string;
  score: number;
  reason: string;
};

const positiveLinkPattern = /research|intro|introduction|about|overview|profile|home|lab|laboratory|연구|소개|분야|개요|홈/i;
const negativeLinkPattern = /members?|people|students?|alumni|former|publication|papers?|news|notice|board|announcement|contact|login|privacy|calendar|seminar|gallery|photo|구성원|멤버|학생|졸업|논문|실적|게시|공지|뉴스|연락|오시는/i;
const weakResearchTextPattern = /research|laboratory|introduction|overview|연구|연구분야|소개|실험실|연구실|랩/i;
const noisyLinePattern = /announcement|notice|accepted|paper accepted|more|tel\.?|e-?mail|학생모집|모집|선정|공모|공지|전화|위치|지도 교수|연구실 위치/i;

export async function enrichLabResearchEvidence(
  context: BrowserContext,
  labUrl: string | undefined,
  labName: string | undefined,
): Promise<LabResearchEvidenceResult> {
  if (!labUrl) {
    return { candidatePages: [], warnings: ["lab_homepage_missing"] };
  }

  const candidatePages: ScoredLink[] = [];
  const warnings: string[] = [];
  const snapshots: PlaywrightPageSnapshot[] = [];

  try {
    const root = await snapshotPlaywrightPage(context, labUrl);
    snapshots.push(root);
    candidatePages.push({ url: root.finalUrl, score: scoreSnapshot(root, labName), reason: "lab_homepage_root" });

    const links = discoverResearchLinks(root).slice(0, 3);
    candidatePages.push(...links);
    for (const link of links) {
      try {
        snapshots.push(await snapshotPlaywrightPage(context, link.url));
      } catch (error) {
        warnings.push(`research_page_failed:${link.url}:${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    return {
      candidatePages,
      warnings: [`lab_homepage_research_failed:${error instanceof Error ? error.message : String(error)}`],
    };
  }

  const best = snapshots
    .filter((snapshot) => !isErrorPage(snapshot))
    .map((snapshot) => ({
      snapshot,
      score: scoreSnapshot(snapshot, labName),
      text: extractResearchText(snapshot, labName),
    }))
    .filter((item) => item.text)
    .sort((a, b) => b.score - a.score || (b.text?.length ?? 0) - (a.text?.length ?? 0))[0];

  return {
    text: best?.text,
    sourceUrl: best?.snapshot.finalUrl,
    candidatePages: uniqueBy(candidatePages, (page) => page.url).sort((a, b) => b.score - a.score),
    warnings,
  };
}

function isErrorPage(snapshot: PlaywrightPageSnapshot): boolean {
  return (snapshot.status !== undefined && snapshot.status >= 400)
    || /accounts\.google\.com\/lifecycle|\/signin|\/login|signup|로그인|가입|sign in|sign up|create your google account|내 컴퓨터가 아닌가요|시크릿 브라우징 창|게스트 모드 사용 방법/i.test(`${snapshot.title} ${snapshot.finalUrl} ${snapshot.text.slice(0, 500)}`)
    || /404|not found|페이지를 찾을 수 없습니다|존재하지 않아 요청하신 페이지|경로가 변경되었거나/i.test(`${snapshot.title} ${snapshot.finalUrl} ${snapshot.text.slice(0, 500)}`);
}

function discoverResearchLinks(root: PlaywrightPageSnapshot): ScoredLink[] {
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
        if (!positiveLinkPattern.test(haystack) || negativeLinkPattern.test(haystack)) {
          return undefined;
        }
        try {
          const url = new URL(link.href, root.finalUrl);
          if (url.hostname !== rootHostname || !/^https?:$/.test(url.protocol) || /\.(?:pdf|docx?|pptx?|xlsx?)(?:$|[?#])/i.test(url.pathname)) {
            return undefined;
          }
          const score = /research|연구|분야/i.test(haystack) ? 30 : /intro|introduction|about|소개/i.test(haystack) ? 24 : 12;
          return { url: url.toString(), score, reason: "research_intro_link" };
        } catch {
          return undefined;
        }
      })
      .filter((link): link is ScoredLink => Boolean(link)),
    (link) => link.url,
  ).sort((a, b) => b.score - a.score);
}

function scoreSnapshot(snapshot: PlaywrightPageSnapshot, labName: string | undefined): number {
  const text = `${snapshot.title} ${snapshot.headings.join(" ")} ${snapshot.text.slice(0, 8_000)}`;
  let score = 0;
  if (weakResearchTextPattern.test(text)) {
    score += 20;
  }
  if (/research|연구분야|주요 연구|연구 소개|lab intro|introduction/i.test(text)) {
    score += 20;
  }
  if (labName && cleanText(labName) && normalize(text).includes(normalize(labName))) {
    score += 14;
  }
  if (/members?|people|students?|alumni|publication|papers?|news|공지|구성원|논문|뉴스/i.test(snapshot.finalUrl)) {
    score -= 20;
  }
  return score;
}

function extractResearchText(snapshot: PlaywrightPageSnapshot, labName: string | undefined): string | undefined {
  const lines = snapshot.text
    .split(/\n| {2,}|(?<=[.!?。])\s+|(?<=다\.)\s+|(?<=다)\s+(?=[가-힣A-Z])/)
    .map((line) => cleanText(line))
    .filter((line): line is string => Boolean(line))
    .filter((line) => line.length >= 12)
    .filter((line) => !noisyLinePattern.test(line));

  const researchLines = lines.filter((line) => {
    const normalizedLine = normalize(line);
    return weakResearchTextPattern.test(line)
      || /반도체|컴퓨팅|메모리|소자|회로|시스템|설계|신뢰성|테스트|테스팅|분석|공정|알고리즘|데이터|바이오|에너지|소재|교통|건축|화학|물리/i.test(line)
      || Boolean(labName && normalize(labName).split(" ").some((part) => part.length >= 3 && normalizedLine.includes(part)));
  });

  const selected = researchLines.length > 0 ? researchLines : lines.slice(0, 8);
  return cleanText(uniqueBy(selected, (line) => line).slice(0, 12).join(" | "))?.slice(0, 3_500);
}

function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}
