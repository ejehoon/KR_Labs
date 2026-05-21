import type { SchoolCrawlerConfig } from "../types.js";
import { kaistConfig } from "../schools/kaist.js";
import { koreaConfig } from "../schools/korea.js";
import { snuConfig } from "../schools/snu.js";
import { yonseiConfig } from "../schools/yonsei.js";

export const schoolConfigs: Record<string, SchoolCrawlerConfig> = {
  snu: snuConfig,
  yonsei: yonseiConfig,
  korea: koreaConfig,
  kaist: kaistConfig,
};

export function getSchoolConfig(slug: string): SchoolCrawlerConfig {
  const config = schoolConfigs[slug];
  if (!config) {
    const supported = Object.keys(schoolConfigs).sort().join(", ");
    throw new Error(`Unknown school slug "${slug}". Supported schools: ${supported}`);
  }
  return config;
}

export function listSchoolConfigs(): SchoolCrawlerConfig[] {
  return Object.values(schoolConfigs);
}
