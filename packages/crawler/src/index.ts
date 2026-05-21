import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createReviewItem,
  finishCrawlJob,
  insertCrawlError,
  insertCrawlPage,
  upsertDepartment,
  upsertLab,
  upsertProfessor,
  upsertPublication,
  upsertUniversity,
} from "@kr-labs/db";
import { getSchoolConfig } from "./config/schools.js";
import { createBrowserManager } from "./core/browser.js";
import { extractEntities } from "./core/entityExtract.js";
import { normalizeUrl } from "./core/linkDiscovery.js";
import { extractPage } from "./core/pageExtract.js";
import { RateLimiter } from "./core/rateLimit.js";
import { isAllowedByRobots } from "./core/robots.js";
import type { CrawlMetrics, SchoolCrawlerConfig } from "./types.js";

type RunDiscoverInput = {
  client: SupabaseClient;
  schoolSlug: string;
  jobId: string;
};

type QueueItem = {
  url: string;
  depth: number;
};

function initialMetrics(): CrawlMetrics {
  return {
    visitedPages: 0,
    successfulPages: 0,
    failedPages: 0,
    skippedPages: 0,
    departmentsFound: 0,
    professorsFound: 0,
    labsFound: 0,
    publicationsFound: 0,
    reviewItemsCreated: 0,
  };
}

export async function runDiscoverSchool(input: RunDiscoverInput): Promise<CrawlMetrics> {
  const config = getSchoolConfig(input.schoolSlug);
  const university = await upsertUniversity(input.client, {
    slug: config.slug,
    nameKo: config.nameKo,
    nameEn: config.nameEn,
    homepageUrl: config.homepageUrl,
  });
  const metrics = initialMetrics();
  const queue: QueueItem[] = config.seedUrls.map((url) => ({ url, depth: 0 }));
  const visited = new Set<string>();
  const browser = await createBrowserManager();
  const limiter = new RateLimiter(config.delayMs);
  const userAgent = process.env.CRAWLER_USER_AGENT ?? "KR-Labs-Crawler/0.1 contact@example.com";

  try {
    while (queue.length > 0 && visited.size < config.maxPages) {
      const item = queue.shift();
      if (!item) {
        break;
      }
      const normalized = normalizeUrl(item.url);
      if (!normalized || visited.has(normalized)) {
        metrics.skippedPages += 1;
        continue;
      }
      visited.add(normalized);

      if (!(await isAllowedByRobots(normalized, userAgent, config.allowedDomains))) {
        metrics.skippedPages += 1;
        await insertCrawlPage(input.client, {
          crawlJobId: input.jobId,
          url: normalized,
          status: "skipped",
          metadata: { reason: "robots_or_domain_disallowed" },
        });
        continue;
      }

      await limiter.wait();
      metrics.visitedPages += 1;

      try {
        const page = await extractPage(browser.context, normalized, config);
        await insertCrawlPage(input.client, {
          crawlJobId: input.jobId,
          url: page.url,
          finalUrl: page.finalUrl,
          domain: page.domain,
          pageType: page.pageType,
          httpStatus: page.httpStatus,
          title: page.title,
          extractedText: page.extractedText,
          contentHash: page.contentHash,
          metadata: {
            metaDescription: page.metaDescription,
            headings: page.headings,
            linkCount: page.links.length,
            textLength: page.extractedText.length,
            languageHint: page.languageHint,
          },
          status: page.extractedText.length < 200 ? "needs_review" : "success",
        });
        metrics.successfulPages += 1;

        const entities = extractEntities(page, config);
        metrics.departmentsFound += entities.departments.length;
        metrics.professorsFound += entities.professors.length;
        metrics.labsFound += entities.labs.length;
        metrics.publicationsFound += entities.publications.length;

        for (const department of entities.departments) {
          const row = await upsertDepartment(input.client, {
            universityId: university.id,
            nameKo: department.nameKo,
            nameEn: department.nameEn,
            homepageUrl: department.homepageUrl,
            sourceUrl: department.sourceUrl,
            crawlConfidence: department.confidence,
          });
          if (department.confidence < 0.5) {
            await createReviewItem(input.client, {
              entityType: "department",
              entityId: row.id,
              reason: "Low confidence department candidate",
              suggestedAction: "Confirm whether the URL is an official department page.",
              metadata: department,
            });
            metrics.reviewItemsCreated += 1;
          }
        }

        for (const professor of entities.professors) {
          const row = await upsertProfessor(input.client, {
            universityId: university.id,
            nameKo: professor.nameKo,
            nameEn: professor.nameEn,
            title: professor.title,
            email: professor.email,
            profileUrl: professor.profileUrl,
            labUrl: professor.labUrl,
            researchInterests: professor.researchInterests,
            sourceUrl: professor.sourceUrl,
            crawlConfidence: professor.confidence,
          });
          if (professor.confidence < 0.5) {
            await createReviewItem(input.client, {
              entityType: "professor",
              entityId: row.id,
              reason: "Low confidence professor candidate",
              suggestedAction: "Confirm name, affiliation, and profile URL.",
              metadata: professor,
            });
            metrics.reviewItemsCreated += 1;
          }
        }

        for (const lab of entities.labs) {
          const row = await upsertLab(input.client, {
            universityId: university.id,
            nameKo: lab.nameKo,
            nameEn: lab.nameEn,
            homepageUrl: lab.homepageUrl,
            description: lab.description,
            researchKeywords: lab.researchKeywords,
            currentMemberCount: lab.currentMemberCount,
            memberCountBreakdown: lab.memberCountBreakdown,
            memberCountSourceUrl: lab.currentMemberCount !== undefined ? lab.sourceUrl : undefined,
            memberCountCrawledAt: lab.currentMemberCount !== undefined ? new Date().toISOString() : undefined,
            sourceUrl: lab.sourceUrl,
            contentHash: lab.contentHash,
            lastCrawledAt: new Date().toISOString(),
            lastChangedAt: new Date().toISOString(),
            crawlConfidence: lab.confidence,
          });
          if (lab.confidence < 0.5) {
            await createReviewItem(input.client, {
              entityType: "lab",
              entityId: row.id,
              reason: "Low confidence lab candidate",
              suggestedAction: "Confirm lab name and homepage URL.",
              metadata: lab,
            });
            metrics.reviewItemsCreated += 1;
          }
        }

        for (const publication of entities.publications) {
          await upsertPublication(input.client, {
            universityId: university.id,
            title: publication.title,
            authors: publication.authors,
            venue: publication.venue,
            year: publication.year,
            doi: publication.doi,
            url: publication.url,
            source: page.pageType === "lab" ? "lab_page" : "professor_page",
            sourceUrl: publication.sourceUrl,
            crawlConfidence: publication.confidence,
          });
        }

        if (item.depth < config.maxDepth) {
          for (const link of page.links) {
            if (visited.size + queue.length >= config.maxPages) {
              break;
            }
            if (!visited.has(link.url) && link.score >= 5) {
              queue.push({ url: link.url, depth: item.depth + 1 });
            }
          }
        }
      } catch (error) {
        metrics.failedPages += 1;
        await insertCrawlError(input.client, {
          crawlJobId: input.jobId,
          url: normalized,
          errorType: error instanceof Error ? error.name : "UnknownError",
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }
  } finally {
    await browser.close();
  }

  await finishCrawlJob(input.client, input.jobId, {
    status: metrics.failedPages > 0 ? "partial_success" : "success",
    metrics,
    errorCount: metrics.failedPages,
  });

  return metrics;
}

export function resolveSchoolConfig(slug: string): SchoolCrawlerConfig {
  return getSchoolConfig(slug);
}
