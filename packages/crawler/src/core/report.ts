import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ValidationReport = {
  schoolSlug: string;
  jobId: string;
  status: string;
  generatedAt: string;
  pages: {
    total: number;
    success: number;
    failed: number;
    skipped: number;
    shortText: number;
  };
  counts: {
    departments: number;
    professors: number;
    labs: number;
    publications: number;
    openReviewItems: number;
    lowConfidenceItems: number;
  };
  duplicates: {
    professorEmails: Array<{ email: string; count: number }>;
    labUrls: Array<{ homepage_url: string; count: number }>;
  };
  needsReview: Array<Record<string, unknown>>;
  errors: Array<Record<string, unknown>>;
  samples: {
    departments: Array<Record<string, unknown>>;
    professors: Array<Record<string, unknown>>;
    labs: Array<Record<string, unknown>>;
  };
};

async function count(client: SupabaseClient, table: string, apply?: (query: any) => any): Promise<number> {
  const query = client.from(table).select("id", { count: "exact", head: true });
  const { count: result, error } = await (apply ? apply(query) : query);
  if (error) {
    throw error;
  }
  return result ?? 0;
}

async function shortTextPageCount(client: SupabaseClient, jobId: string): Promise<number> {
  const { data, error } = await client.from("crawl_pages").select("metadata").eq("crawl_job_id", jobId);
  if (error) {
    throw error;
  }
  return (data ?? []).filter((row: any) => Number(row.metadata?.textLength ?? 0) < 200).length;
}

function duplicateCounts(rows: Array<Record<string, unknown>> | null, key: string) {
  const counts = new Map<string, number>();
  for (const row of rows ?? []) {
    const value = row[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      continue;
    }
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, countValue]) => countValue > 1)
    .map(([value, countValue]) => ({ [key]: value, count: countValue })) as Array<any>;
}

async function latestJobId(client: SupabaseClient, schoolSlug: string): Promise<string> {
  const { data, error } = await client
    .from("crawl_jobs")
    .select("id")
    .eq("school_slug", schoolSlug)
    .in("job_type", ["discover_school", "update_labs"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data?.id ?? "no-crawl-job";
}

export async function buildValidationReport(client: SupabaseClient, schoolSlug: string, jobId?: string): Promise<ValidationReport> {
  const resolvedJobId = jobId ?? (await latestJobId(client, schoolSlug));
  const { data: university, error: universityError } = await client.from("universities").select("id").eq("slug", schoolSlug).maybeSingle();
  if (universityError) {
    throw universityError;
  }
  const universityId = university?.id;

  const [
    totalPages,
    successPages,
    failedPages,
    skippedPages,
    shortTextPages,
    departments,
    professors,
    labs,
    publications,
    openReviewItems,
  ] = await Promise.all([
    count(client, "crawl_pages", (query) => query.eq("crawl_job_id", resolvedJobId)),
    count(client, "crawl_pages", (query) => query.eq("crawl_job_id", resolvedJobId).eq("status", "success")),
    count(client, "crawl_pages", (query) => query.eq("crawl_job_id", resolvedJobId).eq("status", "failed")),
    count(client, "crawl_pages", (query) => query.eq("crawl_job_id", resolvedJobId).eq("status", "skipped")),
    shortTextPageCount(client, resolvedJobId),
    universityId ? count(client, "departments", (query) => query.eq("university_id", universityId)) : Promise.resolve(0),
    universityId ? count(client, "professors", (query) => query.eq("university_id", universityId)) : Promise.resolve(0),
    universityId ? count(client, "labs", (query) => query.eq("university_id", universityId)) : Promise.resolve(0),
    universityId ? count(client, "publications", (query) => query.eq("university_id", universityId)) : Promise.resolve(0),
    count(client, "review_items", (query) => query.eq("status", "open")),
  ]);

  const lowConfidenceItems = universityId
    ? (await Promise.all([
        count(client, "departments", (query) => query.eq("university_id", universityId).lt("crawl_confidence", 0.5)),
        count(client, "professors", (query) => query.eq("university_id", universityId).lt("crawl_confidence", 0.5)),
        count(client, "labs", (query) => query.eq("university_id", universityId).lt("crawl_confidence", 0.5)),
        count(client, "publications", (query) => query.eq("university_id", universityId).lt("crawl_confidence", 0.5)),
      ])).reduce((sum, value) => sum + value, 0)
    : 0;

  const [
    { data: errors },
    { data: needsReview },
    { data: sampleDepartments },
    { data: sampleProfessors },
    { data: sampleLabs },
    { data: professorEmails },
    { data: labUrls },
  ] =
    await Promise.all([
      client.from("crawl_errors").select("url,error_type,message,created_at").eq("crawl_job_id", resolvedJobId).order("created_at", { ascending: false }).limit(20),
      client.from("review_items").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(50),
      universityId ? client.from("departments").select("name_ko,name_en,homepage_url,source_url,crawl_confidence,status").eq("university_id", universityId).limit(10) : Promise.resolve({ data: [] }),
      universityId ? client.from("professors").select("name_ko,name_en,email,profile_url,lab_url,source_url,crawl_confidence,status").eq("university_id", universityId).limit(10) : Promise.resolve({ data: [] }),
      universityId
        ? client
            .from("labs")
            .select("name_ko,name_en,homepage_url,current_member_count,member_count_breakdown,source_url,crawl_confidence,status")
            .eq("university_id", universityId)
            .limit(10)
        : Promise.resolve({ data: [] }),
      universityId ? client.from("professors").select("email").eq("university_id", universityId).not("email", "is", null) : Promise.resolve({ data: [] }),
      universityId ? client.from("labs").select("homepage_url").eq("university_id", universityId).not("homepage_url", "is", null) : Promise.resolve({ data: [] }),
    ]);

  return {
    schoolSlug,
    jobId: resolvedJobId,
    status: failedPages > 0 ? "partial_success" : "success",
    generatedAt: new Date().toISOString(),
    pages: {
      total: totalPages,
      success: successPages,
      failed: failedPages,
      skipped: skippedPages,
      shortText: shortTextPages,
    },
    counts: {
      departments,
      professors,
      labs,
      publications,
      openReviewItems,
      lowConfidenceItems,
    },
    duplicates: {
      professorEmails: duplicateCounts(professorEmails, "email"),
      labUrls: duplicateCounts(labUrls, "homepage_url"),
    },
    needsReview: (needsReview ?? []) as Array<Record<string, unknown>>,
    errors: (errors ?? []) as Array<Record<string, unknown>>,
    samples: {
      departments: (sampleDepartments ?? []) as Array<Record<string, unknown>>,
      professors: (sampleProfessors ?? []) as Array<Record<string, unknown>>,
      labs: (sampleLabs ?? []) as Array<Record<string, unknown>>,
    },
  };
}

export async function writeValidationReport(report: ValidationReport, reportsDir = "reports") {
  await mkdir(reportsDir, { recursive: true });
  const baseName = `${report.schoolSlug}-${report.jobId}`;
  const jsonPath = join(reportsDir, `${baseName}.json`);
  const mdPath = join(reportsDir, `${baseName}.md`);

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, renderMarkdownReport(report), "utf8");

  return { jsonPath, mdPath };
}

function renderMarkdownReport(report: ValidationReport): string {
  const reviewRows = report.needsReview
    .slice(0, 20)
    .map((item) => `| ${item.entity_type ?? ""} | ${item.entity_id ?? ""} | ${item.reason ?? ""} | ${item.suggested_action ?? ""} |`)
    .join("\n");

  return `# Crawl Validation Report: ${report.schoolSlug}

- Job ID: ${report.jobId}
- Status: ${report.status}
- Generated At: ${report.generatedAt}
- Pages crawled: ${report.pages.total}
- Pages failed: ${report.pages.failed}
- Pages skipped: ${report.pages.skipped}
- Short text pages: ${report.pages.shortText}
- Departments found: ${report.counts.departments}
- Professors found: ${report.counts.professors}
- Labs found: ${report.counts.labs}
- Publications found: ${report.counts.publications}
- Low confidence items: ${report.counts.lowConfidenceItems}
- Open review items: ${report.counts.openReviewItems}

## Needs Review

| type | entity_id | reason | suggested_action |
|---|---|---|---|
${reviewRows || "|  |  |  |  |"}

## Recent Errors

${report.errors.map((error) => `- ${error.url ?? ""}: ${error.error_type ?? "error"} - ${error.message ?? ""}`).join("\n") || "- None"}
`;
}
