import type { PageType } from "@kr-labs/db";

export type SchoolCrawlerConfig = {
  slug: "snu" | "yonsei" | "korea" | "kaist" | string;
  nameKo: string;
  nameEn?: string;
  homepageUrl: string;
  allowedDomains: string[];
  seedUrls: string[];
  includeUrlPatterns: RegExp[];
  excludeUrlPatterns: RegExp[];
  departmentKeywords: string[];
  facultyKeywords: string[];
  labKeywords: string[];
  maxDepth: number;
  maxPages: number;
  concurrency: number;
  delayMs: number;
};

export type DiscoveredLink = {
  url: string;
  text: string;
  score: number;
  pageType: PageType;
};

export type ExtractedPage = {
  url: string;
  finalUrl: string;
  domain: string;
  httpStatus?: number;
  title?: string;
  metaDescription?: string;
  extractedText: string;
  headings: string[];
  links: DiscoveredLink[];
  tablesText: string[];
  languageHint?: string;
  contentHash: string;
  pageType: PageType;
};

export type DepartmentCandidate = {
  nameKo?: string;
  nameEn?: string;
  homepageUrl?: string;
  sourceUrl: string;
  confidence: number;
};

export type ProfessorCandidate = {
  nameKo?: string;
  nameEn?: string;
  title?: string;
  email?: string;
  profileUrl?: string;
  labUrl?: string;
  researchInterests: string[];
  sourceUrl: string;
  confidence: number;
};

export type LabCandidate = {
  nameKo?: string;
  nameEn?: string;
  homepageUrl?: string;
  description?: string;
  researchKeywords: string[];
  currentMemberCount?: number;
  memberCountBreakdown?: Record<string, number>;
  sourceUrl: string;
  contentHash?: string;
  confidence: number;
};

export type PublicationCandidate = {
  title: string;
  authors: string[];
  venue?: string;
  year?: number;
  doi?: string;
  url?: string;
  sourceUrl: string;
  confidence: number;
};

export type EntityExtractionResult = {
  departments: DepartmentCandidate[];
  professors: ProfessorCandidate[];
  labs: LabCandidate[];
  publications: PublicationCandidate[];
};

export type CrawlMetrics = {
  visitedPages: number;
  successfulPages: number;
  failedPages: number;
  skippedPages: number;
  departmentsFound: number;
  professorsFound: number;
  labsFound: number;
  publicationsFound: number;
  reviewItemsCreated: number;
};
