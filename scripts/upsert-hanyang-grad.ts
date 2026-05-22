import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  createReviewItem,
  createSupabaseAdmin,
  resolveResearchSubFieldIds,
  upsertDepartment,
  upsertLab,
  upsertProfessor,
  upsertUniversity,
} from "../packages/db/src/index.js";
import { extractResearchDetailTopics } from "../packages/crawler/src/core/researchDetailTopics.js";
import type { HanyangGraduateDiscoveryReport } from "../packages/crawler/src/schools/hanyangGraduateDiscovery.js";
import { classifyResearchText } from "../packages/crawler/src/taxonomy/researchTaxonomy.js";

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
type HanyangLabCandidate = HanyangGraduateDiscoveryReport["labCandidates"][number];
type SkippedCandidate = {
  reason: string;
  name: string;
  department: string;
  labUrl: string;
  researchDetailText: string | null;
};
let promotableSuggestedCategoryLabels = new Set<string>();

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

function categoryLabels(candidate: HanyangLabCandidate) {
  return candidate.classification.matches.map((match) => match.labelKo);
}

function suggestedCategoryLabels(candidate: HanyangLabCandidate): string[] {
  return candidate.classification.suggestions
    .map((suggestion) => suggestion.suggestedLabel)
    .map(cleanSuggestedCategoryLabel)
    .filter((label): label is string => Boolean(label))
    .filter((label) => promotableSuggestedCategoryLabels.has(label));
}

function cleanSuggestedCategoryLabel(label: string): string | undefined {
  const cleaned = label
    .replace(/[■●◆▶※*]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return undefined;
  }
  if (cleaned.length < 2 || cleaned.length > 24) {
    return undefined;
  }
  if (/[|@]|https?:\/\/|www\.|\.com|\.net|\.org/i.test(cleaned)) {
    return undefined;
  }
  if (/^[A-Za-z]{1,4}$/.test(cleaned)) {
    return undefined;
  }
  if (/(대학교|대학원|학과|교수소개|교수진|교수\s*연구실|연구실|소속\s*및\s*직위|정년퇴임|별세|대표이사|상무|부장|사장|전무|Office|Lab)/i.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}

function collectSuggestedCategoryLabels(candidate: HanyangLabCandidate): string[] {
  return candidate.classification.suggestions
    .map((suggestion) => cleanSuggestedCategoryLabel(suggestion.suggestedLabel))
    .filter((label): label is string => Boolean(label));
}

function buildPromotableSuggestedCategoryLabels(candidates: HanyangLabCandidate[]): Set<string> {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    for (const label of collectSuggestedCategoryLabels(candidate)) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= 3)
      .map(([label]) => label),
  );
}

function storageCategoryLabels(candidate: HanyangLabCandidate): string[] {
  return [...new Set([...categoryLabels(candidate), ...suggestedCategoryLabels(candidate)])];
}

function taxonomyNeedsReview(candidate: HanyangLabCandidate) {
  return candidate.classification.status !== "matched" || candidate.classification.matches.length === 0 || candidate.classification.suggestions.length > 0;
}

function taxonomyReviewKey(candidate: HanyangLabCandidate) {
  const suggestion = candidate.classification.suggestions[0]?.suggestedLabel ?? "unmatched";
  return [
    "taxonomy",
    "hanyang",
    candidate.departmentName,
    candidate.professorName ?? candidate.labName ?? "unknown",
    suggestion,
  ].join(":").toLowerCase();
}

function uniqueBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

function uniqueTexts(items: Array<string | null | undefined>): string[] {
  return [...new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item)))];
}

function joinTexts(items: Array<string | null | undefined>): string | undefined {
  const values = uniqueTexts(items);
  return values.length > 0 ? values.join(" | ") : undefined;
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

function hasUnusableResearchEvidence(candidate: HanyangLabCandidate): boolean {
  const text = [candidate.homepageResearchText, candidate.researchText].filter(Boolean).join(" | ");
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return true;
  }
  if (/^(Home People|Description|Research|People|Home)$/i.test(normalized)) {
    return true;
  }
  if (/Access Denied|All Rights Reserved|Google Sites 불건전|^Description$|^Home People$|Skip to content|메뉴 바로가기|본문 바로가기|Introduction People Research|Professor Students Research/i.test(normalized)) {
    return true;
  }
  return false;
}

function cleanResearchDetailText(text: string | null | undefined): string | null {
  const cleaned = (text ?? "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "")
    .replace(/(?:이메일|E-?mail)\s*[:：]?\s*/gi, "")
    .replace(/(?:연락처|전화|TEL|Phone)\s*[:：]?\s*(?:[+0-9()\-\s]{3,}|-|없음)?/gi, "")
    .replace(/(?:홈페이지|Homepage|Website)\s*[:：]?\s*(?:https?:\/\/\S+|-)?/gi, "")
    .replace(/\s*(?:Home|People|Professor|Students|Research)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || /^(Home People|Description|Research|People|Home)$/i.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function isLikelyExtractionError(candidate: HanyangLabCandidate): boolean {
  const text = [candidate.homepageResearchText, candidate.researchText].filter(Boolean).join(" | ");
  const normalized = text.replace(/\s+/g, " ").trim();
  if (/(정년퇴임일|별세|소속\s*및\s*직위)/.test(normalized)) {
    return true;
  }
  if (/^(대표이사|상무|부장|사장|전무|이사)$/.test(normalized)) {
    return true;
  }
  if (/소속\s*및\s*직위\s*[-:：]/.test(normalized) && !/(연구분야|Research|연구영역|연구관심)/i.test(normalized)) {
    return true;
  }
  return false;
}

function skippedCandidate(candidate: HanyangLabCandidate, reason: string): SkippedCandidate {
  return {
    reason,
    name: candidate.professorName ?? candidate.labName ?? "이름 미상",
    department: candidate.departmentName,
    labUrl: candidate.labUrl,
    researchDetailText: researchDetailText(candidate),
  };
}

async function writeSkippedCandidatesReport(path: string, skipped: SkippedCandidate[]): Promise<void> {
  if (skipped.length === 0) {
    return;
  }
  await mkdir(path.replace(/\/[^/]+$/, ""), { recursive: true });
  await writeFile(path, JSON.stringify({
    generatedAt: new Date().toISOString(),
    count: skipped.length,
    skipped,
  }, null, 2));
}

function candidateAffiliations(candidate: HanyangLabCandidate): NonNullable<HanyangLabCandidate["affiliations"]> {
  return candidate.affiliations?.length
    ? candidate.affiliations
    : [{
        collegeName: candidate.collegeName,
        departmentName: candidate.departmentName,
        sourceUrl: candidate.sourceUrl,
      }];
}

function choosePreferredUrl(current: string | undefined, incoming: string | undefined): string | undefined {
  if (!current) {
    return incoming;
  }
  if (!incoming) {
    return current;
  }
  if (!isExternalLabHomepage(current) && isExternalLabHomepage(incoming)) {
    return incoming;
  }
  if (isExternalLabHomepage(current) && !isExternalLabHomepage(incoming)) {
    return current;
  }
  const currentScore = preferredUrlScore(current);
  const incomingScore = preferredUrlScore(incoming);
  if (currentScore !== incomingScore) {
    return currentScore > incomingScore ? current : incoming;
  }
  return current.length <= incoming.length ? current : incoming;
}

function preferredUrlScore(url: string): number {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.toLowerCase();
    if (host === "grad.hanyang.ac.kr") {
      return 1;
    }
    if (host.endsWith(".hanyang.ac.kr") && /^\/-\d+\/?$/.test(path)) {
      return 1;
    }
    if (host.endsWith(".hanyang.ac.kr")) {
      return 3;
    }
    return 4;
  } catch {
    return 0;
  }
}

function mergeClassifications(
  current: HanyangLabCandidate["classification"],
  incoming: HanyangLabCandidate["classification"],
): HanyangLabCandidate["classification"] {
  const matches = uniqueBy([...current.matches, ...incoming.matches], (match) => match.fieldId)
    .sort((a, b) => b.confidence - a.confidence || a.labelKo.localeCompare(b.labelKo));
  const suggestions = uniqueBy([...current.suggestions, ...incoming.suggestions], (suggestion) => suggestion.suggestedLabel);
  const rejectedMatches = uniqueBy([...(current.rejectedMatches ?? []), ...(incoming.rejectedMatches ?? [])], (match) => match.fieldId)
    .sort((a, b) => b.confidence - a.confidence || a.labelKo.localeCompare(b.labelKo));
  const status = matches.length > 0
    ? "matched"
    : suggestions.length > 0
      ? "new_category_candidate"
      : current.status ?? incoming.status;

  return {
    ...current,
    ...incoming,
    matches,
    suggestions,
    rejectedMatches,
    status,
    threshold: current.threshold ?? incoming.threshold,
  };
}

function mergeAffiliatedLabCandidates(candidates: HanyangLabCandidate[]): HanyangLabCandidate[] {
  const byEmail = new Map<string, HanyangLabCandidate>();
  const merged: HanyangLabCandidate[] = [];

  for (const candidate of candidates) {
    const emailKey = normalizeEmail(candidate.email);
    if (!emailKey || !candidate.professorName) {
      merged.push(candidate);
      continue;
    }

    const existing = byEmail.get(emailKey);
    if (!existing) {
      const next = {
        ...candidate,
        email: emailKey,
        affiliations: candidateAffiliations(candidate),
      };
      byEmail.set(emailKey, next);
      merged.push(next);
      continue;
    }

    const affiliations = uniqueBy(
      [...candidateAffiliations(existing), ...candidateAffiliations(candidate)],
      (item) => `${item.collegeName}|${item.departmentName}|${item.sourceUrl}`,
    );
    const departmentNames = uniqueTexts(affiliations.map((item) => item.departmentName));
    const collegeNames = uniqueTexts(affiliations.map((item) => item.collegeName));

    existing.collegeName = collegeNames.join(" / ") || existing.collegeName;
    existing.departmentName = departmentNames.join(" / ") || existing.departmentName;
    existing.affiliations = affiliations;
    existing.professorName = existing.professorName ?? candidate.professorName;
    existing.labName = existing.labName ?? candidate.labName;
    existing.phone = existing.phone ?? candidate.phone;
    existing.location = existing.location ?? candidate.location;
    existing.localCategory = joinTexts([existing.localCategory, candidate.localCategory]);
    existing.researchText = joinTexts([existing.researchText, candidate.researchText]);
    existing.homepageResearchText = joinTexts([existing.homepageResearchText, candidate.homepageResearchText]);
    existing.homepageResearchSourceUrl = choosePreferredUrl(existing.homepageResearchSourceUrl, candidate.homepageResearchSourceUrl);
    existing.researchEvidenceCandidatePages = uniqueBy(
      [...(existing.researchEvidenceCandidatePages ?? []), ...(candidate.researchEvidenceCandidatePages ?? [])],
      (item) => item.url,
    );
    existing.labHomepageUrl = choosePreferredUrl(existing.labHomepageUrl, candidate.labHomepageUrl);
    existing.labUrl = choosePreferredUrl(existing.labHomepageUrl ?? existing.labUrl, candidate.labHomepageUrl ?? candidate.labUrl) ?? existing.labUrl;
    existing.sourceUrl = choosePreferredUrl(existing.sourceUrl, candidate.sourceUrl) ?? existing.sourceUrl;
    existing.pdfUrl = existing.pdfUrl ?? candidate.pdfUrl;
    existing.classification = mergeClassifications(existing.classification, candidate.classification);
    existing.currentMemberCount = existing.currentMemberCount ?? candidate.currentMemberCount;
    existing.memberCountBreakdown = existing.memberCountBreakdown ?? candidate.memberCountBreakdown;
    existing.memberCountSourceUrl = existing.memberCountSourceUrl ?? candidate.memberCountSourceUrl;
    existing.memberCountCrawledAt = existing.memberCountCrawledAt ?? candidate.memberCountCrawledAt;
    existing.memberCountCandidatePages = uniqueBy(
      [...(existing.memberCountCandidatePages ?? []), ...(candidate.memberCountCandidatePages ?? [])],
      (item) => item.url,
    );
    existing.scholarUrl = choosePreferredUrl(existing.scholarUrl, candidate.scholarUrl);
    existing.dblpUrl = choosePreferredUrl(existing.dblpUrl, candidate.dblpUrl);
    existing.paperCount = Math.max(existing.paperCount ?? 0, candidate.paperCount ?? 0);
    existing.warnings = uniqueTexts([
      ...existing.warnings,
      ...candidate.warnings,
      `동일 이메일 기준 복수 소속 병합: ${departmentNames.join(" / ")}`,
    ]);
  }

  return merged;
}

function classificationEvidence(candidate: HanyangLabCandidate): string {
  if (hasUnusableResearchEvidence(candidate)) {
    return candidate.departmentName;
  }
  return [
    candidate.homepageResearchText,
    candidate.researchText,
    candidate.labName,
    candidate.departmentName,
  ].filter(Boolean).join(" | ");
}

function researchDetailText(candidate: HanyangLabCandidate): string | null {
  if (hasUnusableResearchEvidence(candidate)) {
    return null;
  }
  return cleanResearchDetailText(candidate.homepageResearchText ?? candidate.researchText);
}

function reclassifyLabCandidates(candidates: HanyangLabCandidate[]): HanyangLabCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    classification: classifyResearchText(classificationEvidence(candidate)),
  }));
}

function normalizeUrlKey(url: string | null | undefined): string {
  return (url ?? "").trim().replace(/\/+$/, "").toLowerCase();
}

function isExternalLabHomepage(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return !["grad.hanyang.ac.kr", "hanyang.ac.kr"].includes(host);
  } catch {
    return false;
  }
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
  const skipped: SkippedCandidate[] = [];

  for (const candidate of report.labCandidates) {
    if (isLikelyExtractionError(candidate)) {
      skipped.push(skippedCandidate(candidate, "research_text_extraction_error"));
      continue;
    }
    const detailText = researchDetailText(candidate);
    const payload = {
      name: candidate.professorName ?? candidate.labName ?? "이름 미상",
      department: candidate.departmentName,
      paper_count: candidate.paperCount ?? 0,
      lab_member_count: candidate.currentMemberCount ?? null,
      lab_url: candidate.labUrl,
      scholar_url: candidate.scholarUrl ?? null,
      dblp_url: candidate.dblpUrl ?? null,
      university_id: university.id,
      research_sub_fields: await resolveResearchSubFieldIds(client, storageCategoryLabels(candidate), {
        createMissing: true,
        maxCreateMissing: 1,
      }),
      research_detail_text: detailText,
      research_detail_topics: extractResearchDetailTopics(detailText),
      research_detail_source_url: detailText ? candidate.homepageResearchSourceUrl ?? candidate.labUrl ?? candidate.sourceUrl ?? null : candidate.sourceUrl ?? null,
      research_detail_updated_at: new Date().toISOString(),
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
    skipped,
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
  const skipped: SkippedCandidate[] = [];

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
    if (isLikelyExtractionError(candidate)) {
      skipped.push(skippedCandidate(candidate, "research_text_extraction_error"));
      continue;
    }
    const departmentId = departmentsByName.get(candidate.departmentName);
    const professor = candidate.professorName
      ? await upsertProfessor(client, {
          universityId,
          departmentId,
          nameKo: candidate.professorName,
          email: candidate.email,
          profileUrl: undefined,
          labUrl: candidate.labUrl,
          researchInterests: storageCategoryLabels(candidate),
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
      description: [candidate.labName, researchDetailText(candidate)].filter(Boolean).join(" | ") || undefined,
      researchKeywords: storageCategoryLabels(candidate),
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
          researchText: researchDetailText(candidate),
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
    skipped,
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
  const reclassifiedLabCandidates = reclassifyLabCandidates(report.labCandidates);
  const mergedLabCandidates = mergeAffiliatedLabCandidates(reclassifiedLabCandidates);
  promotableSuggestedCategoryLabels = buildPromotableSuggestedCategoryLabels(mergedLabCandidates);
  const skippedEstimate = mergedLabCandidates.filter(isLikelyExtractionError);
  const upsertReport = {
    ...report,
    labCandidates: mergedLabCandidates,
  };
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
    professors: mergedLabCandidates.filter((candidate) => candidate.professorName).length,
    labs: mergedLabCandidates.length,
    originalLabs: report.labCandidates.length,
    mergedAffiliationRows: report.labCandidates.length - mergedLabCandidates.length,
    promotableNewCategoryLabels: promotableSuggestedCategoryLabels.size,
    skippedExtractionErrors: skippedEstimate.length,
    upsertableLabs: mergedLabCandidates.length - skippedEstimate.length,
    fallbackLabUrls: mergedLabCandidates.filter((candidate) => !candidate.labHomepageUrl).length,
    memberCounts: mergedLabCandidates.filter((candidate) => typeof candidate.currentMemberCount === "number").length,
  };

  if (!confirm) {
    console.log(JSON.stringify({ mode: "dry-run", summary }, null, 2));
    return;
  }

  const client = createSupabaseAdmin();
  const schema = await hasCrawlerSchema(client) ? "crawler" : "ranking";
  const upserted = schema === "crawler"
    ? await upsertCrawlerSchema(client, upsertReport)
    : await upsertRankingSchema(client, upsertReport);
  const skipped = Array.isArray((upserted as { skipped?: unknown }).skipped)
    ? (upserted as { skipped: SkippedCandidate[] }).skipped
    : [];
  await writeSkippedCandidatesReport("reports/hanyang-grad-upsert-skipped-candidates.json", skipped);

  console.log(JSON.stringify({
    mode: "upsert",
    schema,
    summary,
    upserted: {
      ...upserted,
      skipped: skipped.length,
      skippedReportPath: skipped.length > 0 ? "reports/hanyang-grad-upsert-skipped-candidates.json" : undefined,
    },
  }, null, 2));
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
  });
