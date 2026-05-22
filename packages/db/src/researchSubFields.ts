type DbClient = any;

type ResearchSubField = {
  id: number;
  name: string;
};

export const CORE_RESEARCH_SUB_FIELDS: ResearchSubField[] = [
  { id: 1, name: "AI" },
  { id: 2, name: "컴퓨터 비전" },
  { id: 3, name: "머신러닝" },
  { id: 4, name: "자연어처리" },
  { id: 5, name: "웹/정보검색" },
  { id: 6, name: "컴퓨터 구조" },
  { id: 7, name: "네트워크" },
  { id: 8, name: "보안" },
  { id: 9, name: "데이터베이스" },
  { id: 10, name: "전산설계/CAE" },
  { id: 11, name: "임베디드 시스템" },
  { id: 12, name: "고성능 컴퓨팅" },
  { id: 13, name: "모바일 컴퓨팅" },
  { id: 14, name: "성능분석" },
  { id: 15, name: "운영체제" },
  { id: 16, name: "프로그래밍 언어" },
  { id: 17, name: "소프트웨어 공학" },
  { id: 18, name: "알고리즘" },
  { id: 19, name: "암호/부호 이론" },
  { id: 20, name: "논리/검증" },
  { id: 21, name: "바이오정보학" },
  { id: 22, name: "컴퓨터 그래픽스" },
  { id: 23, name: "컴퓨터과학교육" },
  { id: 24, name: "경제학" },
  { id: 25, name: "HCI" },
  { id: 26, name: "로보틱스" },
  { id: 27, name: "시각화" },
  { id: 55, name: "미분류" },
  { id: 56, name: "데이터 분석" },
  { id: 57, name: "LLM" },
  { id: 58, name: "멀티모달 AI" },
  { id: 59, name: "디지털 헬스케어" },
  { id: 60, name: "데이터마이닝" },
  { id: 61, name: "시계열 분석" },
  { id: 62, name: "생성형 AI" },
  { id: 63, name: "AI Agent" },
  { id: 64, name: "교통/물류 시스템" },
  { id: 65, name: "산업공학" },
  { id: 66, name: "운영/최적화" },
  { id: 67, name: "딥러닝" },
  { id: 68, name: "음성/오디오 AI" },
  { id: 70, name: "반도체/집적회로" },
  { id: 71, name: "반도체 신뢰성" },
];

const LEGACY_NAME_TO_CORE_NAME = new Map<string, string>([
  ["artificial intelligence", "AI"],
  ["computer vision", "컴퓨터 비전"],
  ["machine learning", "머신러닝"],
  ["natural language processing", "자연어처리"],
  ["the web & information retrieval", "웹/정보검색"],
  ["computer architecture", "컴퓨터 구조"],
  ["computer networks", "네트워크"],
  ["computer security", "보안"],
  ["databases", "데이터베이스"],
  ["design automation", "전산설계/CAE"],
  ["embedded & real-time systems", "임베디드 시스템"],
  ["high-performance computing", "고성능 컴퓨팅"],
  ["mobile computing", "모바일 컴퓨팅"],
  ["measurement & perf. analysis", "성능분석"],
  ["operating systems", "운영체제"],
  ["programming languages", "프로그래밍 언어"],
  ["software engineering", "소프트웨어 공학"],
  ["algorithms & complexity", "알고리즘"],
  ["cryptography", "암호/부호 이론"],
  ["logic & verification", "논리/검증"],
  ["comp. bio & bioinformatics", "바이오정보학"],
  ["computer graphics", "컴퓨터 그래픽스"],
  ["computer science education", "컴퓨터과학교육"],
  ["economics & computation", "경제학"],
  ["human-computer interaction", "HCI"],
  ["robotics", "로보틱스"],
  ["visualization", "시각화"],
  ["uncategorized", "미분류"],
  ["data analytics", "데이터 분석"],
  ["multimodal ai", "멀티모달 AI"],
  ["digital healthcare", "디지털 헬스케어"],
  ["data mining", "데이터마이닝"],
  ["time-series analysis", "시계열 분석"],
  ["generative ai", "생성형 AI"],
  ["transportation & logistics", "교통/물류 시스템"],
  ["industrial engineering", "산업공학"],
  ["operations research & optimization", "운영/최적화"],
  ["semiconductor device", "반도체/집적회로"],
]);

let coreFieldsEnsured = false;
let cachedFieldsByName: Map<string, ResearchSubField> | undefined;
let cachedNextId = 1;

export function normalizeResearchCategoryName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function lookupKey(name: string): string {
  const normalized = normalizeResearchCategoryName(name).toLowerCase();
  return LEGACY_NAME_TO_CORE_NAME.get(normalized)?.toLowerCase() ?? normalized;
}

export async function ensureCoreResearchSubFields(client: DbClient): Promise<void> {
  if (coreFieldsEnsured) {
    return;
  }
  for (const field of CORE_RESEARCH_SUB_FIELDS) {
    const { error } = await client.from("research_sub_fields").upsert(field, { onConflict: "id" });
    if (error) {
      throw error;
    }
  }
  coreFieldsEnsured = true;
}

export async function resolveResearchSubFieldIds(
  client: DbClient,
  labels: string[],
  options: { createMissing?: boolean; maxCreateMissing?: number } = {},
): Promise<number[]> {
  await ensureCoreResearchSubFields(client);

  const normalizedLabels = [...new Set(labels.map(normalizeResearchCategoryName).filter(Boolean))];
  if (normalizedLabels.length === 0) {
    return [55];
  }

  if (!cachedFieldsByName) {
    const { data: rows, error } = await client.from("research_sub_fields").select("id,name");
    if (error) {
      throw error;
    }

    cachedFieldsByName = new Map<string, ResearchSubField>();
    cachedNextId = 1;
    for (const row of (rows ?? []) as ResearchSubField[]) {
      cachedFieldsByName.set(lookupKey(row.name), row);
      cachedNextId = Math.max(cachedNextId, row.id + 1);
    }
  }

  const ids: number[] = [];
  let createdMissing = 0;
  for (const label of normalizedLabels) {
    const key = lookupKey(label);
    const existing = cachedFieldsByName.get(key);
    if (existing) {
      ids.push(existing.id);
      continue;
    }

    if (!options.createMissing) {
      continue;
    }
    if (typeof options.maxCreateMissing === "number" && createdMissing >= options.maxCreateMissing) {
      continue;
    }

    const inserted = { id: cachedNextId, name: label };
    cachedNextId += 1;
    const { data, error: insertError } = await client
      .from("research_sub_fields")
      .insert(inserted)
      .select("id,name")
      .single();
    if (insertError) {
      throw insertError;
    }
    const row = data as ResearchSubField;
    cachedFieldsByName.set(lookupKey(row.name), row);
    ids.push(row.id);
    createdMissing += 1;
  }

  const uniqueIds = [...new Set(ids)];
  return uniqueIds.length > 0 ? uniqueIds : [55];
}
