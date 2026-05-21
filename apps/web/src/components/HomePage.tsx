import { ArrowUp, Search, Sparkles } from "lucide-react";
import type { FormEvent } from "react";
import type { LabRow, RankingRow } from "../data";
import { getUniversityLogo } from "../lib/universityLogos";
import type { HomeSearchMode } from "../types/view";
import { LabCard } from "./LabCard";
import { StatusPanel } from "./StatusPanel";

type HomePageProps = {
  mode: HomeSearchMode;
  query: string;
  labCount: number;
  schoolCount: number;
  memberCount: number;
  featuredLabs: LabRow[];
  featuredSchools: RankingRow[];
  aiNotice?: string;
  onModeChange: (mode: HomeSearchMode) => void;
  onQueryChange: (query: string) => void;
  onSubmit: () => void;
  onSelectSchool: (school: string) => void;
};

export function HomePage({
  mode,
  query,
  labCount,
  schoolCount,
  memberCount,
  featuredLabs,
  featuredSchools,
  aiNotice,
  onModeChange,
  onQueryChange,
  onSubmit,
  onSelectSchool,
}: HomePageProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <main className="home-main">
      <section className="home-hero" aria-label="KR Labs search">
        <form className="home-search" onSubmit={submit}>
          <strong className="home-brand">KR_Labs</strong>
          <div className="search-mode-tabs" role="tablist" aria-label="검색 모드">
            <button
              className={mode === "keyword" ? "search-mode active" : "search-mode"}
              type="button"
              onClick={() => onModeChange("keyword")}
            >
              <Search size={15} />
              연구실 검색
            </button>
            <button className={mode === "ai" ? "search-mode active" : "search-mode"} type="button" onClick={() => onModeChange("ai")}>
              <Sparkles size={15} />
              AI 검색
            </button>
          </div>
          <h1>한국 대학 연구실을 한곳에서 찾아보세요</h1>
          <div className="home-search-box">
            <textarea
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={mode === "keyword" ? "교수님 이름, 연구실, 학교, 연구 분야를 검색하세요" : "예: 멀티모달 LLM을 연구하는 연구실을 찾아줘"}
              rows={3}
            />
            <button className="search-submit" type="submit" title="검색">
              <ArrowUp size={18} />
            </button>
          </div>
          {aiNotice && <p className="ai-notice">{aiNotice}</p>}
          <div className="hero-suggestions" aria-label="추천 검색어">
            {["컴퓨터 비전", "바이오인포매틱스", "반도체", "국어국문학"].map((item) => (
              <button key={item} type="button" onClick={() => onQueryChange(item)}>
                {item}
              </button>
            ))}
          </div>
        </form>
      </section>

      <section className="home-stats" aria-label="KR Labs 데이터 현황">
        <div>
          <strong>{schoolCount.toLocaleString()}</strong>
          <span>대학</span>
        </div>
        <div>
          <strong>{labCount.toLocaleString()}</strong>
          <span>연구실/교수</span>
        </div>
        <div>
          <strong>{memberCount.toLocaleString()}</strong>
          <span>확인된 연구원</span>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-heading">
          <h2>대학별 현황</h2>
          <span>크롤링 데이터 기준</span>
        </div>
        <div className="home-school-grid">
          {featuredSchools.map((school) => {
            const logo = getUniversityLogo(school.school);
            return (
              <button className="home-school-card" key={school.school} type="button" onClick={() => onSelectSchool(school.school)}>
                <span className="home-school-logo">
                  {logo.src ? <img src={logo.src} alt={logo.alt} loading="lazy" /> : <span>{logo.fallback}</span>}
                </span>
                <span>
                  <strong>{school.school}</strong>
                  <small>
                    연구실 {school.labs.toLocaleString()}개 | 논문 {school.paperCount.toLocaleString()}편
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-heading">
          <h2>바로 살펴볼 연구실</h2>
          <span>연구원 수와 데이터가 확인된 항목</span>
        </div>
        <div className="home-lab-list">
          {featuredLabs.length > 0 ? (
            featuredLabs.map((lab, index) => <LabCard key={lab.id ?? `${lab.school}-${lab.name}-${index}`} lab={lab} />)
          ) : (
            <StatusPanel title="표시할 연구실이 없습니다" body="크롤링 데이터가 준비되면 이 영역에 연구실이 표시됩니다." />
          )}
        </div>
      </section>
    </main>
  );
}
