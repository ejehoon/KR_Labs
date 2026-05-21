import { mkdir, readFile, writeFile } from "node:fs/promises";

type RecipeBook = {
  version: 1;
  updatedAt: string;
  recipes: Array<{
    schoolSlug: string;
    schoolName: string;
    seedUrls: string[];
    allowedDomains: string[];
    lastReportPath: string;
    lastRunAt: string;
    pageTypeCounts: Record<string, number>;
    notes: string[];
    fixes: Array<{ date: string; description: string; files?: string[] }>;
  }>;
};

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

function csv(value: string | boolean | undefined): string[] {
  return typeof value === "string"
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
}

function printHelp() {
  console.log(`Usage: pnpm record:crawler-fix --school=<slug> --description="what changed" [--files=a.ts,b.ts]

Appends a crawler fix note to docs/crawler-recipes.json so later runs inherit the debugging history.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    return;
  }

  const school = String(args.get("school") ?? "");
  const description = String(args.get("description") ?? "");
  const files = csv(args.get("files"));
  if (!school || !description) {
    throw new Error("Missing --school or --description. See --help.");
  }

  const path = "docs/crawler-recipes.json";
  const book = JSON.parse(await readFile(path, "utf8")) as RecipeBook;
  const recipe = book.recipes.find((item) => item.schoolSlug === school);
  if (!recipe) {
    throw new Error(`No recipe found for "${school}". Run discover:seed with --update-recipe first.`);
  }

  recipe.fixes.push({
    date: new Date().toISOString(),
    description,
    files: files.length > 0 ? files : undefined,
  });
  book.updatedAt = new Date().toISOString();

  await mkdir("docs", { recursive: true });
  await writeFile(path, `${JSON.stringify(book, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ path, school, fixCount: recipe.fixes.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
