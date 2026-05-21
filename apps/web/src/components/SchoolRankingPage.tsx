import { Bookmark, ChevronDown, FlaskConical, MapPin, Star } from "lucide-react";
import type { RankingRow } from "../data";
import { getUniversityLogo } from "../lib/universityLogos";

type SchoolRankingPageProps = {
  rows: RankingRow[];
  onSelectSchool: (school: string) => void;
};

function shortSchoolName(school: string) {
  return school.replace("Seoul National University", "SNU");
}

export function SchoolRankingPage({ rows, onSelectSchool }: SchoolRankingPageProps) {
  const topRows = rows.slice(0, 10);

  return (
    <main className="main-panel school-ranking-main">
      <div className="school-ranking-page">
        <section className="school-ranking-list" aria-label="학교 순위">
          <div className="school-ranking-heading">
            <div>
              <p>KR_Labs 학교 데이터</p>
              <h1>
                학교 <span>{rows.length.toLocaleString()}개</span>
              </h1>
            </div>
            <div className="school-ranking-actions" aria-label="빠른 필터">
              <button type="button">
                <FlaskConical size={14} />
                연구실 많은 학교
              </button>
              <button type="button">
                <Star size={14} />
                논문 수 높은 학교
              </button>
            </div>
          </div>

          <div className="school-ranking-table" role="table" aria-label="학교 랭킹 테이블">
            <div className="school-ranking-row school-ranking-header" role="row">
              <span role="columnheader" aria-label="저장" />
              <span role="columnheader">학교</span>
              <button type="button" role="columnheader">
                구분
                <ChevronDown size={13} />
              </button>
              <button type="button" role="columnheader">
                지역
                <ChevronDown size={13} />
              </button>
              <span role="columnheader">연구실</span>
              <span role="columnheader">교수</span>
              <span role="columnheader">논문</span>
            </div>

            {rows.length === 0 ? (
              <div className="status-panel">
                <div>
                  <h2>표시할 학교가 없습니다</h2>
                  <p>데이터를 다시 불러오거나 필터를 조정해보세요.</p>
                </div>
              </div>
            ) : (
              rows.map((row, index) => {
                const logo = getUniversityLogo(row.school);
                const memberLabel = row.memberCount === null ? "연구원 수 확인 중" : `${row.memberCount.toLocaleString()}명 확인`;

                return (
                  <button className="school-ranking-row" role="row" type="button" key={row.school} onClick={() => onSelectSchool(row.school)}>
                    <span className="school-ranking-save" role="cell">
                      <Bookmark size={17} />
                    </span>
                    <span className="school-ranking-school" role="cell">
                      <span className="school-ranking-rank">{index + 1}</span>
                      <span className="school-ranking-logo">
                        {logo.src ? <img src={logo.src} alt={logo.alt} loading="lazy" /> : <span>{logo.fallback}</span>}
                      </span>
                      <span>
                        <strong>{shortSchoolName(row.school)}</strong>
                        <small>{memberLabel}</small>
                      </span>
                    </span>
                    <span className="school-ranking-tag" role="cell">
                      대학원
                    </span>
                    <span className="school-ranking-tag" role="cell">
                      <MapPin size={12} />
                      KR
                    </span>
                    <span role="cell">{row.labs.toLocaleString()}개</span>
                    <span role="cell">{row.professors.toLocaleString()}명</span>
                    <span className="school-ranking-link" role="cell">
                      {row.paperCount.toLocaleString()}편
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <aside className="popular-schools-panel" aria-label="실시간 인기 학교 TOP 10">
          <h2>실시간 인기 학교 TOP 10</h2>
          <div className="popular-schools-list">
            {topRows.map((row, index) => {
              const logo = getUniversityLogo(row.school);

              return (
                <button type="button" key={row.school} onClick={() => onSelectSchool(row.school)}>
                  <span className="popular-rank">{index + 1}</span>
                  <span className="popular-logo">
                    {logo.src ? <img src={logo.src} alt={logo.alt} loading="lazy" /> : <span>{logo.fallback}</span>}
                  </span>
                  <span>
                    <strong>{shortSchoolName(row.school)}</strong>
                    <small>연구실 {row.labs.toLocaleString()}개</small>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </main>
  );
}
