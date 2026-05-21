import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createSupabaseAdmin } from "../packages/db/src/index.js";

type DbClient = ReturnType<typeof createSupabaseAdmin>;
type Row = Record<string, any>;

function parseArgs(argv: string[]) {
  const args = new Map<string, boolean>();
  for (const arg of argv) {
    if (arg === "--confirm") {
      args.set("confirm", true);
    }
  }
  return { confirm: args.get("confirm") === true };
}

async function fetchAll<T extends Row>(client: DbClient, table: string, select = "*"): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);
    if (error) {
      throw error;
    }
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < pageSize) {
      return rows;
    }
  }
}

function hanyangUniversity(row: Row): boolean {
  return [
    row.slug,
    row.name,
    row.name_ko,
    row.name_en,
    row.homepage_url,
  ].filter(Boolean).join(" ").match(/hanyang|한양대학교|한양대/i) !== null;
}

function hanyangReviewItem(row: Row, entityIds: Set<string>): boolean {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return [
    row.review_key,
    row.reason,
    row.source_url,
    metadata.schoolSlug,
    metadata.school,
    metadata.university,
  ].filter(Boolean).join(" ").match(/hanyang|한양대학교|한양대/i) !== null
    || (row.entity_id ? entityIds.has(String(row.entity_id)) : false);
}

async function deleteByIds(client: DbClient, table: string, ids: Array<string | number>, confirm: boolean) {
  if (!confirm || ids.length === 0) {
    return 0;
  }
  let deleted = 0;
  const chunkSize = 200;
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const { data, error } = await client
      .from(table)
      .delete()
      .in("id", chunk)
      .select("id");
    if (error) {
      throw error;
    }
    deleted += data?.length ?? 0;
  }
  return deleted;
}

async function main() {
  const { confirm } = parseArgs(process.argv.slice(2));
  const client = createSupabaseAdmin();
  const generatedAt = new Date().toISOString();

  const [
    universities,
    departments,
    professors,
    labs,
    publications,
    reviewItems,
    crawlJobs,
  ] = await Promise.all([
    fetchAll<Row>(client, "universities"),
    fetchAll<Row>(client, "departments").catch(() => []),
    fetchAll<Row>(client, "professors"),
    fetchAll<Row>(client, "labs").catch(() => []),
    fetchAll<Row>(client, "publications").catch(() => []),
    fetchAll<Row>(client, "review_items").catch(() => []),
    fetchAll<Row>(client, "crawl_jobs").catch(() => []),
  ]);

  const targetUniversities = universities.filter(hanyangUniversity);
  const universityIds = new Set(targetUniversities.map((row) => String(row.id)));
  const targetDepartments = departments.filter((row) => universityIds.has(String(row.university_id)));
  const targetProfessors = professors.filter((row) => universityIds.has(String(row.university_id)));
  const targetLabs = labs.filter((row) => universityIds.has(String(row.university_id)));
  const targetPublications = publications.filter((row) => universityIds.has(String(row.university_id)));
  const entityIds = new Set([
    ...targetDepartments,
    ...targetProfessors,
    ...targetLabs,
    ...targetPublications,
  ].map((row) => String(row.id)));
  const targetReviewItems = reviewItems.filter((row) => hanyangReviewItem(row, entityIds));
  const targetCrawlJobs = crawlJobs.filter((row) => String(row.school_slug ?? "").match(/hanyang/i));

  await mkdir("reports", { recursive: true });
  const backupPath = join("reports", `hanyang-supabase-reset-backup-${generatedAt.replace(/[:.]/g, "-")}.json`);
  await writeFile(backupPath, `${JSON.stringify({
    generatedAt,
    mode: confirm ? "execute" : "dry-run",
    targetUniversities,
    targetDepartments,
    targetProfessors,
    targetLabs,
    targetPublications,
    targetReviewItems,
    targetCrawlJobs,
  }, null, 2)}\n`, "utf8");

  const deleted = {
    reviewItems: await deleteByIds(client, "review_items", targetReviewItems.map((row) => row.id), confirm),
    publications: await deleteByIds(client, "publications", targetPublications.map((row) => row.id), confirm),
    labs: await deleteByIds(client, "labs", targetLabs.map((row) => row.id), confirm),
    professors: await deleteByIds(client, "professors", targetProfessors.map((row) => row.id), confirm),
    departments: await deleteByIds(client, "departments", targetDepartments.map((row) => row.id), confirm),
    crawlJobs: await deleteByIds(client, "crawl_jobs", targetCrawlJobs.map((row) => row.id), confirm),
    universities: await deleteByIds(client, "universities", targetUniversities.map((row) => row.id), confirm),
  };

  console.log(JSON.stringify({
    mode: confirm ? "execute" : "dry-run",
    backupPath,
    plannedDelete: {
      universities: targetUniversities.length,
      departments: targetDepartments.length,
      professors: targetProfessors.length,
      labs: targetLabs.length,
      publications: targetPublications.length,
      reviewItems: targetReviewItems.length,
      crawlJobs: targetCrawlJobs.length,
    },
    deleted,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
