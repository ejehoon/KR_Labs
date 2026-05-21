import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CrawlErrorInput,
  CrawlJobStatus,
  CrawlJobType,
  CrawlPageInput,
  DbRow,
  DepartmentInput,
  LabInput,
  ProfessorInput,
  PublicationInput,
  ReviewItemInput,
  UniversityInput,
} from "./types.js";

function compact<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  ) as T;
}

function unique(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))];
}

function mergeArrays(a: unknown, b: unknown): string[] {
  return [...new Set([...unique(a), ...unique(b)])];
}

function preferNew(existing: DbRow | null, next: Record<string, unknown>, confidenceKey = "crawl_confidence") {
  if (!existing) {
    return next;
  }
  const existingConfidence = Number(existing[confidenceKey] ?? 0);
  const nextConfidence = Number(next[confidenceKey] ?? 0);
  const merged = { ...next };

  for (const [key, value] of Object.entries(next)) {
    if (Array.isArray(value)) {
      merged[key] = mergeArrays(existing[key], value);
      continue;
    }
    if ((value === undefined || value === null || value === "") && existing[key] !== undefined) {
      merged[key] = existing[key];
      continue;
    }
    if (existing[key] && existingConfidence > nextConfidence && ["name_ko", "name_en", "description", "source_url"].includes(key)) {
      merged[key] = existing[key];
    }
  }

  return merged;
}

async function singleOrNull(client: SupabaseClient, table: string, apply: (query: any) => any): Promise<DbRow | null> {
  const { data, error } = await apply(client.from(table).select("*").limit(1)).maybeSingle();
  if (error) {
    throw error;
  }
  return data as DbRow | null;
}

async function insertOrUpdate(client: SupabaseClient, table: string, existing: DbRow | null, payload: Record<string, unknown>) {
  if (existing) {
    const { data, error } = await client.from(table).update(compact(preferNew(existing, payload))).eq("id", existing.id).select("*").single();
    if (error) {
      throw error;
    }
    return data as DbRow;
  }

  const { data, error } = await client.from(table).insert(compact(payload)).select("*").single();
  if (error) {
    throw error;
  }
  return data as DbRow;
}

export async function upsertUniversity(client: SupabaseClient, input: UniversityInput) {
  const payload = {
    slug: input.slug,
    name_ko: input.nameKo,
    name_en: input.nameEn,
    homepage_url: input.homepageUrl,
    country: input.country ?? "KR",
    is_active: true,
  };
  const existing = await singleOrNull(client, "universities", (query) => query.eq("slug", input.slug));
  return insertOrUpdate(client, "universities", existing, payload);
}

export async function upsertDepartment(client: SupabaseClient, input: DepartmentInput) {
  const payload = {
    university_id: input.universityId,
    name_ko: input.nameKo,
    name_en: input.nameEn,
    college_name: input.collegeName,
    homepage_url: input.homepageUrl,
    source_url: input.sourceUrl,
    crawl_confidence: input.crawlConfidence ?? 0,
    status: input.status ?? (input.crawlConfidence !== undefined && input.crawlConfidence < 0.5 ? "needs_review" : "active"),
  };
  const existing =
    input.homepageUrl
      ? await singleOrNull(client, "departments", (query) => query.eq("university_id", input.universityId).eq("homepage_url", input.homepageUrl))
      : await singleOrNull(client, "departments", (query) =>
          query.eq("university_id", input.universityId).eq("name_ko", input.nameKo ?? "").eq("name_en", input.nameEn ?? ""),
        );
  return insertOrUpdate(client, "departments", existing, payload);
}

export async function upsertProfessor(client: SupabaseClient, input: ProfessorInput) {
  const payload = {
    university_id: input.universityId,
    department_id: input.departmentId,
    name_ko: input.nameKo,
    name_en: input.nameEn,
    title: input.title,
    email: input.email?.toLowerCase(),
    profile_url: input.profileUrl,
    lab_url: input.labUrl,
    research_interests: input.researchInterests ?? [],
    source_url: input.sourceUrl,
    crawl_confidence: input.crawlConfidence ?? 0,
    status: input.status ?? (input.crawlConfidence !== undefined && input.crawlConfidence < 0.5 ? "needs_review" : "active"),
  };

  const existing = input.email
    ? await singleOrNull(client, "professors", (query) => query.eq("university_id", input.universityId).eq("email", input.email?.toLowerCase()))
    : input.profileUrl
      ? await singleOrNull(client, "professors", (query) => query.eq("university_id", input.universityId).eq("profile_url", input.profileUrl))
      : input.departmentId
        ? await singleOrNull(client, "professors", (query) =>
            query.eq("university_id", input.universityId).eq("department_id", input.departmentId).eq("name_ko", input.nameKo ?? ""),
          )
        : await singleOrNull(client, "professors", (query) => query.eq("university_id", input.universityId).eq("name_ko", input.nameKo ?? ""));
  return insertOrUpdate(client, "professors", existing, payload);
}

export async function upsertLab(client: SupabaseClient, input: LabInput) {
  const payload = {
    university_id: input.universityId,
    department_id: input.departmentId,
    professor_id: input.professorId,
    name_ko: input.nameKo,
    name_en: input.nameEn,
    homepage_url: input.homepageUrl,
    description: input.description,
    research_keywords: input.researchKeywords ?? [],
    normalized_keywords: input.normalizedKeywords ?? [],
    current_member_count: input.currentMemberCount,
    member_count_breakdown: input.memberCountBreakdown,
    member_count_source_url: input.memberCountSourceUrl,
    member_count_crawled_at: input.memberCountCrawledAt,
    source_url: input.sourceUrl,
    last_crawled_at: input.lastCrawledAt,
    last_changed_at: input.lastChangedAt,
    content_hash: input.contentHash,
    crawl_confidence: input.crawlConfidence ?? 0,
    status: input.status ?? (input.crawlConfidence !== undefined && input.crawlConfidence < 0.5 ? "needs_review" : "active"),
  };
  const existing = input.homepageUrl
    ? await singleOrNull(client, "labs", (query) => query.eq("university_id", input.universityId).eq("homepage_url", input.homepageUrl))
    : input.professorId
      ? await singleOrNull(client, "labs", (query) => query.eq("university_id", input.universityId).eq("professor_id", input.professorId))
      : null;
  return insertOrUpdate(client, "labs", existing, payload);
}

export async function upsertPublication(client: SupabaseClient, input: PublicationInput) {
  const payload = {
    university_id: input.universityId,
    lab_id: input.labId,
    professor_id: input.professorId,
    title: input.title,
    authors: input.authors ?? [],
    venue: input.venue,
    year: input.year,
    doi: input.doi,
    url: input.url,
    abstract: input.abstract,
    source: input.source,
    source_url: input.sourceUrl,
    crawl_confidence: input.crawlConfidence ?? 0,
  };
  const existing = input.doi
    ? await singleOrNull(client, "publications", (query) => query.eq("doi", input.doi))
    : input.professorId
      ? await singleOrNull(client, "publications", (query) =>
          query.eq("professor_id", input.professorId).eq("title", input.title).eq("year", input.year ?? 0),
        )
      : null;
  return insertOrUpdate(client, "publications", existing, payload);
}

export async function createCrawlJob(client: SupabaseClient, input: { jobType: CrawlJobType; schoolSlug?: string; createdBy?: string }) {
  const { data, error } = await client
    .from("crawl_jobs")
    .insert({
      job_type: input.jobType,
      school_slug: input.schoolSlug,
      status: "running",
      created_by: input.createdBy ?? "system",
    })
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  return data as DbRow;
}

export async function finishCrawlJob(
  client: SupabaseClient,
  jobId: string,
  input: { status: CrawlJobStatus; metrics?: Record<string, unknown>; errorCount?: number },
) {
  const { data, error } = await client
    .from("crawl_jobs")
    .update({
      status: input.status,
      finished_at: new Date().toISOString(),
      metrics: input.metrics ?? {},
      error_count: input.errorCount ?? 0,
    })
    .eq("id", jobId)
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  return data as DbRow;
}

export async function insertCrawlPage(client: SupabaseClient, input: CrawlPageInput) {
  const { data, error } = await client
    .from("crawl_pages")
    .insert({
      crawl_job_id: input.crawlJobId,
      url: input.url,
      final_url: input.finalUrl,
      domain: input.domain,
      page_type: input.pageType ?? "unknown",
      http_status: input.httpStatus,
      title: input.title,
      extracted_text: input.extractedText,
      content_hash: input.contentHash,
      metadata: input.metadata ?? {},
      status: input.status ?? "success",
    })
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  return data as DbRow;
}

export async function insertCrawlError(client: SupabaseClient, input: CrawlErrorInput) {
  const { data, error } = await client
    .from("crawl_errors")
    .insert({
      crawl_job_id: input.crawlJobId,
      url: input.url,
      error_type: input.errorType,
      message: input.message,
      stack: input.stack,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  return data as DbRow;
}

export async function createReviewItem(client: SupabaseClient, input: ReviewItemInput) {
  const payload = {
    entity_type: input.entityType,
    entity_id: input.entityId,
    reason: input.reason,
    suggested_action: input.suggestedAction,
    review_key: input.reviewKey,
    priority: input.priority ?? 2,
    confidence: input.confidence,
    source_url: input.sourceUrl,
    metadata: input.metadata ?? {},
  };

  if (input.reviewKey) {
    const { data: existing, error: existingError } = await client
      .from("review_items")
      .select("id")
      .eq("review_key", input.reviewKey)
      .eq("status", "open")
      .maybeSingle();
    if (existingError) {
      throw existingError;
    }
    if (existing) {
      const { data, error } = await client
        .from("review_items")
        .update(compact(payload))
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      return data as DbRow;
    }
  }

  const { data, error } = await client
    .from("review_items")
    .insert(compact(payload))
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  return data as DbRow;
}
