import type { SchoolCrawlerConfig } from "../types.js";

export const kaistConfig: SchoolCrawlerConfig = {
  slug: "kaist",
  nameKo: "KAIST",
  nameEn: "Korea Advanced Institute of Science & Technology",
  homepageUrl: "https://www.kaist.ac.kr",
  allowedDomains: ["kaist.ac.kr"],
  seedUrls: ["https://www.kaist.ac.kr/kr/html/edu/0301.html"],
  includeUrlPatterns: [/kaist\.ac\.kr/i, /faculty|professor|people|lab|research|department|graduate/i, /교수|교수진|연구실|학과|대학원/i],
  excludeUrlPatterns: [/\.(pdf|zip|hwp|doc|docx|ppt|pptx|xls|xlsx)$/i, /\/(login|signin|privacy|policy|notice|news|event|calendar)\b/i],
  departmentKeywords: ["학과", "대학원", "전공", "department", "graduate", "school"],
  facultyKeywords: ["교수", "교수진", "구성원", "faculty", "professor", "people", "member"],
  labKeywords: ["연구실", "실험실", "랩", "lab", "laboratory", "research group"],
  maxDepth: Number(process.env.CRAWLER_MAX_DEPTH ?? 2),
  maxPages: Number(process.env.CRAWLER_MAX_PAGES ?? 50),
  concurrency: Number(process.env.CRAWLER_CONCURRENCY ?? 2),
  delayMs: Number(process.env.CRAWLER_DELAY_MS ?? 1000),
};
