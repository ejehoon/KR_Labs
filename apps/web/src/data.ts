import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPrimaryLabUrl } from "./lib/labLinks";

export type DryRunPage = {
  url: string;
  finalUrl?: string;
  pageType?: string;
  httpStatus?: number;
  title?: string;
  textLength?: number;
  linkCount?: number;
  entityCounts?: {
    departments: number;
    professors: number;
    labs: number;
    publications: number;
  };
  sample?: {
    departments?: Candidate[];
    professors?: Candidate[];
    labs?: Candidate[];
    publications?: Candidate[];
  };
};

export type Candidate = {
  nameKo?: string;
  nameEn?: string;
  title?: string;
  email?: string;
  profileUrl?: string;
  homepageUrl?: string;
  sourceUrl?: string;
  confidence?: number;
  currentMemberCount?: number;
  memberCountBreakdown?: Record<string, number>;
  researchKeywords?: string[];
};

export type DryRunReport = {
  school: string;
  generatedAt: string;
  visited: number;
  pages: DryRunPage[];
  errors: Array<{ url: string; message: string }>;
};

export type RankingRow = {
  school: string;
  department: string;
  labs: number;
  professors: number;
  pages: number;
  memberCount: number | null;
  paperCount: number;
  avgConfidence: number;
  source: DataSource;
};

export type DataSource = "dry-run" | "supabase" | "kr-rankings" | "graduate-discovery";

export type LabRow = {
  id?: string;
  name: string;
  school: string;
  department?: string;
  programName?: string;
  researchText?: string;
  homepageUrl?: string;
  sourceUrl?: string;
  scholarUrl?: string;
  dblpUrl?: string;
  paperCount?: number;
  confidence: number;
  memberCount: number | null;
  keywords: string[];
  source: DataSource;
};

export type GraduateProgramRow = {
  school: string;
  series: string;
  name: string;
  homepageUrl?: string;
  type: "department" | "interdisciplinary" | "institute_joint" | "track";
  taxonomy: string[];
};

export type ReviewItemRow = {
  id: string;
  entityType: "department" | "professor" | "lab" | "publication" | "taxonomy_category" | string;
  reason: string;
  suggestedAction?: string;
  status: "open" | "resolved" | "ignored" | string;
  priority?: number;
  confidence?: number;
  sourceUrl?: string;
  createdAt?: string;
  school?: string;
  department?: string;
  professor?: string;
  labName?: string;
  suggestedLabels: string[];
  rejectedLabels: string[];
  evidence?: string;
  source: DataSource | "review";
};

export type DashboardData = {
  mode: "dry-run" | "supabase" | "kr-rankings";
  generatedAt?: string;
  rankingRows: RankingRow[];
  labs: LabRow[];
  programs: GraduateProgramRow[];
  reviewItems: ReviewItemRow[];
  pages: DryRunPage[];
  errors: Array<{ url: string; message: string }>;
};

type SogangGraduateDiscoveryReport = {
  generatedAt: string;
  programs: Array<{
    series: string;
    name: string;
    homepageUrl?: string;
    type: GraduateProgramRow["type"];
    classification?: { matches?: Array<{ labelKo: string }> };
  }>;
  facultyCandidates: Array<{
    sourceProgramName: string;
    affiliation?: string;
    nameKo?: string;
    labName?: string;
    researchText?: string;
    labUrl?: string;
    sourceUrl: string;
    currentMemberCount?: number;
    memberCount?: number;
    scholarUrl?: string;
    dblpUrl?: string;
    paperCount?: number;
    classification?: ClassificationLike;
  }>;
};

type SkkuGraduateDiscoveryReport = {
  generatedAt: string;
  colleges: Array<{
    id?: string;
    nameKo: string;
    nameEn?: string;
    url: string;
  }>;
  labCandidates: Array<{
    collegeNameKo: string;
    departmentName: string;
    labName?: string;
    professorName?: string;
    researchText?: string;
    homepageResearchText?: string;
    labUrl?: string;
    sourceUrl: string;
    paperCount?: number;
    dblpUrl?: string;
    currentMemberCount?: number;
    memberCount?: number;
    classification?: ClassificationLike;
  }>;
};

type HanyangGraduateDiscoveryReport = {
  generatedAt: string;
  programs: Array<{
    collegeName: string;
    name: string;
    homepageUrl?: string;
    classification?: { matches?: Array<{ labelKo: string }> };
  }>;
  labCandidates: Array<{
    collegeName: string;
    departmentName: string;
    labName?: string;
    professorName?: string;
    researchText?: string;
    homepageResearchText?: string;
    homepageResearchSourceUrl?: string;
    labUrl: string;
    sourceUrl: string;
    currentMemberCount?: number;
    scholarUrl?: string;
    dblpUrl?: string;
    paperCount?: number;
    classification?: ClassificationLike;
  }>;
};

type CauGraduateDiscoveryReport = {
  generatedAt: string;
  departments: Array<{
    name: string;
    homepageUrl?: string;
    facultyUrl?: string;
  }>;
  facultyCandidates: Array<{
    departmentName: string;
    professorName?: string;
    labName?: string;
    labUrl?: string;
    sourceUrl: string;
    researchText?: string;
    currentMemberCount?: number;
    scholarUrl?: string;
    dblpUrl?: string;
    paperCount?: number;
    classification?: ClassificationLike;
  }>;
};

type HufsGraduateDiscoveryReport = {
  generatedAt: string;
  departments: Array<{
    collegeName: string;
    name: string;
    homepageUrl?: string;
    classification?: { matches?: Array<{ labelKo: string }> };
  }>;
  facultyCandidates: Array<{
    departmentName: string;
    collegeName: string;
    nameKo?: string;
    nameEn?: string;
    researchText?: string;
    labUrl?: string;
    sourceUrl: string;
    scholarUrl?: string;
    dblpUrl?: string;
    publicationCount?: number;
    currentMemberCount?: number;
    classification?: ClassificationLike;
  }>;
};

type UosGraduateDiscoveryReport = {
  generatedAt: string;
  departments: Array<{
    category: string;
    name: string;
    homepageUrl?: string;
    facultyUrl?: string;
    classification?: { matches?: Array<{ labelKo: string }> };
  }>;
  facultyCandidates: Array<{
    category: string;
    sourceDepartmentName: string;
    nameKo?: string;
    labName?: string;
    labUrl?: string;
    labUrlSource?: string;
    sourceUrl: string;
    researchText?: string;
    currentMemberCount?: number;
    scholarUrl?: string;
    dblpUrl?: string;
    paperCount?: number;
    classification?: ClassificationLike;
  }>;
};

type ClassificationLike = {
  status?: string;
  threshold?: number;
  matches?: Array<{ fieldId?: string; labelKo: string; confidence?: number; evidence?: string[] }>;
  rejectedMatches?: Array<{ fieldId?: string; labelKo: string; confidence?: number; evidence?: string[] }>;
  suggestions?: Array<{ suggestedLabel: string; reason?: string; evidence?: string[] }>;
};

const schoolNames: Record<string, string> = {
  snu: "Seoul National University",
  yonsei: "Yonsei University",
  korea: "Korea University",
  kaist: "KAIST",
  uos: "University of Seoul",
};

let cachedClient: SupabaseClient | undefined;
let cachedClientKey = "";

function getBrowserSupabaseClient(url: string, publishableKey: string): SupabaseClient {
  const key = `${url}:${publishableKey}`;
  if (cachedClient && cachedClientKey === key) {
    return cachedClient;
  }

  cachedClient = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      storageKey: "kr-labs-disabled-auth",
    },
  });
  cachedClientKey = key;
  return cachedClient;
}

export async function loadDashboardData(): Promise<DashboardData> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    try {
      return await loadKrRankingsData(supabaseUrl, supabaseAnonKey);
    } catch (error) {
      console.warn("Falling back to crawler schema", error);
      try {
        return await loadSupabaseData(supabaseUrl, supabaseAnonKey);
      } catch (fallbackError) {
        console.warn("Failed to load Supabase data", fallbackError);
        throw fallbackError;
      }
    }
  }

  return withLocalGraduateReports(await loadDryRunData());
}

async function loadDryRunData(): Promise<DashboardData> {
  const response = await fetch("/data/snu-dry-run.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("No dry-run report found. Run pnpm crawl:dry-run --school=snu --max-pages=3 first.");
  }
  const report = (await response.json()) as DryRunReport;
  const labCandidates = report.pages.flatMap((page) => page.sample?.labs ?? []);
  const professorCandidates = report.pages.flatMap((page) => page.sample?.professors ?? []);
  const confidenceValues = [...labCandidates, ...professorCandidates]
    .map((item) => item.confidence)
    .filter((value): value is number => typeof value === "number");

  const labs: LabRow[] = labCandidates.map((lab) => ({
    name: lab.nameKo ?? lab.nameEn ?? "Unknown Lab",
    school: schoolNames[report.school] ?? report.school,
    homepageUrl: lab.homepageUrl,
    sourceUrl: lab.sourceUrl,
    confidence: lab.confidence ?? 0,
    memberCount: lab.currentMemberCount ?? null,
    keywords: lab.researchKeywords ?? [],
    source: "dry-run",
  }));

  return {
    mode: "dry-run",
    generatedAt: report.generatedAt,
    rankingRows: [
      {
        school: schoolNames[report.school] ?? report.school,
        department: "Computer Science",
        labs: sum(report.pages, "labs"),
        professors: sum(report.pages, "professors"),
        pages: report.visited,
        memberCount: labs.reduce((total, lab) => total + (lab.memberCount ?? 0), 0) || null,
        paperCount: sum(report.pages, "publications"),
        avgConfidence: average(confidenceValues),
        source: "dry-run",
      },
    ],
    labs,
    programs: [],
    reviewItems: [],
    pages: report.pages,
    errors: report.errors,
  };
}

export async function loadKrRankingsData(url: string, publishableKey: string): Promise<DashboardData> {
  const client = getBrowserSupabaseClient(url, publishableKey);
  const [{ data: universities, error: universitiesError }, { data: professors, error: professorsError }, { data: subFields, error: subFieldsError }] =
    await Promise.all([
      client.from("universities").select("id,name").order("name"),
      client
        .from("professors")
        .select("id,name,department,paper_count,lab_member_count,lab_url,scholar_url,dblp_url,university_id,research_sub_fields")
        .order("paper_count", { ascending: false, nullsFirst: false })
        .limit(1000),
      client.from("research_sub_fields").select("id,name").order("id"),
    ]);

  if (universitiesError || professorsError || subFieldsError) {
    throw universitiesError ?? professorsError ?? subFieldsError;
  }

  const schoolsById = new Map((universities ?? []).map((school) => [school.id, school.name]));
  const subFieldNamesById = new Map((subFields ?? []).map((field) => [field.id, field.name]));
  const professorRows = professors ?? [];
  const rowsByUniversity = new Map<number, typeof professorRows>();

  for (const professor of professorRows) {
    if (typeof professor.university_id !== "number") {
      continue;
    }
    rowsByUniversity.set(professor.university_id, [...(rowsByUniversity.get(professor.university_id) ?? []), professor]);
  }

  const rankingRows: RankingRow[] = [...rowsByUniversity.entries()]
    .map(([universityId, rows]) => {
      const memberValues = rows
        .map((row) => row.lab_member_count)
        .filter((value): value is number => typeof value === "number");
      return {
        school: schoolsById.get(universityId) ?? `University ${universityId}`,
        department: "Computer Science",
        labs: rows.length,
        professors: rows.length,
        pages: 0,
        memberCount: memberValues.reduce((total, value) => total + value, 0) || null,
        paperCount: rows.reduce((total, row) => total + Number(row.paper_count ?? 0), 0),
        avgConfidence: 1,
        source: "kr-rankings" as const,
      };
    })
    .sort((a, b) => b.paperCount - a.paperCount || b.professors - a.professors);

  const labs: LabRow[] = professorRows.map((professor) => {
    const keywords = Array.isArray(professor.research_sub_fields)
      ? professor.research_sub_fields
          .map((id) => (typeof id === "number" ? subFieldNamesById.get(id) : undefined))
          .filter((value): value is string => Boolean(value))
      : [];

    return {
      id: professor.id,
      name: professor.name,
      school: schoolsById.get(professor.university_id ?? -1) ?? "Unknown",
      department: professor.department ?? undefined,
      homepageUrl: professor.lab_url ?? undefined,
      sourceUrl: professor.lab_url ?? professor.dblp_url ?? professor.scholar_url ?? undefined,
      scholarUrl: professor.scholar_url ?? undefined,
      dblpUrl: professor.dblp_url ?? undefined,
      paperCount: professor.paper_count ?? 0,
      confidence: 1,
      memberCount: professor.lab_member_count ?? null,
      keywords,
      source: "kr-rankings",
    };
  });

  return {
    mode: "kr-rankings",
    generatedAt: new Date().toISOString(),
    rankingRows,
    labs,
    programs: [],
    reviewItems: [],
    pages: [],
    errors: [],
  };
}

async function loadSupabaseData(url: string, anonKey: string): Promise<DashboardData> {
  const client = getBrowserSupabaseClient(url, anonKey);
  const [{ data: universities, error: universitiesError }, { data: labs, error: labsError }, { data: professors, error: professorsError }] =
    await Promise.all([
      client.from("universities").select("id,slug,name_en,name_ko"),
      client
        .from("labs")
        .select("id,university_id,professor_id,name_ko,name_en,homepage_url,source_url,crawl_confidence,current_member_count,research_keywords,status")
        .order("current_member_count", { ascending: false, nullsFirst: false })
        .limit(500),
      client.from("professors").select("id,university_id,name_ko,name_en").limit(1000),
    ]);

  if (universitiesError || labsError || professorsError) {
    throw universitiesError ?? labsError ?? professorsError;
  }

  const schoolsById = new Map((universities ?? []).map((school) => [school.id, school.name_en ?? school.name_ko ?? school.slug]));
  const professorsById = new Map((professors ?? []).map((professor) => [professor.id, professor]));
  const professorCounts = countBy(professors ?? [], "university_id");
  const labCounts = countBy(labs ?? [], "university_id");
  const memberCounts = sumByGroup(labs ?? [], "university_id", "current_member_count");
  const confidenceBySchool = averageByGroup(labs ?? [], "university_id", "crawl_confidence");

  const rankingRows = (universities ?? [])
    .map((school) => ({
      school: school.name_en ?? school.name_ko ?? school.slug,
      department: "Computer Science",
      labs: labCounts.get(school.id) ?? 0,
      professors: professorCounts.get(school.id) ?? 0,
      pages: 0,
      memberCount: memberCounts.get(school.id) ?? null,
      paperCount: 0,
      avgConfidence: confidenceBySchool.get(school.id) ?? 0,
      source: "supabase" as const,
    }))
    .filter((row) => row.labs > 0 || row.professors > 0)
    .sort((a, b) => b.labs - a.labs || b.professors - a.professors);

  const reviewItems = await loadReviewItems(client);

  return {
    mode: "supabase",
    rankingRows,
    labs: (labs ?? []).map((lab) => {
      const professor = lab.professor_id ? professorsById.get(lab.professor_id) : undefined;
      const labName = lab.name_ko ?? lab.name_en ?? undefined;
      return {
        name: professor?.name_ko ?? professor?.name_en ?? labName ?? "Unknown Lab",
        school: schoolsById.get(lab.university_id) ?? "Unknown",
        researchText: labName,
        homepageUrl: lab.homepage_url ?? undefined,
        sourceUrl: lab.source_url ?? undefined,
        paperCount: 0,
        confidence: Number(lab.crawl_confidence ?? 0),
        memberCount: lab.current_member_count ?? null,
        keywords: lab.research_keywords ?? [],
        source: "supabase",
      };
    }),
    programs: [],
    reviewItems,
    pages: [],
    errors: [],
  };
}

async function withLocalGraduateReports(data: DashboardData): Promise<DashboardData> {
  const [sogangReport, skkuReport, hanyangReport] = await Promise.all([
    fetchOptionalJson<SogangGraduateDiscoveryReport>("/data/sogang-grad-discovery.json"),
    fetchOptionalJson<SkkuGraduateDiscoveryReport>("/data/skku-grad-discovery.json"),
    fetchOptionalJson<HanyangGraduateDiscoveryReport>("/data/hanyang-grad-discovery.json"),
  ]);

  let next = data;
  if (sogangReport) {
    next = mergeSogangGraduateReport(next, sogangReport);
  }
  if (skkuReport) {
    next = mergeSkkuGraduateReport(next, skkuReport);
  }
  if (hanyangReport) {
    next = mergeHanyangGraduateReport(next, hanyangReport);
  }
  return next;
}

async function loadReviewItems(client: SupabaseClient): Promise<ReviewItemRow[]> {
  const baseSelect = "id,entity_type,reason,suggested_action,status,metadata,created_at";
  const extendedSelect = `${baseSelect},priority,confidence,source_url`;
  let response: any = await client
    .from("review_items")
    .select(extendedSelect)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(200);

  if (response.error) {
    response = await client
      .from("review_items")
      .select(baseSelect)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(200);
  }
  if (response.error) {
    return [];
  }

  return (response.data ?? []).map((item: any) => mapDbReviewItem(item));
}

function mapDbReviewItem(item: any): ReviewItemRow {
  const metadata = typeof item.metadata === "object" && item.metadata ? item.metadata : {};
  const classification = metadata.classification as ClassificationLike | undefined;
  return {
    id: item.id,
    entityType: item.entity_type ?? "lab",
    reason: item.reason ?? "검토 필요",
    suggestedAction: item.suggested_action ?? undefined,
    status: item.status ?? "open",
    priority: item.priority ?? undefined,
    confidence: item.confidence ?? classification?.rejectedMatches?.[0]?.confidence,
    sourceUrl: item.source_url ?? metadata.sourceUrl ?? undefined,
    createdAt: item.created_at ?? undefined,
    school: metadata.school ?? metadata.schoolSlug ?? undefined,
    department: metadata.department ?? undefined,
    professor: metadata.professor ?? undefined,
    labName: metadata.labName ?? undefined,
    suggestedLabels: classification?.suggestions?.map((suggestion) => suggestion.suggestedLabel) ?? [],
    rejectedLabels: classification?.rejectedMatches?.map((match) => match.labelKo) ?? [],
    evidence: metadata.researchText ?? classification?.suggestions?.[0]?.evidence?.join(" | "),
    source: "review",
  };
}

function taxonomyReviewItem(input: {
  id: string;
  school: string;
  department?: string;
  professor?: string;
  labName?: string;
  sourceUrl?: string;
  researchText?: string;
  classification?: ClassificationLike;
}): ReviewItemRow | undefined {
  const classification = input.classification;
  const hasMatch = (classification?.matches ?? []).length > 0;
  const suggestions = classification?.suggestions ?? [];
  const rejected = classification?.rejectedMatches ?? [];
  if (hasMatch && suggestions.length === 0 && classification?.status !== "new_category_candidate") {
    return undefined;
  }
  if (suggestions.length === 0 && rejected.length === 0 && hasMatch) {
    return undefined;
  }
  const suggestedLabels = suggestions.map((suggestion) => suggestion.suggestedLabel);
  const rejectedLabels = rejected.map((match) => match.labelKo);
  return {
    id: input.id,
    entityType: "taxonomy_category",
    reason: suggestions.length > 0 ? "신규 카테고리 후보" : "카테고리 미분류/낮은 신뢰도",
    suggestedAction: "기존 taxonomy alias로 흡수할지, 새 leaf category를 만들지 검토",
    status: "open",
    priority: 1,
    confidence: rejected[0]?.confidence,
    sourceUrl: input.sourceUrl,
    school: input.school,
    department: input.department,
    professor: input.professor,
    labName: input.labName,
    suggestedLabels,
    rejectedLabels,
    evidence: input.researchText ?? suggestions[0]?.evidence?.join(" | ") ?? rejected[0]?.evidence?.join(" | "),
    source: "graduate-discovery",
  };
}

async function fetchOptionalJson<T>(url: string): Promise<T | undefined> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return undefined;
    }
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

function mergeSogangGraduateReport(data: DashboardData, report: SogangGraduateDiscoveryReport): DashboardData {
  const school = "서강대학교";
  const programs: GraduateProgramRow[] = report.programs.map((program) => ({
    school,
    series: program.series,
    name: program.name,
    homepageUrl: program.homepageUrl,
    type: program.type,
    taxonomy: program.classification?.matches?.map((match) => match.labelKo) ?? [],
  }));

  const labs: LabRow[] = report.facultyCandidates
    .filter((candidate) => candidate.labUrl)
    .map((candidate, index) => ({
      id: `sogang-grad-${index}-${candidate.sourceProgramName}-${candidate.nameKo ?? candidate.labName ?? "unknown"}`,
      name: candidate.nameKo ?? candidate.labName ?? "이름 미상",
      school,
      department: candidate.affiliation ?? candidate.sourceProgramName,
      programName: candidate.sourceProgramName,
      researchText: [candidate.labName, candidate.researchText].filter(Boolean).join(" | ") || undefined,
      homepageUrl: candidate.labUrl,
      sourceUrl: candidate.labUrl,
      scholarUrl: candidate.scholarUrl,
      dblpUrl: candidate.dblpUrl,
      paperCount: candidate.paperCount ?? 0,
      confidence: 1,
      memberCount: candidate.currentMemberCount ?? candidate.memberCount ?? null,
      keywords: candidate.classification?.matches?.map((match) => match.labelKo) ?? [],
      source: "graduate-discovery",
    }));
  const reviewItems = report.facultyCandidates
    .map((candidate, index) =>
      taxonomyReviewItem({
        id: `local-review-sogang-${index}-${candidate.sourceProgramName}-${candidate.nameKo ?? candidate.labName ?? "unknown"}`,
        school,
        department: candidate.affiliation ?? candidate.sourceProgramName,
        professor: candidate.nameKo,
        labName: candidate.labName,
        sourceUrl: candidate.labUrl ?? candidate.sourceUrl,
        researchText: [candidate.labName, candidate.researchText].filter(Boolean).join(" | ") || undefined,
        classification: candidate.classification,
      }),
    )
    .filter((item): item is ReviewItemRow => Boolean(item));
  const uniqueLabs = uniqueLocalLabs(labs);
  const totalMemberCount = uniqueLabs.reduce((total, lab) => total + (lab.memberCount ?? 0), 0);
  const totalPaperCount = uniqueLabs.reduce((total, lab) => total + (lab.paperCount ?? 0), 0);

  const rankingRow: RankingRow = {
    school,
    department: "전체 대학원",
    labs: uniqueLabs.length,
    professors: uniqueLabs.length,
    pages: programs.length,
    memberCount: totalMemberCount || null,
    paperCount: totalPaperCount,
    avgConfidence: 1,
    source: "graduate-discovery",
  };

  return {
    ...data,
    generatedAt: report.generatedAt ?? data.generatedAt,
    rankingRows: [...data.rankingRows.filter((row) => !isSogangSchool(row.school)), rankingRow],
    labs: [...data.labs.filter((lab) => !isSogangSchool(lab.school)), ...labs],
    programs: [...data.programs.filter((program) => !isSogangSchool(program.school)), ...programs],
    reviewItems: [...data.reviewItems.filter((item) => item.school !== school), ...reviewItems],
  };
}

function isSogangSchool(school: string): boolean {
  return /서강|sogang/i.test(school);
}

function mergeSkkuGraduateReport(data: DashboardData, report: SkkuGraduateDiscoveryReport): DashboardData {
  const school = "성균관대학교";
  const programKeys = new Set<string>();
  const programs: GraduateProgramRow[] = [];

  for (const candidate of report.labCandidates) {
    const key = `${candidate.collegeNameKo}|${candidate.departmentName}`;
    if (programKeys.has(key)) {
      continue;
    }
    programKeys.add(key);
    const college = report.colleges.find((item) => item.nameKo === candidate.collegeNameKo);
    programs.push({
      school,
      series: candidate.collegeNameKo,
      name: candidate.departmentName,
      homepageUrl: candidate.sourceUrl ?? college?.url,
      type: "department",
      taxonomy: [],
    });
  }

  const labs: LabRow[] = report.labCandidates.map((candidate, index) => ({
    id: `skku-grad-${index}-${candidate.departmentName}-${candidate.professorName ?? candidate.labName ?? "unknown"}`,
    name: candidate.professorName ?? candidate.labName ?? "이름 미상",
    school,
    department: candidate.departmentName,
    programName: candidate.departmentName,
    researchText: [candidate.labName, candidate.homepageResearchText, candidate.researchText].filter(Boolean).join(" | ") || undefined,
    homepageUrl: candidate.labUrl,
    sourceUrl: candidate.labUrl ?? candidate.sourceUrl,
    dblpUrl: candidate.dblpUrl,
    paperCount: candidate.paperCount ?? 0,
    confidence: 1,
    memberCount: candidate.currentMemberCount ?? candidate.memberCount ?? null,
    keywords: candidate.classification?.matches?.map((match) => match.labelKo) ?? [],
    source: "graduate-discovery",
  }));
  const reviewItems = report.labCandidates
    .map((candidate, index) =>
      taxonomyReviewItem({
        id: `local-review-skku-${index}-${candidate.departmentName}-${candidate.professorName ?? candidate.labName ?? "unknown"}`,
        school,
        department: candidate.departmentName,
        professor: candidate.professorName,
        labName: candidate.labName,
        sourceUrl: candidate.labUrl ?? candidate.sourceUrl,
        researchText: [candidate.labName, candidate.homepageResearchText, candidate.researchText].filter(Boolean).join(" | ") || undefined,
        classification: candidate.classification,
      }),
    )
    .filter((item): item is ReviewItemRow => Boolean(item));
  const uniqueLabs = uniqueLocalLabs(labs);
  const totalMemberCount = uniqueLabs.reduce((total, lab) => total + (lab.memberCount ?? 0), 0);
  const totalPaperCount = uniqueLabs.reduce((total, lab) => total + (lab.paperCount ?? 0), 0);

  const rankingRow: RankingRow = {
    school,
    department: "전체 대학원",
    labs: uniqueLabs.length,
    professors: uniqueLabs.length,
    pages: programs.length,
    memberCount: totalMemberCount || null,
    paperCount: totalPaperCount,
    avgConfidence: 1,
    source: "graduate-discovery",
  };

  return {
    ...data,
    generatedAt: report.generatedAt ?? data.generatedAt,
    rankingRows: [...data.rankingRows.filter((row) => row.school !== school), rankingRow],
    labs: [...data.labs.filter((lab) => lab.school !== school), ...labs],
    programs: [...data.programs.filter((program) => program.school !== school), ...programs],
    reviewItems: [...data.reviewItems.filter((item) => item.school !== school), ...reviewItems],
  };
}

function mergeHanyangGraduateReport(data: DashboardData, report: HanyangGraduateDiscoveryReport): DashboardData {
  const school = "한양대학교";
  const programs: GraduateProgramRow[] = report.programs.map((program) => ({
    school,
    series: program.collegeName,
    name: program.name,
    homepageUrl: program.homepageUrl,
    type: "department",
    taxonomy: program.classification?.matches?.map((match) => match.labelKo) ?? [],
  }));

  const labs: LabRow[] = report.labCandidates.map((candidate, index) => ({
    id: `hanyang-grad-${index}-${candidate.departmentName}-${candidate.professorName ?? candidate.labName ?? "unknown"}`,
    name: candidate.professorName ?? candidate.labName ?? "이름 미상",
    school,
    department: candidate.departmentName,
    programName: candidate.departmentName,
    researchText: [candidate.labName, candidate.researchText].filter(Boolean).join(" | ") || undefined,
    homepageUrl: candidate.labUrl,
    sourceUrl: candidate.labUrl ?? candidate.sourceUrl,
    scholarUrl: candidate.scholarUrl,
    dblpUrl: candidate.dblpUrl,
    paperCount: candidate.paperCount ?? 0,
    confidence: 1,
    memberCount: candidate.currentMemberCount ?? null,
    keywords: candidate.classification?.matches?.map((match) => match.labelKo) ?? [],
    source: "graduate-discovery",
  }));
  const reviewItems = report.labCandidates
    .map((candidate, index) =>
      taxonomyReviewItem({
        id: `local-review-hanyang-${index}-${candidate.departmentName}-${candidate.professorName ?? candidate.labName ?? "unknown"}`,
        school,
        department: candidate.departmentName,
        professor: candidate.professorName,
        labName: candidate.labName,
        sourceUrl: candidate.homepageResearchSourceUrl ?? candidate.labUrl ?? candidate.sourceUrl,
        researchText: [candidate.labName, candidate.homepageResearchText, candidate.researchText].filter(Boolean).join(" | ") || undefined,
        classification: candidate.classification,
      }),
    )
    .filter((item): item is ReviewItemRow => Boolean(item));
  const uniqueLabs = uniqueLocalLabs(labs);
  const totalMemberCount = uniqueLabs.reduce((total, lab) => total + (lab.memberCount ?? 0), 0);
  const totalPaperCount = uniqueLabs.reduce((total, lab) => total + (lab.paperCount ?? 0), 0);

  const rankingRow: RankingRow = {
    school,
    department: "전체 대학원",
    labs: uniqueLabs.length,
    professors: uniqueLabs.length,
    pages: programs.length,
    memberCount: totalMemberCount || null,
    paperCount: totalPaperCount,
    avgConfidence: 1,
    source: "graduate-discovery",
  };

  return {
    ...data,
    generatedAt: report.generatedAt ?? data.generatedAt,
    rankingRows: [...data.rankingRows.filter((row) => row.school !== school), rankingRow],
    labs: [...data.labs.filter((lab) => lab.school !== school), ...labs],
    programs: [...data.programs.filter((program) => program.school !== school), ...programs],
    reviewItems: [...data.reviewItems.filter((item) => item.school !== school), ...reviewItems],
  };
}

function mergeCauGraduateReport(data: DashboardData, report: CauGraduateDiscoveryReport): DashboardData {
  const school = "중앙대학교";
  const schoolAliases = new Set([school, "중앙대", "Chung-Ang University", "Chung Ang University", "CAU"]);
  const isCauSchool = (value: string) => schoolAliases.has(value);
  const programs: GraduateProgramRow[] = report.departments.map((department) => ({
    school,
    series: "일반대학원",
    name: department.name,
    homepageUrl: department.homepageUrl ?? department.facultyUrl,
    type: "department",
    taxonomy: [],
  }));

  const labs: LabRow[] = report.facultyCandidates.map((candidate, index) => ({
    id: `cau-grad-${index}-${candidate.departmentName}-${candidate.professorName ?? candidate.labName ?? "unknown"}`,
    name: candidate.professorName ?? "교수명 미확인",
    school,
    department: candidate.departmentName,
    programName: candidate.departmentName,
    researchText: [candidate.labName, candidate.researchText].filter(Boolean).join(" | ") || undefined,
    homepageUrl: candidate.labUrl,
    sourceUrl: candidate.labUrl ?? candidate.sourceUrl,
    scholarUrl: candidate.scholarUrl,
    dblpUrl: candidate.dblpUrl,
    paperCount: candidate.paperCount ?? 0,
    confidence: 1,
    memberCount: candidate.currentMemberCount ?? null,
    keywords: candidate.classification?.matches?.map((match) => match.labelKo) ?? [],
    source: "graduate-discovery",
  }));
  const uniqueLabs = uniqueLocalLabs(labs);
  const totalMemberCount = uniqueLabs.reduce((total, lab) => total + (lab.memberCount ?? 0), 0);
  const totalPaperCount = uniqueLabs.reduce((total, lab) => total + (lab.paperCount ?? 0), 0);

  const rankingRow: RankingRow = {
    school,
    department: "전체 대학원",
    labs: uniqueLabs.length,
    professors: uniqueLabs.length,
    pages: programs.length,
    memberCount: totalMemberCount || null,
    paperCount: totalPaperCount,
    avgConfidence: 1,
    source: "graduate-discovery",
  };

  return {
    ...data,
    generatedAt: report.generatedAt ?? data.generatedAt,
    rankingRows: [...data.rankingRows.filter((row) => !isCauSchool(row.school)), rankingRow],
    labs: [...data.labs.filter((lab) => !isCauSchool(lab.school)), ...labs],
    programs: [...data.programs.filter((program) => !isCauSchool(program.school)), ...programs],
  };
}

function mergeHufsGraduateReport(data: DashboardData, report: HufsGraduateDiscoveryReport): DashboardData {
  const school = "한국외국어대학교";
  const programs: GraduateProgramRow[] = report.departments.map((department) => ({
    school,
    series: department.collegeName,
    name: department.name,
    homepageUrl: department.homepageUrl,
    type: "department",
    taxonomy: department.classification?.matches?.map((match) => match.labelKo) ?? [],
  }));

  const labs: LabRow[] = report.facultyCandidates.map((candidate, index) => ({
    id: `hufs-grad-${index}-${candidate.departmentName}-${candidate.nameKo ?? candidate.nameEn ?? "unknown"}`,
    name: candidate.nameKo ?? candidate.nameEn ?? "이름 미상",
    school,
    department: candidate.departmentName,
    programName: candidate.departmentName,
    researchText: candidate.researchText,
    homepageUrl: candidate.labUrl,
    sourceUrl: candidate.labUrl ?? candidate.sourceUrl,
    scholarUrl: candidate.scholarUrl,
    dblpUrl: candidate.dblpUrl,
    paperCount: candidate.publicationCount ?? 0,
    confidence: 1,
    memberCount: candidate.currentMemberCount ?? null,
    keywords: candidate.classification?.matches?.map((match) => match.labelKo) ?? [],
    source: "graduate-discovery",
  }));
  const uniqueLabs = uniqueLocalLabs(labs);
  const totalMemberCount = uniqueLabs.reduce((total, lab) => total + (lab.memberCount ?? 0), 0);
  const totalPaperCount = uniqueLabs.reduce((total, lab) => total + (lab.paperCount ?? 0), 0);

  const rankingRow: RankingRow = {
    school,
    department: "전체 대학원",
    labs: uniqueLabs.length,
    professors: uniqueLabs.length,
    pages: programs.length,
    memberCount: totalMemberCount || null,
    paperCount: totalPaperCount,
    avgConfidence: 1,
    source: "graduate-discovery",
  };

  return {
    ...data,
    generatedAt: report.generatedAt ?? data.generatedAt,
    rankingRows: [...data.rankingRows.filter((row) => row.school !== school), rankingRow],
    labs: [...data.labs.filter((lab) => lab.school !== school), ...labs],
    programs: [...data.programs.filter((program) => program.school !== school), ...programs],
  };
}

function mergeUosGraduateReport(data: DashboardData, report: UosGraduateDiscoveryReport): DashboardData {
  const school = "서울시립대학교";
  const programs: GraduateProgramRow[] = report.departments.map((department) => ({
    school,
    series: department.category,
    name: department.name,
    homepageUrl: department.homepageUrl ?? department.facultyUrl,
    type: "department",
    taxonomy: department.classification?.matches?.map((match) => match.labelKo) ?? [],
  }));

  const labs: LabRow[] = report.facultyCandidates.map((candidate, index) => ({
    id: `uos-grad-${index}-${candidate.sourceDepartmentName}-${candidate.nameKo ?? "unknown"}`,
    name: candidate.nameKo ?? candidate.labName ?? "이름 미상",
    school,
    department: candidate.sourceDepartmentName,
    programName: candidate.sourceDepartmentName,
    researchText: [candidate.labName, candidate.researchText].filter(Boolean).join(" | ") || undefined,
    homepageUrl: candidate.labUrl,
    sourceUrl: candidate.labUrl ?? candidate.sourceUrl,
    scholarUrl: candidate.scholarUrl,
    dblpUrl: candidate.dblpUrl,
    paperCount: candidate.paperCount ?? 0,
    confidence: candidate.labUrlSource === "external_lab_homepage" ? 1 : 0.72,
    memberCount: candidate.currentMemberCount ?? null,
    keywords: candidate.classification?.matches?.map((match) => match.labelKo) ?? [],
    source: "graduate-discovery",
  }));
  const uniqueLabs = uniqueLocalLabs(labs);
  const totalMemberCount = uniqueLabs.reduce((total, lab) => total + (lab.memberCount ?? 0), 0);
  const totalPaperCount = uniqueLabs.reduce((total, lab) => total + (lab.paperCount ?? 0), 0);

  const rankingRow: RankingRow = {
    school,
    department: "전체 대학원",
    labs: uniqueLabs.length,
    professors: uniqueLabs.length,
    pages: programs.length,
    memberCount: totalMemberCount || null,
    paperCount: totalPaperCount,
    avgConfidence: average(uniqueLabs.map((lab) => lab.confidence)),
    source: "graduate-discovery",
  };

  return {
    ...data,
    generatedAt: report.generatedAt ?? data.generatedAt,
    rankingRows: [...data.rankingRows.filter((row) => row.school !== school), rankingRow],
    labs: [...data.labs.filter((lab) => lab.school !== school), ...labs],
    programs: [...data.programs.filter((program) => program.school !== school), ...programs],
  };
}

function uniqueLocalLabs(labs: LabRow[]): LabRow[] {
  const seen = new Set<string>();
  const rows: LabRow[] = [];
  for (const lab of labs) {
    const primaryUrl = getPrimaryLabUrl(lab);
    const key = primaryUrl ? `${lab.school}|${lab.name}|${primaryUrl}` : `${lab.school}|${lab.name}|${lab.department ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    rows.push(lab);
  }
  return rows;
}

function sum(pages: DryRunPage[], key: keyof NonNullable<DryRunPage["entityCounts"]>): number {
  return pages.reduce((total, page) => total + (page.entityCounts?.[key] ?? 0), 0);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function countBy<T extends Record<string, unknown>>(rows: T[], key: keyof T): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[key];
    if (typeof value !== "string") {
      continue;
    }
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function sumByGroup<T extends Record<string, unknown>>(rows: T[], groupKey: keyof T, valueKey: keyof T): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const group = row[groupKey];
    const value = row[valueKey];
    if (typeof group !== "string" || typeof value !== "number") {
      continue;
    }
    totals.set(group, (totals.get(group) ?? 0) + value);
  }
  return totals;
}

function averageByGroup<T extends Record<string, unknown>>(rows: T[], groupKey: keyof T, valueKey: keyof T): Map<string, number> {
  const buckets = new Map<string, number[]>();
  for (const row of rows) {
    const group = row[groupKey];
    const value = row[valueKey];
    if (typeof group !== "string") {
      continue;
    }
    const numeric = Number(value ?? 0);
    buckets.set(group, [...(buckets.get(group) ?? []), numeric]);
  }
  return new Map([...buckets.entries()].map(([key, values]) => [key, average(values)]));
}
