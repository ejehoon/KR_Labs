import "dotenv/config";
import { readFile } from "node:fs/promises";
import {
  createCrawlJob,
  createReviewItem,
  createSupabaseAdmin,
  finishCrawlJob,
  insertCrawlError,
  upsertDepartment,
  upsertLab,
  upsertProfessor,
  upsertUniversity,
} from "@kr-labs/db";
import type { UosGraduateDiscoveryReport } from "../packages/crawler/src/schools/uosGraduateDiscovery.js";

type ValidationFile = {
  status?: string;
};

type DbClient = any;
type RankingUniversity = { id: number; name: string };
type RankingProfessor = { id: number; name: string; department: string | null; lab_url: string | null };

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      args.set("help", true);
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
  console.log(`Usage: pnpm upsert:uos-grad [--report=reports/uos-grad-discovery.json] [--validation=reports/uos-grad-discovery-validation.json]

Upserts validated University of Seoul graduate discovery data into the crawler
Supabase schema. Blocks when validation status is failed.
`);
}

function splitKeywords(matches: Array<{ labelKo: string }> | undefined) {
  return [...new Set((matches ?? []).map((match) => match.labelKo).filter(Boolean))];
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
      case "바이오역학/의공학":
      case "생명과학":
      case "유전체/정밀의학":
        return [21];
      case "컴퓨터 그래픽스":
        return [22];
      case "경제학":
      case "금융 AI":
        return [24];
      case "아트&테크놀로지":
      case "AI 예술/콘텐츠":
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

function normalizeUrlKey(url: string | null | undefined): string {
  return (url ?? "").trim().replace(/\/+$/, "").toLowerCase();
}

function rankingExactKey(row: Pick<RankingProfessor, "name" | "department" | "lab_url">): string {
  return `${row.name}|${row.department ?? ""}|${normalizeUrlKey(row.lab_url)}`;
}

function rankingIdentityKey(row: Pick<RankingProfessor, "name" | "department" | "lab_url">): string {
  const urlKey = normalizeUrlKey(row.lab_url);
  return urlKey ? `${row.name}|${urlKey}` : `${row.name}|${row.department ?? ""}`;
}

function isMissingCrawlerSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as { code?: string; message?: string };
  return candidate.code === "PGRST205" || candidate.code === "42703" || /schema cache|crawl_jobs|column universities\.slug does not exist/i.test(candidate.message ?? "");
}

async function hasCrawlerSchema(client: DbClient): Promise<boolean> {
  const { error: jobError } = await client.from("crawl_jobs").select("id").limit(1);
  if (jobError) {
    if (isMissingCrawlerSchema(jobError)) {
      return false;
    }
    throw jobError;
  }
  const { error: universityError } = await client.from("universities").select("slug").limit(1);
  if (universityError) {
    if (isMissingCrawlerSchema(universityError)) {
      return false;
    }
    throw universityError;
  }
  return true;
}

async function upsertRankingUniversity(client: DbClient, name: string): Promise<RankingUniversity> {
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

async function upsertRankingSchema(client: DbClient, report: UosGraduateDiscoveryReport) {
  const university = await upsertRankingUniversity(client, "서울시립대학교");
  const { data: existingRows, error: existingError } = await client
    .from("professors")
    .select("id,name,department,lab_url")
    .eq("university_id", university.id);
  if (existingError) {
    throw existingError;
  }

  const existingByExactKey = new Map<string, RankingProfessor>();
  const existingByIdentityKey = new Map<string, RankingProfessor>();
  for (const row of (existingRows ?? []) as RankingProfessor[]) {
    existingByExactKey.set(rankingExactKey(row), row);
    const identityKey = rankingIdentityKey(row);
    if (!existingByIdentityKey.has(identityKey)) {
      existingByIdentityKey.set(identityKey, row);
    }
  }

  let inserted = 0;
  let updated = 0;
  for (const candidate of report.facultyCandidates) {
    const labels = splitKeywords(candidate.classification?.matches);
    const payload = {
      name: candidate.nameKo ?? "이름 미상",
      department: candidate.sourceDepartmentName,
      paper_count: candidate.paperCount ?? 0,
      lab_member_count: candidate.currentMemberCount ?? null,
      lab_url: candidate.labUrl ?? null,
      scholar_url: candidate.scholarUrl ?? null,
      dblp_url: candidate.dblpUrl ?? null,
      university_id: university.id,
      research_sub_fields: mapResearchSubFieldIds(labels),
    };
    const exactKey = rankingExactKey(payload);
    const identityKey = rankingIdentityKey(payload);
    const existing = existingByExactKey.get(exactKey) ?? existingByIdentityKey.get(identityKey);
    if (existing) {
      const { error } = await client.from("professors").update(payload).eq("id", existing.id);
      if (error) {
        throw error;
      }
      updated += 1;
      existingByExactKey.set(exactKey, { ...existing, ...payload });
      existingByIdentityKey.set(identityKey, { ...existing, ...payload });
      continue;
    }
    const { data, error } = await client.from("professors").insert(payload).select("id,name,department,lab_url").single();
    if (error) {
      throw error;
    }
    inserted += 1;
    const insertedRow = data as RankingProfessor;
    existingByExactKey.set(rankingExactKey(insertedRow), insertedRow);
    existingByIdentityKey.set(rankingIdentityKey(insertedRow), insertedRow);
  }

  return {
    university: university.id,
    inserted,
    updated,
    totalForUniversity: (existingRows ?? []).length + inserted,
  };
}

async function readValidationStatus(path: string): Promise<string | undefined> {
  try {
    return (JSON.parse(await readFile(path, "utf8")) as ValidationFile).status;
  } catch {
    return undefined;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const reportPath = String(args.get("report") ?? "reports/uos-grad-discovery.json");
  const validationPath = String(args.get("validation") ?? "reports/uos-grad-discovery-validation.json");
  const validationStatus = await readValidationStatus(validationPath);
  if (validationStatus === "failed") {
    throw new Error(`Validation failed in ${validationPath}; refusing Supabase upsert.`);
  }

  const report = JSON.parse(await readFile(reportPath, "utf8")) as UosGraduateDiscoveryReport;
  const client = createSupabaseAdmin();
  const schema = await hasCrawlerSchema(client) ? "crawler" : "ranking";

  if (schema === "ranking") {
    const upserted = await upsertRankingSchema(client, report);
    console.log(JSON.stringify({
      schema,
      validationStatus: validationStatus ?? "not_found",
      departments: report.departments.length,
      professors: report.facultyCandidates.length,
      labs: report.facultyCandidates.length,
      externalLabUrls: report.summary.externalLabUrlCount,
      fallbackLabUrls: report.summary.fallbackLabUrlCount,
      memberCountKnown: report.summary.memberCountKnown,
      upserted,
      note: "Legacy ranking schema detected; review_items/crawl_jobs were not available, so manual-review details remain in reports.",
    }, null, 2));
    return;
  }

  const job = await createCrawlJob(client, { jobType: "discover_school", schoolSlug: "uos", createdBy: "uos-grad-upsert" });
  let errorCount = 0;

  try {
    const university = await upsertUniversity(client, {
      slug: "uos",
      nameKo: "서울시립대학교",
      nameEn: "University of Seoul",
      homepageUrl: "https://www.uos.ac.kr/",
    });

    const departmentIds = new Map<string, string>();
    for (const department of report.departments) {
      try {
        const row = await upsertDepartment(client, {
          universityId: university.id,
          nameKo: department.name,
          collegeName: department.category,
          homepageUrl: department.homepageUrl,
          sourceUrl: department.detailUrl ?? department.listUrl,
          crawlConfidence: department.warnings.length > 0 ? 0.72 : 0.93,
          status: department.warnings.length > 0 ? "needs_review" : "active",
        });
        departmentIds.set(department.name, row.id);
      } catch (error) {
        errorCount += 1;
        await insertCrawlError(client, {
          crawlJobId: job.id,
          url: department.detailUrl ?? department.listUrl,
          errorType: "department_upsert_failed",
          message: error instanceof Error ? error.message : String(error),
          metadata: { department: department.name },
        });
      }
    }

    let professorCount = 0;
    let labCount = 0;
    for (const candidate of report.facultyCandidates) {
      try {
        const departmentId = departmentIds.get(candidate.sourceDepartmentName);
        const professor = await upsertProfessor(client, {
          universityId: university.id,
          departmentId,
          nameKo: candidate.nameKo,
          title: candidate.title,
          email: candidate.email,
          profileUrl: candidate.profileUrl,
          labUrl: candidate.labUrl,
          researchInterests: candidate.researchText ? [candidate.researchText] : [],
          sourceUrl: candidate.sourceUrl,
          crawlConfidence: candidate.warnings.length > 0 ? 0.68 : 0.9,
          status: candidate.warnings.length > 0 ? "needs_review" : "active",
        });
        professorCount += 1;

        const lab = await upsertLab(client, {
          universityId: university.id,
          departmentId,
          professorId: professor.id,
          nameKo: candidate.labName ?? (candidate.nameKo ? `${candidate.nameKo} 연구실` : undefined),
          homepageUrl: candidate.labUrl,
          description: candidate.researchText,
          researchKeywords: splitKeywords(candidate.classification?.matches),
          currentMemberCount: candidate.currentMemberCount,
          memberCountBreakdown: candidate.memberCountBreakdown,
          memberCountSourceUrl: candidate.memberCountSourceUrl,
          memberCountCrawledAt: candidate.memberCountCrawledAt,
          sourceUrl: candidate.sourceUrl,
          lastCrawledAt: report.generatedAt,
          crawlConfidence: candidate.labUrlSource === "external_lab_homepage" ? 0.9 : 0.62,
          status: candidate.labUrlSource === "external_lab_homepage" && candidate.warnings.length === 0 ? "active" : "needs_review",
        });
        labCount += 1;

        if (candidate.warnings.length > 0 || candidate.classification.matches.length === 0) {
          await createReviewItem(client, {
            entityType: "lab",
            entityId: lab.id,
            reason: [...candidate.warnings, candidate.classification.matches.length === 0 ? "카테고리 미분류" : ""].filter(Boolean).join("; "),
            suggestedAction: "연구실 홈페이지 여부, 연구분야 분류, 연구원수 출처를 수동 검토",
            metadata: {
              schoolSlug: "uos",
              department: candidate.sourceDepartmentName,
              professor: candidate.nameKo,
              labUrlSource: candidate.labUrlSource,
            },
          });
        }
      } catch (error) {
        errorCount += 1;
        await insertCrawlError(client, {
          crawlJobId: job.id,
          url: candidate.sourceUrl,
          errorType: "faculty_upsert_failed",
          message: error instanceof Error ? error.message : String(error),
          metadata: { department: candidate.sourceDepartmentName, professor: candidate.nameKo },
        });
      }
    }

    const status = errorCount > 0 ? "partial_success" : "success";
    await finishCrawlJob(client, job.id, {
      status,
      errorCount,
      metrics: {
        validationStatus: validationStatus ?? "not_found",
        departments: report.departments.length,
        professors: professorCount,
        labs: labCount,
        externalLabUrls: report.summary.externalLabUrlCount,
        fallbackLabUrls: report.summary.fallbackLabUrlCount,
        memberCountKnown: report.summary.memberCountKnown,
      },
    });

    console.log(JSON.stringify({
      jobId: job.id,
      status,
      validationStatus: validationStatus ?? "not_found",
      departments: report.departments.length,
      professors: professorCount,
      labs: labCount,
      errors: errorCount,
    }, null, 2));
  } catch (error) {
    await finishCrawlJob(client, job.id, {
      status: "failed",
      errorCount: errorCount + 1,
      metrics: { fatal: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
