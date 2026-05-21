export type DblpAuthorResolution = {
  authorName?: string;
  url: string;
  paperCount?: number;
  method: "direct_link" | "exact_author_search";
};

type DblpAuthorHit = {
  info?: {
    author?: string;
    url?: string;
  };
};

const userAgent = process.env.CRAWLER_USER_AGENT ?? "Mozilla/5.0 (compatible; KR-Labs-Crawler/0.1)";
const dblpRequestIntervalMs = Number(process.env.DBLP_REQUEST_INTERVAL_MS ?? 750);
const fetchCache = new Map<string, Promise<string | undefined>>();
const authorCache = new Map<string, Promise<DblpAuthorResolution | undefined>>();
let dblpRequestQueue = Promise.resolve();
let lastDblpRequestAt = 0;

export function extractDblpPid(url: string | undefined): string | undefined {
  return url?.match(/dblp\.(?:org|uni-trier\.de)\/pid\/([^?#.]+(?:\/[^?#.]+)?)/i)?.[1];
}

export function normalizeDblpAuthorName(value: string | undefined): string {
  return (value ?? "")
    .replace(/\s+000\d+\s*$/i, "")
    .replace(/[.'’`-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export async function fetchDblpPublicationCount(dblpUrl: string): Promise<number | undefined> {
  const pid = extractDblpPid(dblpUrl);
  if (!pid) {
    return undefined;
  }

  const xml = await fetchText(`https://dblp.org/pid/${pid}.xml`) ?? await fetchText(`https://dblp.uni-trier.de/pid/${pid}.xml`);
  const n = xml?.match(/<dblpperson\b[^>]*\bn=["'](\d+)["']/i)?.[1];
  if (n) {
    return Number(n);
  }
  return xml?.match(/<r>/g)?.length;
}

export async function resolveExactDblpAuthor(name: string): Promise<DblpAuthorResolution | undefined> {
  const normalizedName = normalizeDblpAuthorName(name);
  if (!normalizedName) {
    return undefined;
  }

  const cached = authorCache.get(normalizedName);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const jsonText = await fetchText(`https://dblp.org/search/author/api?q=${encodeURIComponent(name)}&format=json`);
    if (!jsonText) {
      return undefined;
    }

    const json = JSON.parse(jsonText) as { result?: { hits?: { hit?: DblpAuthorHit | DblpAuthorHit[] } } };
    const rawHits = json.result?.hits?.hit;
    const hits = Array.isArray(rawHits) ? rawHits : rawHits ? [rawHits] : [];
    const exactHits = hits.filter((hit) => hit.info?.author && hit.info.url && normalizeDblpAuthorName(hit.info.author) === normalizedName);
    if (exactHits.length !== 1) {
      return undefined;
    }

    const hit = exactHits[0] as DblpAuthorHit;
    const url = hit.info?.url;
    if (!url) {
      return undefined;
    }

    return {
      authorName: hit.info?.author,
      url,
      paperCount: await fetchDblpPublicationCount(url),
      method: "exact_author_search" as const,
    };
  })();

  authorCache.set(normalizedName, promise);
  return promise;
}

export async function resolveDirectDblpLink(url: string): Promise<DblpAuthorResolution | undefined> {
  if (!extractDblpPid(url)) {
    return undefined;
  }

  return {
    url,
    paperCount: await fetchDblpPublicationCount(url),
    method: "direct_link",
  };
}

async function fetchText(url: string): Promise<string | undefined> {
  const cached = fetchCache.get(url);
  if (cached) {
    return cached;
  }

  const promise = enqueueDblpRequest(async () => {
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch(url, { headers: { "user-agent": userAgent }, signal: AbortSignal.timeout(15_000) });
        if (response.status === 429) {
          await sleep(2_000 + attempt * 2_000);
          continue;
        }
        if (!response.ok) {
          return undefined;
        }
        return response.text();
      }
      return undefined;
    } catch {
      return undefined;
    }
  });

  fetchCache.set(url, promise);
  return promise;
}

function enqueueDblpRequest<T>(task: () => Promise<T>): Promise<T> {
  const next = dblpRequestQueue.then(async () => {
    const waitMs = Math.max(0, lastDblpRequestAt + dblpRequestIntervalMs - Date.now());
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    lastDblpRequestAt = Date.now();
    return task();
  });
  dblpRequestQueue = next.then(() => undefined, () => undefined);
  return next;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
