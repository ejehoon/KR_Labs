import type { SchoolCrawlerConfig } from "../types.js";

export const koreaConfig: SchoolCrawlerConfig = {
  slug: "korea",
  nameKo: "고려대학교",
  nameEn: "Korea University",
  homepageUrl: "https://www.korea.ac.kr",
  allowedDomains: ["korea.ac.kr"],
  seedUrls: ["https://www.korea.ac.kr/mbshome/mbs/university/subview.do?id=university_020100000000"],
  includeUrlPatterns: [/korea\.ac\.kr/i, /faculty|professor|people|lab|research|department|graduate/i, /교수|교수진|연구실|학과|대학원/i],
  excludeUrlPatterns: [/\.(pdf|zip|hwp|doc|docx|ppt|pptx|xls|xlsx)$/i, /\/(login|signin|privacy|policy|notice|news|event|calendar)\b/i],
  departmentKeywords: ["학과", "대학원", "전공", "department", "graduate", "school"],
  facultyKeywords: ["교수", "교수진", "구성원", "faculty", "professor", "people", "member"],
  labKeywords: ["연구실", "실험실", "랩", "lab", "laboratory", "research group"],
  maxDepth: Number(process.env.CRAWLER_MAX_DEPTH ?? 2),
  maxPages: Number(process.env.CRAWLER_MAX_PAGES ?? 50),
  concurrency: Number(process.env.CRAWLER_CONCURRENCY ?? 2),
  delayMs: Number(process.env.CRAWLER_DELAY_MS ?? 1000),
};
