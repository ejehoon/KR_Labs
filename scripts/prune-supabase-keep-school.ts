import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import dotenv from "dotenv";

dotenv.config();

type Args = {
  execute: boolean;
  keep: string;
};

const defaultKeepPattern = "서강|Sogang";

function parseArgs(argv: string[]): Args {
  const args = new Map<string, string | boolean>();
  for (const arg of argv) {
    if (arg === "--execute") {
      args.set("execute", true);
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      args.set(match[1], match[2]);
    }
  }

  return {
    execute: args.get("execute") === true,
    keep: String(args.get("keep") ?? defaultKeepPattern),
  };
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase credentials. Set SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY.");
  }
  return { url, key };
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<{ data: T; status: number; contentRange: string | null }> {
  const { url, key } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return { data: data as T, status: response.status, contentRange: response.headers.get("content-range") };
}

async function fetchAll<T>(table: string): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data } = await rest<T[]>(`${table}?select=*&limit=${pageSize}&offset=${offset}`, {
      headers: { Prefer: "count=exact" },
    });
    rows.push(...data);
    if (data.length < pageSize) {
      return rows;
    }
  }
}

function matchesKeepPattern(university: Record<string, unknown>, pattern: RegExp): boolean {
  const haystack = [university.name, university.name_ko, university.name_en, university.slug]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return pattern.test(haystack);
}

function notInFilter(ids: Array<string | number>): string {
  return `not.in.(${ids.join(",")})`;
}

async function deleteRows<T>(table: string, filter: string, execute: boolean): Promise<T[]> {
  if (!execute) {
    return [];
  }
  const { data } = await rest<T[]>(`${table}?${filter}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const keepPattern = new RegExp(args.keep, "i");
  const generatedAt = new Date().toISOString();
  const universities = await fetchAll<Record<string, unknown>>("universities");
  const professors = await fetchAll<Record<string, unknown>>("professors");
  const keepUniversities = universities.filter((university) => matchesKeepPattern(university, keepPattern));
  const keepIds = keepUniversities.map((university) => university.id).filter((id): id is string | number => typeof id === "string" || typeof id === "number");

  if (keepIds.length === 0) {
    throw new Error(`No universities matched --keep=${args.keep}`);
  }

  await mkdir("reports", { recursive: true });
  const backupPath = join("reports", `supabase-prune-backup-${generatedAt.replace(/[:.]/g, "-")}.json`);
  await writeFile(
    backupPath,
    JSON.stringify(
      {
        generatedAt,
        keepPattern: args.keep,
        keepUniversities,
        universities,
        professors,
      },
      null,
      2,
    ),
  );

  const professorUniversityIdType = professors.find((row) => row.university_id !== null && row.university_id !== undefined)?.university_id;
  const normalizedKeepIds = keepIds.map((id) => (typeof professorUniversityIdType === "number" ? Number(id) : String(id)));
  const keepIdSet = new Set(normalizedKeepIds.map(String));
  const deleteProfessorPreview = professors.filter((professor) => !keepIdSet.has(String(professor.university_id)));
  const deleteUniversityPreview = universities.filter((university) => !keepIdSet.has(String(university.id)));

  const deletedProfessors = await deleteRows<Record<string, unknown>>("professors", `university_id=${notInFilter(normalizedKeepIds)}`, args.execute);
  const deletedUniversities = await deleteRows<Record<string, unknown>>("universities", `id=${notInFilter(keepIds)}`, args.execute);

  const remainingUniversities = await fetchAll<Record<string, unknown>>("universities");
  const remainingProfessors = await fetchAll<Record<string, unknown>>("professors");

  console.log(JSON.stringify({
    mode: args.execute ? "execute" : "dry-run",
    backupPath,
    keepUniversities,
    before: {
      universities: universities.length,
      professors: professors.length,
    },
    plannedDelete: {
      universities: deleteUniversityPreview.length,
      professors: deleteProfessorPreview.length,
    },
    deleted: {
      universities: deletedUniversities.length,
      professors: deletedProfessors.length,
    },
    after: {
      universities: remainingUniversities.length,
      professors: remainingProfessors.length,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
