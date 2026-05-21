import { isAllowedDomain } from "./linkDiscovery.js";

const cache = new Map<string, string>();

export async function isAllowedByRobots(url: string, userAgent: string, allowedDomains: string[]): Promise<boolean> {
  if (!isAllowedDomain(url, allowedDomains)) {
    return false;
  }

  try {
    const parsed = new URL(url);
    const robotsUrl = `${parsed.origin}/robots.txt`;
    let body = cache.get(robotsUrl);
    if (!body) {
      const response = await fetch(robotsUrl, { headers: { "user-agent": userAgent } });
      if (!response.ok) {
        return true;
      }
      body = await response.text();
      cache.set(robotsUrl, body);
    }

    const path = parsed.pathname || "/";
    const disallowRules = body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^disallow:/i.test(line))
      .map((line) => line.replace(/^disallow:/i, "").trim())
      .filter(Boolean);

    return !disallowRules.some((rule) => rule !== "/" && path.startsWith(rule));
  } catch {
    return true;
  }
}
