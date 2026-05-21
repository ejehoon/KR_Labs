import { ArrowLeft, Bookmark, Building2, FileText, FlaskConical, GraduationCap, Users } from "lucide-react";
import type { GraduateProgramRow, LabRow, RankingRow } from "../data";
import { getUniversityLogo } from "../lib/universityLogos";
import { LabCard } from "./LabCard";
import { SchoolProgramGroups } from "./SchoolProgramGroups";
import { StatusPanel } from "./StatusPanel";

type SchoolDetailPageProps = {
  schoolName: string;
  ranking?: RankingRow;
  programs: GraduateProgramRow[];
  labs: LabRow[];
  onBack: () => void;
};

function shortSchoolName(school: string) {
  return school.replace("Seoul National University", "SNU");
}

export function SchoolDetailPage({ schoolName, ranking, programs, labs, onBack }: SchoolDetailPageProps) {
  const logo = getUniversityLogo(schoolName);
  const totalPapers = ranking?.paperCount ?? labs.reduce((total, lab) => total + (lab.paperCount ?? 0), 0);
  const knownMembers = labs.reduce((total, lab) => total + (lab.memberCount ?? 0), 0);
  const hasPrograms = programs.length > 0;

  return (
    <main className="main-panel school-detail-main">
      <div className="school-detail-page">
        <button className="back-link" type="button" onClick={onBack}>
          <ArrowLeft size={16} />
          대학 목록으로 돌아가기
        </button>

        <section className="school-detail-hero" aria-label="학교 상세">
          <div className="school-detail-title-row">
            <span className="school-detail-logo">
              {logo.src ? <img src={logo.src} alt={logo.alt} loading="lazy" /> : <span>{logo.fallback}</span>}
            </span>
            <div>
              <p>KR_Labs 학교 데이터</p>
              <h1>{shortSchoolName(schoolName)}</h1>
              <span>
                {hasPrograms ? `학과/과정 ${programs.length.toLocaleString()}개` : "연구실 목록"} | 연구실 {labs.length.toLocaleString()}개 | 논문{" "}
                {totalPapers.toLocaleString()}편
              </span>
            </div>
          </div>

          <button className="school-detail-save" type="button">
            <Bookmark size={16} />
            저장
          </button>
        </section>

        <section className="school-detail-metrics" aria-label="학교 지표">
          <div>
            <Building2 size={18} />
            <strong>{programs.length.toLocaleString()}</strong>
            <span>학과/과정</span>
          </div>
          <div>
            <FlaskConical size={18} />
            <strong>{labs.length.toLocaleString()}</strong>
            <span>연구실/교수</span>
          </div>
          <div>
            <FileText size={18} />
            <strong>{totalPapers.toLocaleString()}</strong>
            <span>논문</span>
          </div>
          <div>
            <Users size={18} />
            <strong>{knownMembers.toLocaleString()}</strong>
            <span>확인된 연구원</span>
          </div>
        </section>

        <div className="size-pills school-detail-size-pills">
          <span className="size-pill small">소형: 7명 이하</span>
          <span className="size-pill medium">중형: 8-19명</span>
          <span className="size-pill large">대형: 20명 이상</span>
        </div>

        <section className="school-detail-section" aria-label={hasPrograms ? "학과와 연구실" : "연구실 목록"}>
          <div className="school-detail-section-heading">
            <div>
              <p>{hasPrograms ? "학과/과정" : "연구실"}</p>
              <h2>{hasPrograms ? "수집된 학과별 연구실" : "수집된 연구실"}</h2>
            </div>
            <span>
              <GraduationCap size={15} />
              {labs.length.toLocaleString()}개 항목
            </span>
          </div>

          {labs.length === 0 ? (
            <StatusPanel title="표시할 연구실이 없습니다" body="아직 이 학교의 연구실 데이터가 수집되지 않았습니다." />
          ) : hasPrograms ? (
            <SchoolProgramGroups programs={programs} labs={labs} visibleLabs={labs} />
          ) : (
            <div className="cards-list school-detail-labs">
              {labs.map((lab, index) => (
                <LabCard key={lab.id ?? `${lab.name}-${lab.homepageUrl ?? index}`} lab={lab} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
