import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import {
  upsertDepartment,
  upsertLab,
  upsertProfessor,
  upsertUniversity,
} from "../packages/db/src/index.js";
import type { KhuGraduateDiscoveryReport, KhuFacultyCandidate } from "../packages/crawler/src/schools/khuGraduateDiscovery.js";

type ValidationStatus = {
  status?: string;
};

type RankingUniversity = {
  id: number;
  name: string;
};

type RankingProfessor = {
  id: number;
  name: string;
  department: string | null;
  lab_url: string | null;
};

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      args.set("help", true);
      continue;
    }
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

function printHelp() {
  console.log(`Usage: pnpm upsert:khu-grad [--confirm] [--allow-needs-review] [--report=reports/khu-grad-discovery.json] [--validation=reports/khu-grad-validation.json]

Dry-runs by default. With --confirm, upserts KHU graduate discovery data into
the detected Supabase schema. It supports both the crawler schema and the older
KR ranking schema currently used by the frontend.
`);
}

function createSupabaseWriter() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.SUPABASE_ANON_KEY
    ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase URL/key env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for dry-run/schema checks.");
  }
  return {
    client: createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      realtime: {
        transport: WebSocket as any,
      },
    }),
    credentialKind: process.env.SUPABASE_SERVICE_ROLE_KEY ? "service_role" : "publishable_or_anon",
  };
}

function hasCrawlerSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as { code?: string; message?: string };
  return candidate.code === "42703"
    || candidate.code === "PGRST205"
    || /column universities\.slug does not exist|Could not find the table/i.test(candidate.message ?? "");
}

async function hasCrawlerSchema(client: SupabaseClient): Promise<boolean> {
  const { error } = await client.from("universities").select("slug").limit(1);
  if (!error) {
    return true;
  }
  if (hasCrawlerSchemaError(error)) {
    return false;
  }
  throw error;
}

function taxonomyLabels(candidate: KhuFacultyCandidate) {
  return candidate.classification.matches.map((match) => match.labelKo);
}

function taxonomyIds(candidate: KhuFacultyCandidate) {
  return candidate.classification.matches.map((match) => match.fieldId);
}

function mapResearchSubFieldIds(labels: string[]): number[] {
  const mapped = labels.flatMap((label) => {
    switch (label) {
      case "AI":
      case "생성형 AI":
      case "AI Agent":
      case "멀티모달 AI":
      case "음성/오디오 AI":
        return [1];
      case "컴퓨터 비전":
        return [2];
      case "머신러닝":
      case "딥러닝":
        return [3];
      case "자연어처리":
      case "LLM":
        return [4];
      case "네트워크":
      case "RF/무선통신":
        return [7];
      case "보안":
        return [8];
      case "데이터베이스":
      case "데이터 분석":
        return [9];
      case "컴퓨터 구조":
        return [6];
      case "임베디드 시스템":
        return [11];
      case "고성능 컴퓨팅":
        return [12];
      case "소프트웨어 공학":
        return [17];
      case "암호/부호 이론":
        return [19];
      case "컴퓨터 그래픽스":
        return [22];
      case "경제학":
      case "금융 AI":
        return [24];
      case "아트&테크놀로지":
        return [25];
      case "로보틱스":
        return [26];
      case "시각화":
        return [27];
      default:
        return [];
    }
  });
  return [...new Set(mapped.length > 0 ? mapped : [55])];
}

function departmentLabel(candidate: KhuFacultyCandidate) {
  return [candidate.graduateSchoolName, candidate.departmentName]
    .filter((part, index, parts) => part && parts.indexOf(part) === index)
    .join(" / ");
}

function legacyNameVariants(name: string) {
  return [
    name,
    ...["겸직", "겸임", "학술연구", "객원", "초빙", "특임", "석좌", "명예"].map((suffix) => `${name} ${suffix}`),
  ];
}

async function upsertRankingUniversity(client: SupabaseClient, name: string): Promise<RankingUniversity> {
  const { data: existing, error: existingError } = await client.from("universities").select("id,name").eq("name", name).maybeSingle();
  if (existingError) {
    throw existingError;
  }
  if (existing) {
    return existing as RankingUniversity;
  }

  const { data, error } = await client.from("universities").insert({ name }).select("id,name").single();
  if (error) {
    throw error;
  }
  return data as RankingUniversity;
}

async function upsertRankingSchema(client: SupabaseClient, report: KhuGraduateDiscoveryReport) {
  const university = await upsertRankingUniversity(client, "경희대학교");
  const { data: existingRows, error: existingError } = await client
    .from("professors")
    .select("id,name,department,lab_url")
    .eq("university_id", university.id);
  if (existingError) {
    throw existingError;
  }

  const existingByKey = new Map(
    ((existingRows ?? []) as RankingProfessor[]).map((row) => [
      `${row.name}|${row.department ?? ""}|${row.lab_url ?? ""}`,
      row,
    ]),
  );
  const existingByNameAndLabUrl = new Map(
    ((existingRows ?? []) as RankingProfessor[]).map((row) => [
      `${row.name}|${row.lab_url ?? ""}`,
      row,
    ]),
  );
  let inserted = 0;
  let updated = 0;

  for (const candidate of report.facultyCandidates) {
    const payload = {
      name: candidate.nameKo ?? candidate.nameEn ?? "이름 미상",
      department: departmentLabel(candidate),
      paper_count: null,
      lab_member_count: candidate.currentMemberCount ?? null,
      lab_url: candidate.labUrl ?? null,
      scholar_url: candidate.scholarUrl ?? null,
      dblp_url: candidate.dblpUrl ?? null,
      university_id: university.id,
      research_sub_fields: mapResearchSubFieldIds(taxonomyLabels(candidate)),
    };
    const key = `${payload.name}|${payload.department}|${payload.lab_url ?? ""}`;
    const fallbackKey = `${payload.name}|${payload.lab_url ?? ""}`;
    const existing = existingByKey.get(key)
      ?? legacyNameVariants(payload.name).map((name) => existingByNameAndLabUrl.get(`${name}|${payload.lab_url ?? ""}`)).find(Boolean)
      ?? existingByNameAndLabUrl.get(fallbackKey);
    if (existing) {
      const { error } = await client.from("professors").update(payload).eq("id", existing.id);
      if (error) {
        throw error;
      }
      updated += 1;
      continue;
    }

    const { error } = await client.from("professors").insert(payload);
    if (error) {
      throw error;
    }
    inserted += 1;
  }

  return {
    university: university.id,
    inserted,
    updated,
    totalForUniversity: (existingRows ?? []).length + inserted,
  };
}

async function upsertCrawlerSchema(client: SupabaseClient, report: KhuGraduateDiscoveryReport) {
  const university = await upsertUniversity(client, {
    slug: "khu",
    nameKo: "경희대학교",
    nameEn: "Kyung Hee University",
    homepageUrl: "https://www.khu.ac.kr/",
  });
  const universityId = university.id;
  const departmentsByName = new Map<string, string>();
  let departmentUpserts = 0;
  let professorUpserts = 0;
  let labUpserts = 0;

  for (const candidate of report.facultyCandidates) {
    const departmentName = departmentLabel(candidate) || candidate.graduateSchoolName;
    if (!departmentsByName.has(departmentName)) {
      const school = report.schools.find((item) => item.name === candidate.graduateSchoolName);
      const row = await upsertDepartment(client, {
        universityId,
        nameKo: departmentName,
        collegeName: candidate.graduateSchoolName,
        homepageUrl: school?.homepageUrl,
        sourceUrl: candidate.sourceUrl,
        crawlConfidence: 0.78,
        status: "needs_review",
      });
      departmentsByName.set(departmentName, row.id);
      departmentUpserts += 1;
    }
  }

  for (const candidate of report.facultyCandidates) {
    const departmentId = departmentsByName.get(departmentLabel(candidate) || candidate.graduateSchoolName);
    const warnings = candidate.warnings.length > 0 || candidate.labUrlKind.startsWith("fallback");
    const professor = await upsertProfessor(client, {
      universityId,
      departmentId,
      nameKo: candidate.nameKo,
      nameEn: candidate.nameEn,
      title: candidate.title,
      email: candidate.email,
      profileUrl: candidate.profileUrl,
      labUrl: candidate.labUrl,
      researchInterests: candidate.researchText ? [candidate.researchText] : [],
      sourceUrl: candidate.sourceUrl,
      crawlConfidence: warnings ? 0.62 : 0.86,
      status: warnings ? "needs_review" : "active",
    });
    professorUpserts += 1;

    await upsertLab(client, {
      universityId,
      departmentId,
      professorId: professor.id,
      nameKo: candidate.labName ?? (candidate.nameKo ? `${candidate.nameKo} 연구실` : undefined),
      homepageUrl: candidate.labUrl,
      description: candidate.researchText,
      researchKeywords: taxonomyLabels(candidate),
      normalizedKeywords: taxonomyIds(candidate),
      currentMemberCount: candidate.currentMemberCount,
      memberCountBreakdown: candidate.memberCountBreakdown,
      memberCountSourceUrl: candidate.memberCountSourceUrl,
      memberCountCrawledAt: candidate.memberCountCrawledAt,
      sourceUrl: candidate.sourceUrl,
      lastCrawledAt: report.generatedAt,
      lastChangedAt: report.generatedAt,
      crawlConfidence: warnings ? 0.58 : 0.82,
      status: warnings ? "needs_review" : "active",
    });
    labUpserts += 1;
  }

  return {
    university: universityId,
    departments: departmentUpserts,
    professors: professorUpserts,
    labs: labUpserts,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const reportPath = String(args.get("report") ?? "reports/khu-grad-discovery.json");
  const validationPath = String(args.get("validation") ?? "reports/khu-grad-validation.json");
  const confirm = args.get("confirm") === true;
  const allowNeedsReview = args.get("allow-needs-review") === true;
  const report = JSON.parse(await readFile(reportPath, "utf8")) as KhuGraduateDiscoveryReport;
  const validation = JSON.parse(await readFile(validationPath, "utf8")) as ValidationStatus;
  const { client, credentialKind } = createSupabaseWriter();
  const schema = await hasCrawlerSchema(client) ? "crawler" : "ranking";

  if (validation.status === "failed") {
    throw new Error(`Validation failed in ${validationPath}; refusing to upsert.`);
  }
  if (validation.status === "needs_review" && confirm && !allowNeedsReview) {
    throw new Error("Validation status is needs_review. Re-run with --allow-needs-review after checking fallback/unknown fields.");
  }

  const summary = {
    reportPath,
    validationPath,
    validationStatus: validation.status,
    confirm,
    credentialKind,
    detectedSchema: schema,
    graduateSchools: report.schools.length,
    departments: report.summary.departmentCount,
    professors: report.facultyCandidates.length,
    nonFallbackLabUrls: report.summary.labUrlCount,
    fallbackLabUrls: report.summary.labUrlFallbackCount,
    memberCounts: report.summary.memberCountKnown,
    dblpUrls: report.summary.dblpUrlCount,
    scholarUrls: report.summary.scholarUrlCount,
    taxonomyClassified: report.summary.taxonomyClassifiedCount,
  };

  if (!confirm) {
    console.log(JSON.stringify({ mode: "dry-run", summary }, null, 2));
    return;
  }

  const upserted = schema === "crawler"
    ? await upsertCrawlerSchema(client, report)
    : await upsertRankingSchema(client, report);

  console.log(JSON.stringify({
    mode: "upsert",
    schema,
    summary,
    upserted,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
