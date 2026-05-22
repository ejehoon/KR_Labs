import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { HomePage } from "./components/HomePage";
import { LabCard } from "./components/LabCard";
import { MainSidebar, type MainSidebarItem } from "./components/MainSidebar";
import { MajorExplorerPage } from "./components/MajorExplorerPage";
import { ReviewQueuePage } from "./components/ReviewQueuePage";
import { SchoolDetailPage } from "./components/SchoolDetailPage";
import { SchoolRankingPage } from "./components/SchoolRankingPage";
import { SiteHeader } from "./components/SiteHeader";
import { StatusPanel } from "./components/StatusPanel";
import { UniversityList } from "./components/UniversityList";
import { loadDashboardData } from "./data";
import { buildRankingRowsFromLabs, filterLabs, searchLabsByKeyword, uniqueLabRows } from "./lib/dashboardFilters";
import {
  BIO_MEDICAL_TAXONOMY,
  CS_TAXONOMY,
  ENGINEERING_TAXONOMY,
  HUMANITIES_ARTS_TAXONOMY,
  NATURAL_SCIENCE_TAXONOMY,
  SOCIAL_BUSINESS_TAXONOMY,
} from "./taxonomy";
import type { DataState, DetailMode, HomeSearchMode, MainView } from "./types/view";

const RESEARCH_TAXONOMIES = [
  CS_TAXONOMY,
  ENGINEERING_TAXONOMY,
  NATURAL_SCIENCE_TAXONOMY,
  BIO_MEDICAL_TAXONOMY,
  SOCIAL_BUSINESS_TAXONOMY,
  HUMANITIES_ARTS_TAXONOMY,
];

export function App() {
  const [state, setState] = useState<DataState>({ status: "loading" });
  const [view, setView] = useState<MainView>("home");
  const [detailMode, setDetailMode] = useState<DetailMode>("field");
  const [homeSearchMode, setHomeSearchMode] = useState<HomeSearchMode>("keyword");
  const [mainSidebarActive, setMainSidebarActive] = useState<MainSidebarItem>("home");
  const [aiNotice, setAiNotice] = useState<string | undefined>();
  const [selectedSchool, setSelectedSchool] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await loadDashboardData();
      setState({ status: "ready", data });
    } catch (error) {
      setState({ status: "error", error: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (state.status === "ready" && !selectedSchool) {
      setSelectedSchool(state.data.rankingRows[0]?.school);
    }
  }, [selectedSchool, state]);

  const filteredLabsForAllSchools = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }

    return filterLabs({
      labs: state.data.labs,
      query,
      selectedAreaIds: selectedAreas,
      taxonomies: RESEARCH_TAXONOMIES,
    });
  }, [query, selectedAreas, state]);
  const schoolRankingRows = useMemo(
    () =>
      state.status === "ready"
        ? [...state.data.rankingRows].sort((a, b) => b.paperCount - a.paperCount || b.labs - a.labs || a.school.localeCompare(b.school))
        : [],
    [state],
  );
  const allSchoolLabs = useMemo(
    () => (state.status === "ready" && selectedSchool ? state.data.labs.filter((lab) => lab.school === selectedSchool) : []),
    [selectedSchool, state],
  );
  const uniqueAllSchoolLabs = useMemo(() => uniqueLabRows(allSchoolLabs), [allSchoolLabs]);
  const schoolPrograms = useMemo(
    () => (state.status === "ready" && selectedSchool ? state.data.programs.filter((program) => program.school === selectedSchool) : []),
    [selectedSchool, state],
  );

  const activeData = state.status === "ready" ? state.data : undefined;
  const allLabs = useMemo(() => (activeData ? uniqueLabRows(activeData.labs) : []), [activeData]);
  const keywordSearchLabs = useMemo(
    () => (state.status === "ready" ? searchLabsByKeyword(state.data.labs, query) : []),
    [query, state],
  );
  const keywordSearchSchools = useMemo(() => buildRankingRowsFromLabs(keywordSearchLabs), [keywordSearchLabs]);
  const featuredLabs = useMemo(
    () =>
      allLabs
        .filter((lab) => typeof lab.memberCount === "number")
        .sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0) || (b.paperCount ?? 0) - (a.paperCount ?? 0))
        .slice(0, 6),
    [allLabs],
  );
  const knownMemberTotal = useMemo(() => allLabs.reduce((total, lab) => total + (lab.memberCount ?? 0), 0), [allLabs]);
  const fallbackRanking = activeData?.rankingRows.find((row) => row.school === selectedSchool) ?? activeData?.rankingRows[0];
  const overviewLabs = useMemo(() => uniqueLabRows(filteredLabsForAllSchools), [filteredLabsForAllSchools]);
  const schoolName = selectedSchool ?? fallbackRanking?.school ?? "KR Labs";
  const submitHomeSearch = () => {
    if (!query.trim()) {
      return;
    }
    setAiNotice(
      homeSearchMode === "ai" ? "AI 검색은 RAG 연결 전까지 같은 문장을 키워드 검색으로 먼저 보여드립니다." : undefined,
    );
    setView("search");
  };
  const openSchoolDetail = (school: string) => {
    setMainSidebarActive("school");
    setSelectedSchool(school);
    setDetailMode("school");
    setView("detail");
  };

  const navigateHomeFromMainSidebar = () => {
    setMainSidebarActive("home");
    setAiNotice(undefined);
    setView("home");
  };

  const navigateSchoolsFromMainSidebar = () => {
    setMainSidebarActive("school");
    setDetailMode("school");
    setView("list");
  };

  const navigateMajorsFromMainSidebar = () => {
    setMainSidebarActive("major");
    setDetailMode("field");
    setView("list");
  };

  const navigateReviewFromMainSidebar = () => {
    setMainSidebarActive("review");
    setView("review");
  };

  const navigateAiFromMainSidebar = () => {
    setMainSidebarActive("ai");
    setHomeSearchMode("ai");
    setAiNotice("학교추천AI는 RAG 연결 전까지 입력 문장을 키워드 검색으로 먼저 보여드립니다.");
    setView("home");
  };

  const navigateBookmarksFromMainSidebar = () => {
    setMainSidebarActive("bookmark");
    setAiNotice("북마크 저장 기능은 준비 중입니다. 곧 관심 학교와 연구실을 모아볼 수 있게 연결할 예정입니다.");
    setView("home");
  };

  const renderMainSidebar = () => (
    <MainSidebar
      activeItem={mainSidebarActive}
      bookmarkCount={0}
      onNavigateHome={navigateHomeFromMainSidebar}
      onNavigateSchools={navigateSchoolsFromMainSidebar}
      onNavigateMajors={navigateMajorsFromMainSidebar}
      onNavigateReview={navigateReviewFromMainSidebar}
      onNavigateAi={navigateAiFromMainSidebar}
      onNavigateBookmarks={navigateBookmarksFromMainSidebar}
    />
  );

  const renderSearchResults = () => (
    <main className="main-panel search-main-panel">
      <div className="main-content main-content-wide">
        <button
          className="back-link"
          type="button"
          onClick={() => {
            setMainSidebarActive("home");
            setView("home");
          }}
        >
          <ArrowLeft size={16} />
          메인으로 돌아가기
        </button>
        <section className="search-results-header">
          <div className="list-heading">
            <div>
              <p>{homeSearchMode === "ai" ? "AI 검색 결과" : "키워드 검색 결과"}</p>
              <h1>{query.trim()}</h1>
            </div>
            <span>
              {keywordSearchSchools.length.toLocaleString()}개 대학 | {keywordSearchLabs.length.toLocaleString()}개 연구실
            </span>
          </div>
          {aiNotice && <StatusPanel title="AI 검색 준비 중" body={aiNotice} />}
        </section>
        <section className="search-results-layout" aria-label="Search results">
          <UniversityList rows={keywordSearchSchools} selectedSchools={[]} onSelect={(row) => openSchoolDetail(row.school)} />
          <section className="overview-labs search-results-labs" aria-label="Keyword search labs">
            <div className="cards-list">
              {keywordSearchLabs.length === 0 ? (
                <StatusPanel title="검색 결과가 없습니다" body="다른 교수명, 학교명, 연구 분야로 검색해보세요." />
              ) : (
                keywordSearchLabs.map((lab, index) => <LabCard key={lab.id ?? `${lab.name}-${lab.homepageUrl ?? index}`} lab={lab} />)
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );

  const renderSectionStatus = (title: string, body: string, tone?: "error") => (
    <main className="main-panel">
      <div className="main-content main-content-wide">
        <StatusPanel title={title} body={body} tone={tone} />
      </div>
    </main>
  );

  if (view === "home") {
    return (
      <div className="page page-with-main-sidebar home-page-with-sidebar">
        {renderMainSidebar()}
        {state.status === "loading" && (
          <main className="home-main">
            <StatusPanel title="데이터를 불러오는 중" body="크롤링 리포트를 확인하고 있습니다." />
          </main>
        )}
        {state.status === "error" && (
          <main className="home-main">
            <StatusPanel title="데이터를 불러오지 못했습니다" body={state.error} tone="error" />
          </main>
        )}
        {state.status === "ready" && (
          <HomePage
            mode={homeSearchMode}
            query={query}
            labCount={allLabs.length}
            schoolCount={state.data.rankingRows.length}
            memberCount={knownMemberTotal}
            featuredLabs={featuredLabs}
            featuredSchools={state.data.rankingRows.slice(0, 6)}
            aiNotice={aiNotice}
            onModeChange={(mode) => {
              setHomeSearchMode(mode);
              setMainSidebarActive(mode === "ai" ? "ai" : "home");
              setAiNotice(undefined);
            }}
            onQueryChange={setQuery}
            onSubmit={submitHomeSearch}
            onSelectSchool={openSchoolDetail}
          />
        )}
      </div>
    );
  }

  if (view === "search") {
    return (
      <div className="page page-with-main-sidebar">
        {renderMainSidebar()}
        <SiteHeader
          onNavigateHome={() => {
            setMainSidebarActive("home");
            setView("home");
          }}
          onNavigateSchools={() => {
            setMainSidebarActive("school");
            setDetailMode("school");
            setView("list");
          }}
        />
        {state.status === "ready" ? renderSearchResults() : (
          <main className="home-main">
            {state.status === "loading" ? (
              <StatusPanel title="데이터를 불러오는 중" body="크롤링 리포트를 확인하고 있습니다." />
            ) : (
              <StatusPanel title="데이터를 불러오지 못했습니다" body={state.error} tone="error" />
            )}
          </main>
        )}
      </div>
    );
  }

  if (view === "review") {
    return (
      <div className="page page-with-main-sidebar">
        {renderMainSidebar()}
        <SiteHeader
          onNavigateHome={() => {
            setMainSidebarActive("home");
            setView("home");
          }}
          onNavigateSchools={() => {
            setMainSidebarActive("school");
            setDetailMode("school");
            setView("list");
          }}
        />
        {state.status === "ready" ? (
          <ReviewQueuePage items={state.data.reviewItems} />
        ) : (
          <main className="home-main">
            {state.status === "loading" ? (
              <StatusPanel title="데이터를 불러오는 중" body="검토 큐를 확인하고 있습니다." />
            ) : (
              <StatusPanel title="검토 큐를 불러오지 못했습니다" body={state.error} tone="error" />
            )}
          </main>
        )}
      </div>
    );
  }

  return (
    <div className="page page-with-main-sidebar">
      {renderMainSidebar()}
      <SiteHeader
        onNavigateHome={() => {
          setMainSidebarActive("home");
          setDetailMode("field");
          setView("home");
        }}
        onNavigateSchools={() => {
          setMainSidebarActive("school");
          setDetailMode("school");
          setView("list");
        }}
      />

      {view === "list" && detailMode === "school" ? (
        state.status === "ready" ? (
          <SchoolRankingPage rows={schoolRankingRows} onSelectSchool={openSchoolDetail} />
        ) : state.status === "loading" ? (
          renderSectionStatus("데이터를 불러오는 중", "학교별 연구실 현황을 준비하고 있습니다.")
        ) : (
          renderSectionStatus("데이터를 불러오지 못했습니다", state.error, "error")
        )
      ) : view === "list" && detailMode === "field" ? (
        state.status === "ready" ? (
          <MajorExplorerPage
            taxonomies={RESEARCH_TAXONOMIES}
            selectedAreaIds={selectedAreas}
            labs={overviewLabs}
            onSelectedAreaIdsChange={setSelectedAreas}
          />
        ) : state.status === "loading" ? (
          <main className="main-panel major-main-panel">
            <div className="major-page">
              <StatusPanel title="데이터를 불러오는 중" body="학과 필터와 연구실 목록을 준비하고 있습니다." />
            </div>
          </main>
        ) : (
          <main className="main-panel major-main-panel">
            <div className="major-page">
              <StatusPanel title="데이터를 불러오지 못했습니다" body={state.error} tone="error" />
            </div>
          </main>
        )
      ) : view === "detail" && detailMode === "school" ? (
        state.status === "ready" ? (
          <SchoolDetailPage
            schoolName={schoolName}
            ranking={fallbackRanking}
            programs={schoolPrograms}
            labs={uniqueAllSchoolLabs}
            onBack={() => setView("list")}
          />
        ) : state.status === "loading" ? (
          renderSectionStatus("데이터를 불러오는 중", "학교 상세 정보를 준비하고 있습니다.")
        ) : (
          renderSectionStatus("데이터를 불러오지 못했습니다", state.error, "error")
        )
      ) : (
        renderSectionStatus("화면을 찾을 수 없습니다", "왼쪽 메뉴에서 다시 이동해보세요.")
      )}
    </div>
  );
}
