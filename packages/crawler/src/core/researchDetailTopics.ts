import { cleanText, uniqueBy } from "./html.js";

const TOPIC_STOP_PATTERN = /^(?:home|about|members?|researches?|projects?|lab activity|journal papers?|international journals?|domestic journals?|conference|conferences?|research areas?|how to apply|개인정보처리방침|이메일무단수집거부|copyright|tel|email|책임자|관리자|담당자)$/i;
const TOPIC_NOISE_PATTERN = /(?:@|https?:\/\/|www\.|copyright|all rights reserved|개인정보처리방침|이메일무단수집거부|탐색|내용으로 건너뛰기|전화|위치|공지|모집)/i;

export function extractResearchDetailTopics(text: string | undefined): string[] {
  if (!text) {
    return [];
  }

  const normalized = cleanText(text)
    ?.replace(/^[\s\S]*?\bResearch Areas?\b/i, "Research Areas")
    .replace(/^[\s\S]*?(?=■\s*)/, "");
  if (!normalized) {
    return [];
  }

  const chunks = normalized
    .split(/\s+\|\s+|\n|;|，|、/)
    .flatMap((chunk) => expandCompactResearchAreaChunk(chunk))
    .flatMap((chunk) => splitCommaTopics(chunk))
    .map((chunk) => cleanTopic(chunk))
    .filter((chunk): chunk is string => Boolean(chunk))
    .filter((chunk) => chunk.length >= 3 && chunk.length <= 120)
    .filter((chunk) => !TOPIC_STOP_PATTERN.test(chunk))
    .filter((chunk) => !TOPIC_NOISE_PATTERN.test(chunk));

  return uniqueBy(chunks, (chunk) => chunk.toLowerCase()).slice(0, 32);
}

function expandCompactResearchAreaChunk(chunk: string): string[] {
  const cleaned = chunk
    .replace(/^Research Areas?\s*/i, "")
    .replace(/^\d+\s+Research Members\s+\d+\s+Research Projects\s+\d+\s+Publications\s*/i, "")
    .replace(/^작성일\s*:.*?조회\s*:\s*[\d,]+\s*/i, "")
    .replace(/^■\s*/, "")
    .trim();
  if (!cleaned) {
    return [];
  }

  const boundaryPatterns = [
    /\b(Design and Operation of Manufacturing Systems)\s+(Production Planning\b[\s\S]*)/i,
    /\b(Environmentally Conscious Design & Manufacturing \(ECD&M\))\s+(Reverse Logistics\b[\s\S]*)/i,
    /\b(Industrial Applications)\s+(Flexible Manufacturing\b[\s\S]*)/i,
  ];
  for (const pattern of boundaryPatterns) {
    const match = cleaned.match(pattern);
    if (match?.[1] && match[2]) {
      return [match[1], match[2]];
    }
  }

  if (/[○■]\s| - /.test(cleaned)) {
    return cleaned
      .split(/\s*(?:[○■]\s+|\s+-\s+)/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return [cleaned];
}

function splitCommaTopics(chunk: string): string[] {
  const cleaned = chunk.trim();
  if (!cleaned.includes(",")) {
    return [cleaned];
  }

  if (/[가-힣]/.test(cleaned)) {
    return [cleaned];
  }

  const commaParts = cleaned
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (commaParts.length <= 1) {
    return [cleaned];
  }

  const usableParts = commaParts.filter((part) => /[가-힣A-Za-z]/.test(part) && part.length >= 3 && part.length <= 90);
  return usableParts.length >= 2 ? usableParts : [cleaned];
}

function cleanTopic(topic: string): string | undefined {
  const cleaned = cleanText(topic)
    ?.replace(/^작성일\s*:.*$/i, "")
    .replace(/^글쓴이\s*:.*$/i, "")
    .replace(/^조회\s*:.*$/i, "")
    .replace(/^그림\s*\d+\.?.*$/i, "")
    .replace(/^Figure\s*\d+\.?.*$/i, "")
    ?.replace(/\betc\.?$/i, "")
    .replace(/\s+\(\s*\)$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[,.，、;:：-]+$/g, "")
    .trim();
  if (!cleaned || /^\d+$/.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}
