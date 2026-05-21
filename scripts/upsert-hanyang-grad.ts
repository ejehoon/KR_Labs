import "dotenv/config";
import { readFile } from "node:fs/promises";
import {
  createReviewItem,
  createSupabaseAdmin,
  upsertDepartment,
  upsertLab,
  upsertProfessor,
  upsertUniversity,
} from "../packages/db/src/index.js";
import type { HanyangGraduateDiscoveryReport } from "../packages/crawler/src/schools/hanyangGraduateDiscovery.js";

type ValidationStatus = {
  status?: string;
  coverage?: Record<string, number>;
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

type DbClient = any;

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
  console.log(`Usage: pnpm upsert:hanyang-grad --confirm --allow-needs-review [--report=reports/hanyang-grad-discovery.json] [--validation=reports/hanyang-grad-discovery-validation.json]

Upserts validated Hanyang graduate discovery data into Supabase.
Without --confirm, prints a dry-run summary only.
`);
}

function keywords(candidate: HanyangGraduateDiscoveryReport["labCandidates"][number]) {
  return candidate.classification.matches.map((match) => match.labelKo);
}

function taxonomyNeedsReview(candidate: HanyangGraduateDiscoveryReport["labCandidates"][number]) {
  return candidate.classification.status !== "matched" || candidate.classification.matches.length === 0 || candidate.classification.suggestions.length > 0;
}

function taxonomyReviewKey(candidate: HanyangGraduateDiscoveryReport["labCandidates"][number]) {
  const suggestion = candidate.classification.suggestions[0]?.suggestedLabel ?? "unmatched";
  return [
    "taxonomy",
    "hanyang",
    candidate.departmentName,
    candidate.professorName ?? candidate.labName ?? "unknown",
    suggestion,
  ].join(":").toLowerCase();
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
      case "전산설계/CAE":
        return [10];
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

function hasCrawlerSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as { code?: string; message?: string };
  return candidate.code === "42703" || /column universities\.slug does not exist/i.test(candidate.message ?? "");
}

async function hasCrawlerSchema(client: DbClient): Promise<boolean> {
  const { error } = await client.from("universities").select("slug").limit(1);
  if (!error) {
    return true;
  }
  if (hasCrawlerSchemaError(error)) {
    return false;
  }
  throw error;
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

async function upsertRankingSchema(client: DbClient, report: HanyangGraduateDiscoveryReport) {
  const university = await upsertRankingUniversity(client, "한양대학교");
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

  for (const candidate of report.labCandidates) {
    const payload = {
      name: candidate.professorName ?? candidate.labName ?? "이름 미상",
      department: candidate.departmentName,
      paper_count: candidate.paperCount ?? 0,
      lab_member_count: null,
      lab_url: candidate.labUrl,
      scholar_url: candidate.scholarUrl ?? null,
      dblp_url: candidate.dblpUrl ?? null,
      university_id: university.id,
      research_sub_fields: mapResearchSubFieldIds(keywords(candidate)),
    };
    const key = rankingExactKey(payload);
    const identityKey = rankingIdentityKey(payload);
    const existing = existingByExactKey.get(key) ?? existingByIdentityKey.get(identityKey);
    if (existing) {
      const { error } = await client.from("professors").update(payload).eq("id", existing.id);
      if (error) {
        throw error;
      }
      updated += 1;
      existingByExactKey.set(key, { ...existing, ...payload });
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

async function upsertCrawlerSchema(client: DbClient, report: HanyangGraduateDiscoveryReport) {
  const university = await upsertUniversity(client, {
    slug: "hanyang",
    nameKo: "한양대학교",
    nameEn: "Hanyang University",
    homepageUrl: "https://www.hanyang.ac.kr/",
  });
  const universityId = university.id;
  const departmentsByName = new Map<string, string>();
  let departmentUpserts = 0;
  let professorUpserts = 0;
  let labUpserts = 0;

  for (const program of report.programs) {
    const row = await upsertDepartment(client, {
      universityId,
      nameKo: program.name,
      collegeName: program.collegeName,
      homepageUrl: program.homepageUrl,
      sourceUrl: program.sourceUrl,
      crawlConfidence: 0.9,
    });
    departmentsByName.set(program.name, row.id);
    departmentUpserts += 1;
  }

  for (const candidate of report.labCandidates) {
    const departmentId = departmentsByName.get(candidate.departmentName);
    const professor = candidate.professorName
      ? await upsertProfessor(client, {
          universityId,
          departmentId,
          nameKo: candidate.professorName,
          email: candidate.email,
          profileUrl: undefined,
          labUrl: candidate.labUrl,
          researchInterests: keywords(candidate),
          sourceUrl: candidate.sourceUrl,
          crawlConfidence: candidate.labHomepageUrl ? 0.82 : 0.62,
          status: candidate.warnings.length > 0 ? "needs_review" : "active",
        })
      : undefined;

    if (professor) {
      professorUpserts += 1;
    }

    const lab = await upsertLab(client, {
      universityId,
      departmentId,
      professorId: professor?.id,
      nameKo: candidate.labName,
      homepageUrl: candidate.labUrl,
      description: [candidate.labName, candidate.homepageResearchText ?? candidate.researchText].filter(Boolean).join(" | ") || undefined,
      researchKeywords: keywords(candidate),
      normalizedKeywords: candidate.classification.matches.map((match) => match.fieldId),
      currentMemberCount: candidate.currentMemberCount,
      memberCountBreakdown: candidate.memberCountBreakdown,
      memberCountSourceUrl: candidate.memberCountSourceUrl,
      memberCountCrawledAt: candidate.memberCountCrawledAt,
      sourceUrl: candidate.sourceUrl,
      lastCrawledAt: report.generatedAt,
      lastChangedAt: report.generatedAt,
      crawlConfidence: candidate.labHomepageUrl ? 0.82 : 0.58,
      status: candidate.warnings.length > 0 || taxonomyNeedsReview(candidate) ? "needs_review" : "active",
    });
    labUpserts += 1;

    if (taxonomyNeedsReview(candidate)) {
      await createReviewItem(client, {
        entityType: "taxonomy_category",
        entityId: lab.id,
        reason: candidate.classification.status === "new_category_candidate" ? "신규 카테고리 후보" : "카테고리 미분류/낮은 신뢰도",
        suggestedAction: "기존 중앙 taxonomy에 alias를 추가할지, 새 leaf category를 만들지 검토",
        reviewKey: taxonomyReviewKey(candidate),
        priority: 1,
        confidence: candidate.classification.rejectedMatches?.[0]?.confidence,
        sourceUrl: candidate.homepageResearchSourceUrl ?? candidate.labUrl ?? candidate.sourceUrl,
        metadata: {
          schoolSlug: "hanyang",
          department: candidate.departmentName,
          professor: candidate.professorName,
          labName: candidate.labName,
          researchText: candidate.homepageResearchText ?? candidate.researchText,
          classification: candidate.classification,
          evidencePriority: [
            candidate.homepageResearchText ? "lab_research_page" : undefined,
            candidate.researchText ? "official_lab_card" : undefined,
            candidate.labName ? "lab_name" : undefined,
            "department",
          ].filter(Boolean),
        },
      });
    }
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

  const reportPath = String(args.get("report") ?? "reports/hanyang-grad-discovery.json");
  const validationPath = String(args.get("validation") ?? "reports/hanyang-grad-discovery-validation.json");
  const confirm = args.get("confirm") === true;
  const allowNeedsReview = args.get("allow-needs-review") === true;
  const report = JSON.parse(await readFile(reportPath, "utf8")) as HanyangGraduateDiscoveryReport;
  const validation = JSON.parse(await readFile(validationPath, "utf8")) as ValidationStatus;

  if (validation.status === "failed") {
    throw new Error(`Validation failed in ${validationPath}; refusing to upsert.`);
  }
  if (validation.status === "needs_review" && !allowNeedsReview) {
    throw new Error("Validation status is needs_review. Re-run with --allow-needs-review after checking fallback/unknown fields.");
  }

  const summary = {
    reportPath,
    validationPath,
    validationStatus: validation.status,
    confirm,
    departments: report.programs.length,
    professors: report.labCandidates.filter((candidate) => candidate.professorName).length,
    labs: report.labCandidates.length,
    fallbackLabUrls: report.labCandidates.filter((candidate) => !candidate.labHomepageUrl).length,
    memberCounts: report.labCandidates.filter((candidate) => typeof candidate.currentMemberCount === "number").length,
  };

  if (!confirm) {
    console.log(JSON.stringify({ mode: "dry-run", summary }, null, 2));
    return;
  }

  const client = createSupabaseAdmin();
  const schema = await hasCrawlerSchema(client) ? "crawler" : "ranking";
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
