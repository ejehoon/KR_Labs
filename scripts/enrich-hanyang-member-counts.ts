import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";
import { enrichLabMemberCount } from "../packages/crawler/src/core/labMetrics.js";
import { createSupabaseAdmin } from "../packages/db/src/supabaseAdmin.js";

type ProfessorRow = {
  id: string;
  name: string;
  department: string | null;
  lab_url: string | null;
};

type ResultRow = {
  id: string;
  name: string;
  department: string | null;
  labUrl: string | null;
  status: "updated" | "not_found" | "skipped";
  count?: number;
  breakdown?: Record<string, number>;
  sourceUrl?: string;
  reason?: string;
};

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (const arg of argv) {
    if (arg.startsWith("--") && !arg.includes("=")) {
      args.set(arg.slice(2), true);
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      args.set(match[1] ?? "", match[2] ?? "");
    }
  }
  return args;
}

function optionalNumber(value: string | boolean | undefined): number | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isEligiblePersonalLabUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const pathAndQuery = `${parsed.pathname.toLowerCase()}?${parsed.searchParams}`;
    if (["grad.hanyang.ac.kr", "www.grad.hanyang.ac.kr", "hanyang.ac.kr", "www.hanyang.ac.kr"].includes(host)) {
      return false;
    }
    if (/docs\.google\.com|shinyapps\.io|cafe\.naver\.com/i.test(host)) {
      return false;
    }
    if (/faculty|professor|profile|교수진|교수소개|전임교원|departmentintro|lab_03\.php|board\.php.*web_professor|\/[^/]*-/.test(pathAndQuery)) {
      return false;
    }
    if (host.endsWith(".hanyang.ac.kr") && parsed.pathname !== "/" && !/lab|members?|people|team|students?|group|구성원|멤버|맴버|학생|연구원|연구실/i.test(parsed.pathname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item !== undefined) {
        results[index] = await worker(item);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function latestHanyangUniversityId(client: ReturnType<typeof createSupabaseAdmin>): Promise<number> {
  const { data, error } = await client
    .from("universities")
    .select("id,name")
    .eq("name", "한양대학교")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data?.id) {
    throw new Error("한양대학교 university row를 찾지 못했습니다.");
  }
  return Number(data.id);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const confirm = args.get("confirm") === true;
  const limit = optionalNumber(args.get("limit"));
  const concurrency = optionalNumber(args.get("concurrency")) ?? 4;
  const client = createSupabaseAdmin();
  const universityId = optionalNumber(args.get("university-id")) ?? await latestHanyangUniversityId(client);

  const { data, error } = await client
    .from("professors")
    .select("id,name,department,lab_url")
    .eq("university_id", universityId)
    .not("lab_url", "is", null)
    .order("name");
  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as ProfessorRow[]).filter((row) => isEligiblePersonalLabUrl(row.lab_url));
  const selectedRows = typeof limit === "number" ? rows.slice(0, limit) : rows;
  const browser = await createBrowserManager();
  const cache = new Map<string, Awaited<ReturnType<typeof enrichLabMemberCount>>>();

  try {
    const results = await mapWithConcurrency(selectedRows, concurrency, async (row): Promise<ResultRow> => {
      const labUrl = row.lab_url;
      if (!labUrl) {
        return { id: row.id, name: row.name, department: row.department, labUrl, status: "skipped", reason: "lab_url 없음" };
      }
      const cached = cache.get(labUrl);
      const metric = cached ?? await enrichLabMemberCount(labUrl, { context: browser.context });
      cache.set(labUrl, metric);
      if (typeof metric.count !== "number") {
        return { id: row.id, name: row.name, department: row.department, labUrl, status: "not_found", reason: "현재 구성원 페이지/인원 확인 불가" };
      }
      if (confirm) {
        const { error: updateError } = await client
          .from("professors")
          .update({ lab_member_count: metric.count })
          .eq("id", row.id);
        if (updateError) {
          throw updateError;
        }
      }
      return {
        id: row.id,
        name: row.name,
        department: row.department,
        labUrl,
        status: "updated",
        count: metric.count,
        breakdown: metric.breakdown,
        sourceUrl: metric.sourceUrl,
      };
    });

    await mkdir("reports", { recursive: true });
    const summary = {
      universityId,
      confirm,
      eligibleRows: rows.length,
      processedRows: selectedRows.length,
      updatedRows: results.filter((row) => row.status === "updated").length,
      notFoundRows: results.filter((row) => row.status === "not_found").length,
    };
    await writeFile("reports/hanyang-member-count-enrichment.json", `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2)}\n`);
    console.log(JSON.stringify({ reportPath: "reports/hanyang-member-count-enrichment.json", summary }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
