import type { BrowserContext } from "playwright";
import type { ExtractedPage, SchoolCrawlerConfig } from "../types.js";
import { hashContent } from "./hash.js";
import { classifyPageType, discoverLinks } from "./linkDiscovery.js";

const maxTextLength = 100_000;

function trimText(input: string): string {
  return input
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxTextLength);
}

export async function extractPage(context: BrowserContext, url: string, config: SchoolCrawlerConfig): Promise<ExtractedPage> {
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(25_000);

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);

    const finalUrl = page.url();
    const domain = new URL(finalUrl).hostname;
    const title = trimText(await page.title().catch(() => ""));
    const data = await page.evaluate(() => {
      document.querySelectorAll("script, style, noscript, svg, nav, footer").forEach((node) => node.remove());
      const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
      const headings = [...document.querySelectorAll("h1,h2,h3")]
        .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
        .filter(Boolean);
      const links = [...document.querySelectorAll("a[href]")]
        .map((node) => ({
          href: (node as HTMLAnchorElement).href || node.getAttribute("href") || "",
          text: node.textContent?.replace(/\s+/g, " ").trim() ?? "",
        }))
        .filter((link) => link.href.length > 0);
      const tablesText = [...document.querySelectorAll("table")]
        .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
        .filter(Boolean);
      const languageHint = document.documentElement.lang || undefined;
      const extractedText = document.body?.innerText ?? "";

      return { metaDescription, headings, links, tablesText, languageHint, extractedText };
    });
    const extractedText = trimText(data.extractedText);
    const links = discoverLinks(data.links, finalUrl, config);
    const pageType = classifyPageType(finalUrl, `${title} ${data.headings.join(" ")} ${extractedText.slice(0, 1000)}`, config);

    return {
      url,
      finalUrl,
      domain,
      httpStatus: response?.status(),
      title,
      metaDescription: trimText(data.metaDescription),
      extractedText,
      headings: data.headings.map(trimText),
      links,
      tablesText: data.tablesText.map(trimText),
      languageHint: data.languageHint,
      contentHash: hashContent(extractedText),
      pageType,
    };
  } finally {
    await page.close();
  }
}
