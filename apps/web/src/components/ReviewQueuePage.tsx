import { AlertTriangle, ExternalLink, Tag } from "lucide-react";
import type { ReviewItemRow } from "../data";
import { StatusPanel } from "./StatusPanel";

type ReviewQueuePageProps = {
  items: ReviewItemRow[];
};

function confidenceLabel(value: number | undefined): string {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "미측정";
}

function shortSource(url: string | undefined): string {
  if (!url) {
    return "출처 없음";
  }
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ReviewQueuePage({ items }: ReviewQueuePageProps) {
  const taxonomyItems = items.filter((item) => item.entityType === "taxonomy_category");
  const otherItems = items.filter((item) => item.entityType !== "taxonomy_category");
  const visibleItems = [...taxonomyItems, ...otherItems].sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3));

  return (
    <main className="main-panel review-main-panel">
      <div className="main-content main-content-wide">
        <section className="review-header">
          <div className="list-heading">
            <div>
              <p>검토 큐</p>
              <h1>분류와 크롤링 확인 항목</h1>
            </div>
            <span>
              신규 카테고리 {taxonomyItems.length.toLocaleString()}개 | 전체 {items.length.toLocaleString()}개
            </span>
          </div>
          <div className="review-metrics" aria-label="Review queue metrics">
            <div>
              <strong>{taxonomyItems.length.toLocaleString()}</strong>
              <span>taxonomy 후보</span>
            </div>
            <div>
              <strong>{otherItems.length.toLocaleString()}</strong>
              <span>크롤링 검토</span>
            </div>
            <div>
              <strong>{items.filter((item) => (item.confidence ?? 1) < 0.7).length.toLocaleString()}</strong>
              <span>0.7 미만</span>
            </div>
          </div>
        </section>

        {visibleItems.length === 0 ? (
          <StatusPanel title="열린 검토 항목이 없습니다" body="신규 카테고리 후보나 낮은 신뢰도 항목이 생기면 이곳에 모입니다." />
        ) : (
          <section className="review-list" aria-label="Open review items">
            {visibleItems.map((item) => (
              <article className="review-item" key={item.id}>
                <div className="review-item-main">
                  <div className="review-title-row">
                    <span className={item.entityType === "taxonomy_category" ? "review-kind taxonomy" : "review-kind"}>
                      {item.entityType === "taxonomy_category" ? <Tag size={14} /> : <AlertTriangle size={14} />}
                      {item.entityType === "taxonomy_category" ? "신규 분류 후보" : item.entityType}
                    </span>
                    <span className="review-confidence">confidence {confidenceLabel(item.confidence)}</span>
                  </div>
                  <h2>{item.suggestedLabels[0] ?? item.labName ?? item.professor ?? item.reason}</h2>
                  <p className="review-context">
                    {[item.school, item.department, item.professor, item.labName].filter(Boolean).join(" / ") || "맥락 정보 없음"}
                  </p>
                  {item.evidence && <p className="review-evidence">{item.evidence}</p>}
                  <div className="review-tags">
                    {item.suggestedLabels.map((label, index) => (
                      <span className="review-tag suggested" key={`suggested-${item.id}-${index}-${label}`}>{label}</span>
                    ))}
                    {item.rejectedLabels.map((label, index) => (
                      <span className="review-tag rejected" key={`rejected-${item.id}-${index}-${label}`}>{label}</span>
                    ))}
                  </div>
                </div>
                <aside className="review-action">
                  <strong>{item.reason}</strong>
                  <span>{item.suggestedAction ?? "수동 확인 후 처리"}</span>
                  {item.sourceUrl && (
                    <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                      {shortSource(item.sourceUrl)}
                      <ExternalLink size={13} />
                    </a>
                  )}
                </aside>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
