import { MapPin } from "lucide-react";
import type { RankingRow } from "../data";
import { getUniversityLogo } from "../lib/universityLogos";

type UniversityListProps = {
  rows: RankingRow[];
  selectedSchools?: string[];
  showAllOption?: boolean;
  onSelect: (row: RankingRow) => void;
  onSelectAll?: () => void;
};

export function UniversityList({ rows, selectedSchools = [], showAllOption = false, onSelect, onSelectAll }: UniversityListProps) {
  const allSelected = rows.length > 0 && selectedSchools.length === 0;

  return (
    <section className="university-list">
      <div className="list-heading">
        <div>
          <p>학교별</p>
          <h1>대학 목록</h1>
        </div>
        {showAllOption && (
          <button className={allSelected ? "state-pill on" : "state-pill"} type="button" onClick={onSelectAll} title="전체 대학 선택">
            {allSelected ? "ON" : "OFF"}
          </button>
        )}
      </div>
      <div className="university-cards">
        {rows.length === 0 && (
          <div className="status-panel">
            <div>
              <h2>표시할 대학이 없습니다</h2>
              <p>검색어를 바꾸거나 학과 필터를 다시 선택해보세요.</p>
            </div>
          </div>
        )}
        {rows.map((row, index) => {
          const logo = getUniversityLogo(row.school);

          return (
            <button
              className={selectedSchools.includes(row.school) ? "university-card selected" : "university-card"}
              type="button"
              key={row.school}
              onClick={() => onSelect(row)}
            >
              <span className="university-logo">
                {logo.src ? <img src={logo.src} alt={logo.alt} loading="lazy" /> : <span>{logo.fallback}</span>}
              </span>
              <div className="university-card-body">
                <span className="rank-number">#{index + 1}</span>
                <h2>{row.school.replace("Seoul National University", "SNU")}</h2>
                <p>
                  총 논문 수: {row.paperCount.toLocaleString()}편 | 연구실: {row.labs.toLocaleString()}개
                </p>
              </div>
              <span className="university-meta">
                <MapPin size={15} />
                KR
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
