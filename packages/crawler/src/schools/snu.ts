import type { SchoolCrawlerConfig } from "../types.js";

const commonKeywords = [
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

export const snuConfig: SchoolCrawlerConfig = {
  slug: "snu",
  nameKo: "서울대학교",
  nameEn: "Seoul National University",
  homepageUrl: "https://www.snu.ac.kr",
  allowedDomains: ["snu.ac.kr"],
  seedUrls: [
    "https://www.snu.ac.kr/academics/undergraduate/colleges",
    "https://cse.snu.ac.kr/people/faculty",
    "https://gsai.snu.ac.kr/faculty",
  ],
  includeUrlPatterns: [
    /snu\.ac\.kr/i,
    /faculty|professor|people|member|lab|research|department|graduate/i,
    /교수|교수진|구성원|연구실|학과|대학원/i,
  ],
  excludeUrlPatterns: [
    /\.(pdf|zip|hwp|doc|docx|ppt|pptx|xls|xlsx)$/i,
    /\/(login|signin|privacy|policy|notice|news|event|calendar)\b/i,
  ],
  departmentKeywords: ["학과", "대학원", "전공", "department", "graduate", "school"],
  facultyKeywords: ["교수", "교수진", "구성원", "faculty", "professor", "people", "member"],
  labKeywords: ["연구실", "실험실", "랩", "lab", "laboratory", "research group"],
  maxDepth: Number(process.env.CRAWLER_MAX_DEPTH ?? 2),
  maxPages: Number(process.env.CRAWLER_MAX_PAGES ?? 50),
  concurrency: Number(process.env.CRAWLER_CONCURRENCY ?? 2),
  delayMs: Number(process.env.CRAWLER_DELAY_MS ?? 1000),
};

export const snuLinkKeywords = commonKeywords;
