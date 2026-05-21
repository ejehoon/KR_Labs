import { chromium, type Browser, type BrowserContext } from "playwright";

export type BrowserManager = {
  browser: Browser;
  context: BrowserContext;
  close: () => Promise<void>;
};

export async function createBrowserManager(): Promise<BrowserManager> {
  const headless = process.env.CRAWLER_HEADLESS !== "false";
  const userAgent = process.env.CRAWLER_USER_AGENT ?? "KR-Labs-Crawler/0.1 contact@example.com";
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    userAgent,
    locale: "ko-KR",
    viewport: { width: 1365, height: 900 },
    ignoreHTTPSErrors: true,
  });

  await context.addInitScript("globalThis.__name = (target) => target;");

  await context.route("**/*", async (route) => {
    const type = route.request().resourceType();
    if (["image", "font", "media"].includes(type)) {
      await route.abort();
      return;
    }
    await route.continue();
  });

  return {
    browser,
    context,
    close: async () => {
      await context.close();
      await browser.close();
    },
  };
}
