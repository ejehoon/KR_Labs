export type CrawlJobType = "discover_school" | "update_labs" | "validate" | "backfill";
export type CrawlJobStatus = "pending" | "running" | "success" | "failed" | "partial_success";
export type EntityStatus = "active" | "stale" | "inactive" | "needs_review";
export type PageType = "university" | "department" | "faculty" | "professor" | "lab" | "publication" | "unknown";

export type UniversityInput = {
  slug: string;
  nameKo: string;
  nameEn?: string;
  homepageUrl: string;
  country?: string;
};

export type DepartmentInput = {
  universityId: string;
  nameKo?: string;
  nameEn?: string;
  collegeName?: string;
  homepageUrl?: string;
  sourceUrl?: string;
  crawlConfidence?: number;
  status?: EntityStatus;
};

export type ProfessorInput = {
  universityId: string;
  departmentId?: string;
  nameKo?: string;
  nameEn?: string;
  title?: string;
  email?: string;
  profileUrl?: string;
  labUrl?: string;
  researchInterests?: string[];
  sourceUrl?: string;
  crawlConfidence?: number;
  status?: EntityStatus;
};

export type LabInput = {
  universityId: string;
  departmentId?: string;
  professorId?: string;
  nameKo?: string;
  nameEn?: string;
  homepageUrl?: string;
  description?: string;
  researchKeywords?: string[];
  normalizedKeywords?: string[];
  currentMemberCount?: number;
  memberCountBreakdown?: Record<string, number>;
  memberCountSourceUrl?: string;
  memberCountCrawledAt?: string;
  sourceUrl?: string;
  lastCrawledAt?: string;
  lastChangedAt?: string;
  contentHash?: string;
  crawlConfidence?: number;
  status?: EntityStatus;
};

export type PublicationInput = {
  universityId: string;
  labId?: string;
  professorId?: string;
  title: string;
  authors?: string[];
  venue?: string;
  year?: number;
  doi?: string;
  url?: string;
  abstract?: string;
  source?: string;
  sourceUrl?: string;
  crawlConfidence?: number;
};

export type CrawlPageInput = {
  crawlJobId: string;
  url: string;
  finalUrl?: string;
  domain?: string;
  pageType?: PageType;
  httpStatus?: number;
  title?: string;
  extractedText?: string;
  contentHash?: string;
  metadata?: Record<string, unknown>;
  status?: "success" | "failed" | "skipped" | "needs_review";
};

export type CrawlErrorInput = {
  crawlJobId: string;
  url?: string;
  errorType?: string;
  message: string;
  stack?: string;
  metadata?: Record<string, unknown>;
};

export type ReviewItemInput = {
  entityType: "department" | "professor" | "lab" | "publication" | "taxonomy_category";
  entityId?: string;
  reason: string;
  suggestedAction?: string;
  reviewKey?: string;
  priority?: 0 | 1 | 2 | 3;
  confidence?: number;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
};

export type DbRow = Record<string, unknown> & { id: string };
