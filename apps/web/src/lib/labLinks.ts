import type { LabRow } from "../data";

export function getPrimaryLabUrl(lab: Pick<LabRow, "homepageUrl" | "sourceUrl">): string | undefined {
  return [lab.homepageUrl, lab.sourceUrl].find((url) => url && !isInstitutionalHomeUrl(url));
}

export function getPrimaryLabUrlTitle(lab: Pick<LabRow, "homepageUrl" | "sourceUrl">): string {
  return lab.homepageUrl && !isInstitutionalHomeUrl(lab.homepageUrl) ? "연구실 홈페이지" : "수집 출처 페이지";
}

export function getPrimaryLabUrlLabel(lab: Pick<LabRow, "homepageUrl" | "sourceUrl" | "memberCount">): string {
  if ((!lab.homepageUrl || isInstitutionalHomeUrl(lab.homepageUrl)) && lab.sourceUrl && !isInstitutionalHomeUrl(lab.sourceUrl)) {
    return "출처 보기";
  }

  return lab.memberCount === null ? "알 수 없음" : `${lab.memberCount}명`;
}

function isInstitutionalHomeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/g, "") || "/";
    return host === "sogang.ac.kr" && ["/", "/index.do", "/ko/home"].includes(path.toLowerCase());
  } catch {
    return false;
  }
}
