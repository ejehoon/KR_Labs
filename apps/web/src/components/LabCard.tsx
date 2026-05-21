import { BookOpen, Bookmark, Database, ExternalLink, Home } from "lucide-react";
import type { LabRow } from "../data";
import { getPrimaryLabUrl, getPrimaryLabUrlLabel, getPrimaryLabUrlTitle } from "../lib/labLinks";
import { getUniversityLogo } from "../lib/universityLogos";

export function LabCard({ lab }: { lab: LabRow }) {
  const memberText = lab.memberCount === null ? "알 수 없음" : `${lab.memberCount}명`;
  const paperEstimate = lab.paperCount ?? Math.max(0, Math.round(lab.confidence * 100));
  const fieldText = lab.keywords.length > 0 ? lab.keywords.slice(0, 5).join(", ") : "분류 검토 필요";
  const primaryUrl = getPrimaryLabUrl(lab);
  const primaryUrlLabel = getPrimaryLabUrlLabel(lab);
  const primaryUrlTitle = getPrimaryLabUrlTitle(lab);
  const logo = getUniversityLogo(lab.school);

  return (
    <article className="lab-card">
      <span className="lab-school-logo">
        {logo.src ? <img src={logo.src} alt={logo.alt} loading="lazy" /> : <span>{logo.fallback}</span>}
      </span>
      <div className="card-main">
        <div className="card-title-row">
          <h2>{lab.name}</h2>
          <span className="mini-icons">
            {primaryUrl ? (
              <a href={primaryUrl} target="_blank" rel="noreferrer" title={primaryUrlTitle}>
                <Home size={16} />
              </a>
            ) : (
              <Home size={16} />
            )}
            {lab.scholarUrl ? (
              <a href={lab.scholarUrl} target="_blank" rel="noreferrer" title="Google Scholar">
                <BookOpen size={16} />
              </a>
            ) : (
              <BookOpen size={16} />
            )}
            {lab.dblpUrl ? (
              <a href={lab.dblpUrl} target="_blank" rel="noreferrer" title="DBLP">
                <Database size={16} />
              </a>
            ) : (
              <Database size={16} />
            )}
          </span>
        </div>
        <p>
          {lab.department ?? (lab.school.includes("SNU") || lab.school.includes("Seoul") ? "컴퓨터공학부" : "컴퓨터공학과")} | 논문{" "}
          {paperEstimate}편 | 연구원 {memberText}
        </p>
        <p>분류: {fieldText}</p>
      </div>
      <div className="card-side">
        <button className="bookmark-button" type="button" title="Bookmark">
          <Bookmark size={18} />
        </button>
        {primaryUrl ? (
          <a className="unknown-pill" href={primaryUrl} target="_blank" rel="noreferrer" title={primaryUrlTitle}>
            {primaryUrlLabel}
            <ExternalLink size={12} />
          </a>
        ) : (
          <span className="unknown-pill">{memberText}</span>
        )}
      </div>
    </article>
  );
}
