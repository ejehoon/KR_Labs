import type { BrowserContext } from "playwright";

export type PlaywrightLink = {
  text: string;
  href: string;
  className?: string;
};

export type PlaywrightPageSnapshot = {
  url: string;
  finalUrl: string;
  status?: number;
  title: string;
  html: string;
  text: string;
  headings: string[];
  links: PlaywrightLink[];
  iframeUrls: string[];
};

export async function snapshotPlaywrightPage(context: BrowserContext, url: string): Promise<PlaywrightPageSnapshot> {
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(30_000);

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(async (error: unknown) => {
      if (error instanceof Error && /Timeout/i.test(error.message)) {
        return page.goto(url, { waitUntil: "commit", timeout: 30_000 });
      }
      throw error;
    });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

    const data = await page.evaluate<{
      title: string;
      html: string;
      text: string;
      headings: string[];
      links: PlaywrightLink[];
      iframeUrls: string[];
    }>(`(() => {
      const clean = (value) => value?.replace(/\\s+/g, " ").trim() ?? "";
      return {
        title: document.title,
        html: document.documentElement?.outerHTML ?? "",
        text: clean(document.body?.innerText),
        headings: [...document.querySelectorAll("h1,h2,h3,h4,.tit,.dep1_tit")]
          .map((node) => clean(node.textContent))
          .filter(Boolean),
        links: [...document.querySelectorAll("a[href]")]
          .map((node) => ({
            text: clean(node.innerText || node.textContent),
            href: node.href || node.getAttribute("href") || "",
            className: typeof node.className === "string" ? node.className : undefined,
          }))
          .filter((link) => link.href),
        iframeUrls: [...document.querySelectorAll("iframe[src]")].map((node) => node.src).filter(Boolean),
      };
    })()`);

    return {
      url,
      finalUrl: page.url(),
      status: response?.status(),
      title: data.title,
      html: data.html,
      text: data.text,
      headings: data.headings,
      links: data.links,
      iframeUrls: data.iframeUrls,
    };
  } finally {
    await page.close();
  }
}
