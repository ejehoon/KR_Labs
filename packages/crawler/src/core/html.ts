export function cleanText(input: string | undefined): string | undefined {
  const value = input?.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return value || undefined;
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)));
}

export function textFromHtml(input: string | undefined): string | undefined {
  if (!input) {
    return undefined;
  }

  return cleanText(
    decodeHtmlEntities(
      input
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]*>/g, " "),
    ),
  );
}

export function resolveUrl(rawUrl: string | undefined, baseUrl: string): string | undefined {
  const trimmed = cleanText(rawUrl);
  if (
    !trimmed ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:") ||
    trimmed.startsWith("javascript:") ||
    /^[^/:]+@[^/]+$/.test(trimmed)
  ) {
    return undefined;
  }

  try {
    const url = new URL(trimmed, baseUrl);
    url.searchParams.delete("PHPSESSID");
    if (url.username || url.password) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export function extractHtmlCells(rowHtml: string): string[] {
  return rowHtml.match(/<td\b[\s\S]*?<\/td>/gi) ?? [];
}

export function extractFirstHref(html: string | undefined, baseUrl: string): string | undefined {
  const rawHref = html?.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1];
  return resolveUrl(rawHref, baseUrl);
}

export function uniqueBy<T>(items: T[], getKey: (item: T) => string | undefined): T[] {
  const seen = new Set<string>();
  const output: T[] = [];

  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }

  return output;
}
