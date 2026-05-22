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

const positiveLinkPattern = /research|intro|introduction|about|overview|profile|lab|laboratory|연구|소개|분야|개요/i;
const negativeLinkPattern = /members?|people|students?|alumni|former|publication|publications|papers?|journals?|conference|conferences|news|notice|board|announcement|contact|login|privacy|calendar|seminar|gallery|photo|구성원|멤버|학생|졸업|논문|실적|학술지|저널|컨퍼런스|게시|공지|뉴스|연락|오시는/i;
const weakResearchTextPattern = /research|laboratory|introduction|overview|연구|연구분야|소개|실험실|연구실|랩/i;
const noisyLinePattern = /announcement|notice|accepted|paper accepted|journal papers?|international journals?|domestic journals?|conference|more|tel\.?|e-?mail|학생모집|모집|선정|공모|공지|전화|위치|지도 교수|연구실 위치|메뉴 바로가기|주메뉴 바로가기|컨텐츠 바로가기|본문 바로가기|copyright|all rights reserved|created by|google sites 불건전/i;

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

    const links = discoverResearchLinks(root).slice(0, 5);
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

  const scoredSnapshots = snapshots
    .filter((snapshot) => !isErrorPage(snapshot))
    .map((snapshot) => ({
      snapshot,
      score: scoreSnapshot(snapshot, labName),
      text: extractResearchText(snapshot, labName),
    }))
    .filter((item) => item.text);

  const usableSnapshots = scoredSnapshots.filter((item) => (item.text?.length ?? 0) >= 120);
  const best = (usableSnapshots.length > 0 ? usableSnapshots : scoredSnapshots)
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
  if (/research areas?|research interests?|주요 연구분야|연구 분야/i.test(text)) {
    score += 24;
  }
  if (/\/(?:research|researches|research-area|research_areas?)(?:\/|\.html?|$)|[?&]go=research\b|연구/i.test(snapshot.finalUrl)) {
    score += 34;
  }
  if (/publication|publications|papers?|journals?|conference|conferences|논문|학술지|저널|컨퍼런스/i.test(snapshot.finalUrl)) {
    score -= 28;
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
  const cleanedText = stripPageChrome([snapshot.headings.join("\n"), snapshot.text].filter(Boolean).join("\n"));
  const lines = cleanedText
    .split(/\n| {2,}|(?<=[.!?。])\s+|(?<=다\.)\s+|(?<=다)\s+(?=[가-힣A-Z])/)
    .map((line) => cleanText(line))
    .filter((line): line is string => Boolean(line))
    .filter((line) => line.length >= 8)
    .filter((line) => !noisyLinePattern.test(line));

  const researchLines = lines.filter((line) => {
    const normalizedLine = normalize(line);
    return weakResearchTextPattern.test(line)
      || /반도체|컴퓨팅|메모리|소자|회로|시스템|설계|신뢰성|테스트|테스팅|분석|공정|알고리즘|데이터|바이오|에너지|소재|교통|물류|생산|제조|스케줄링|재제조|공급망|건축|화학|물리|양자|광학|포토닉|위상|응집물질|인공지능|딥러닝|심층학습|자연어|컴퓨터비전|시계열|데이터마이닝|헬스케어|진단|재활|로봇|자율주행|보안|프라이버시|artificial intelligence|machine learning|deep learning|natural language|computer vision|time[- ]?series|data mining|big data|multimodal|multi[- ]?object|tracking|healthcare|medical|diagnostic|rehabilitation|robotics|autonomous|privacy|security|quantum|photonic|topological|condensed matter|non-hermitian|semiconductor|superconductor|vector|retrieval|summarization|manufacturing|production planning|scheduling|inventory|reverse logistics|remanufacturing|lot[- ]?sizing|operations research|supply chain/i.test(line)
      || Boolean(labName && normalize(labName).split(" ").some((part) => part.length >= 3 && normalizedLine.includes(part)));
  });

  const selected = researchLines.length > 0 ? researchLines : lines.slice(0, 8);
  return cleanText(uniqueBy(selected, (line) => line).slice(0, 12).join(" | "))?.slice(0, 3_500);
}

function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function stripPageChrome(text: string): string {
  return text
    .replace(/\b(?:TEL|Tel|전화번호|Email|E-mail)\b[\s\S]*$/i, "")
    .replace(/(?:Selected Papers?|Publications?)\b[\s\S]*$/i, "")
    .replace(/Copyright[\s\S]*$/i, "")
    .replace(/Google Sites 불건전 게시물 신고[\s\S]*$/i, "")
    .replace(/메뉴 바로가기|주메뉴 바로가기|컨텐츠 바로가기|본문 바로가기|메인 콘텐츠로 건너뛰기|탐색으로 건너뛰기/gi, "\n");
}
