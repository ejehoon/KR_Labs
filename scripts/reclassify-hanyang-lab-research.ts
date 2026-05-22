import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createBrowserManager } from "../packages/crawler/src/core/browser.js";
import { enrichLabResearchEvidence } from "../packages/crawler/src/core/labResearchEvidence.js";
import { extractResearchDetailTopics } from "../packages/crawler/src/core/researchDetailTopics.js";
import { classifyResearchText, type ResearchClassification } from "../packages/crawler/src/taxonomy/researchTaxonomy.js";
import { createSupabaseAdmin, resolveResearchSubFieldIds } from "../packages/db/src/index.js";

type RankingProfessor = {
  id: number;
  name: string;
  department: string | null;
  lab_url: string | null;
  research_sub_fields: number[] | null;
};

type Target = {
  name: string;
  department: string;
  labName: string;
  labUrlHost: string;
  crawlUrl: string;
};

const defaultTargets: Target[] = [
  {
    name: "채동규",
    department: "인공지능학과",
    labName: "데이터인텔리전스 연구실",
    labUrlHost: "dilab.hanyang.ac.kr",
    crawlUrl: "https://dilab.hanyang.ac.kr/",
  },
  {
    name: "이동호",
    department: "컴퓨터공학과",
    labName: "데이터베이스 연구실",
    labUrlHost: "database.hanyang.ac.kr",
    crawlUrl: "https://database.hanyang.ac.kr/",
  },
  {
    name: "이동호",
    department: "산업공학과",
    labName: "생산물류 연구실",
    labUrlHost: "pli.hanyang.ac.kr",
    crawlUrl: "https://pli.hanyang.ac.kr/",
  },
  {
    name: "백상현",
    department: "전자공학과",
    labName: "고신뢰 및 고속컴퓨팅 연구실",
    labUrlHost: "rsc.hanyang.ac.kr",
    crawlUrl: "http://rsc.hanyang.ac.kr/",
  },
];

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (const arg of argv) {
    if (arg === "--confirm") {
      args.set("confirm", true);
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      args.set(match[1] ?? "", match[2] ?? "");
    }
  }
  return args;
}

function normalizeUrl(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
}

function labels(classification: ResearchClassification): string[] {
  const matches = classification.matches.map((match) => match.labelKo);
  if (matches.length > 0) {
    return matches;
  }
  return classification.suggestions.map((suggestion) => suggestion.suggestedLabel);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const confirm = args.get("confirm") === true;
  const reportPath = String(args.get("report") ?? "reports/hanyang-ai-lab-reclassification.json");
  const client = createSupabaseAdmin();

  const { data: university, error: universityError } = await client
    .from("universities")
    .select("id,name")
    .eq("name", "한양대학교")
    .maybeSingle();
  if (universityError || !university) {
    throw universityError ?? new Error("한양대학교 row not found.");
  }

  const { data: existingRows, error: rowsError } = await client
    .from("professors")
    .select("id,name,department,lab_url,research_sub_fields")
    .eq("university_id", university.id)
    .in("name", defaultTargets.map((target) => target.name));
  if (rowsError) {
    throw rowsError;
  }

  const browser = await createBrowserManager();
  const report = [];
  try {
    for (const target of defaultTargets) {
      const row = ((existingRows ?? []) as RankingProfessor[]).find((candidate) => {
        const url = normalizeUrl(candidate.lab_url);
        return candidate.name === target.name
          && candidate.department === target.department
          && url.includes(target.labUrlHost);
      });
      if (!row) {
        report.push({ target, status: "row_not_found" });
        continue;
      }

      const evidence = await enrichLabResearchEvidence(browser.context, target.crawlUrl, target.labName);
      const classification = classifyResearchText([target.labName, evidence.text].filter(Boolean).join(" | "));
      const nextFieldIds = await resolveResearchSubFieldIds(client, labels(classification));
      const detailText = evidence.text ?? null;
      const detailTopics = extractResearchDetailTopics(evidence.text);
      const beforeFieldIds = row.research_sub_fields ?? [];
      let updateStatus = "dry_run";

      if (confirm) {
        const { error: updateError } = await client
          .from("professors")
          .update({
            research_sub_fields: nextFieldIds,
            research_detail_text: detailText,
            research_detail_topics: detailTopics,
            research_detail_source_url: evidence.sourceUrl ?? null,
            research_detail_updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (updateError) {
          throw updateError;
        }
        updateStatus = "updated";
      }

      report.push({
        target,
        professorId: row.id,
        status: updateStatus,
        sourceUrl: evidence.sourceUrl,
        candidatePages: evidence.candidatePages,
        warnings: evidence.warnings,
        evidenceText: evidence.text,
        detailTopics,
        classification,
        beforeFieldIds,
        nextFieldIds,
      });
    }
  } finally {
    await browser.close();
  }

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify({ confirm, generatedAt: new Date().toISOString(), report }, null, 2));
  console.log(JSON.stringify({ confirm, reportPath, rows: report.length, statuses: report.map((row) => row.status) }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
