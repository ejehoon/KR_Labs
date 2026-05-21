import "dotenv/config";
import { createSupabaseAdmin, upsertUniversity } from "@kr-labs/db";
import { listSchoolConfigs } from "../packages/crawler/src/config/schools.js";

async function main() {
  const client = createSupabaseAdmin();
  const schools = listSchoolConfigs();

  for (const school of schools) {
    const row = await upsertUniversity(client, {
      slug: school.slug,
      nameKo: school.nameKo,
      nameEn: school.nameEn,
      homepageUrl: school.homepageUrl,
    });
    console.log(`Seeded ${school.slug}: ${row.id}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
