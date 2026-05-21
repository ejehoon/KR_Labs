import { BookOpenText, ChevronDown, ListFilter, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { LabRow } from "../data";
import type { ResearchTaxonomy } from "../taxonomy";
import { LabCard } from "./LabCard";
import { StatusPanel } from "./StatusPanel";

type MajorExplorerPageProps = {
  taxonomies: ResearchTaxonomy[];
  selectedAreaIds: string[];
  labs: LabRow[];
  onSelectedAreaIdsChange: (areaIds: string[]) => void;
};

const MAJOR_TAXONOMY_SLUGS = ["cs", "engineering", "natural-science"];

function areaKey(taxonomySlug: string, areaId: string) {
  return `${taxonomySlug}:${areaId}`;
}

function getTaxonomyAreaIds(taxonomy: ResearchTaxonomy) {
  return taxonomy.groups.flatMap((group) => group.areas.map((area) => areaKey(taxonomy.slug, area.id)));
}

function getSelectedLabels(taxonomies: ResearchTaxonomy[], selectedAreaIds: string[]) {
  const selected = new Set(selectedAreaIds);
  return taxonomies.flatMap((taxonomy) =>
    taxonomy.groups.flatMap((group) =>
      group.areas.flatMap((area) => (selected.has(areaKey(taxonomy.slug, area.id)) ? [area.label] : [])),
    ),
  );
}

export function MajorExplorerPage({ taxonomies, selectedAreaIds, labs, onSelectedAreaIdsChange }: MajorExplorerPageProps) {
  const majorTaxonomies = useMemo(
    () => [
      ...MAJOR_TAXONOMY_SLUGS.flatMap((slug) => taxonomies.find((taxonomy) => taxonomy.slug === slug) ?? []),
      ...taxonomies.filter((taxonomy) => !MAJOR_TAXONOMY_SLUGS.includes(taxonomy.slug)),
    ],
    [taxonomies],
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeSlug, setActiveSlug] = useState(majorTaxonomies[0]?.slug ?? "cs");
  const [activeGroupId, setActiveGroupId] = useState(majorTaxonomies[0]?.groups[0]?.id ?? "");
  const [draftAreaIds, setDraftAreaIds] = useState<string[]>(selectedAreaIds);

  const activeTaxonomy = majorTaxonomies.find((taxonomy) => taxonomy.slug === activeSlug) ?? majorTaxonomies[0];
  const activeGroup = activeTaxonomy?.groups.find((group) => group.id === activeGroupId) ?? activeTaxonomy?.groups[0];
  const selectedLabels = getSelectedLabels(majorTaxonomies, selectedAreaIds);
  const draftLabels = getSelectedLabels(majorTaxonomies, draftAreaIds);
  const draftSelected = new Set(draftAreaIds);
  const activeGroupAreaIds = activeTaxonomy && activeGroup ? activeGroup.areas.map((area) => areaKey(activeTaxonomy.slug, area.id)) : [];
  const activeGroupAllSelected = activeGroupAreaIds.length > 0 && activeGroupAreaIds.every((key) => draftSelected.has(key));

  useEffect(() => {
    if (!dialogOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [dialogOpen]);

  const openDialog = (taxonomy: ResearchTaxonomy) => {
    setActiveSlug(taxonomy.slug);
    setActiveGroupId(taxonomy.groups[0]?.id ?? "");
    setDraftAreaIds(selectedAreaIds);
    setDialogOpen(true);
  };

  const selectTaxonomy = (taxonomy: ResearchTaxonomy) => {
    setActiveSlug(taxonomy.slug);
    setActiveGroupId(taxonomy.groups[0]?.id ?? "");
  };

  const toggleDraftArea = (key: string) => {
    setDraftAreaIds((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  const toggleDraftGroup = () => {
    if (activeGroupAreaIds.length === 0) {
      return;
    }
    setDraftAreaIds((current) =>
      activeGroupAllSelected ? current.filter((key) => !activeGroupAreaIds.includes(key)) : [...new Set([...current, ...activeGroupAreaIds])],
    );
  };

  const resetFilters = () => {
    setDraftAreaIds([]);
    onSelectedAreaIdsChange([]);
  };

  const applyFilters = () => {
    onSelectedAreaIdsChange(draftAreaIds);
    setDialogOpen(false);
  };

  return (
    <main className="main-panel major-main-panel">
      <div className="major-page">
        <section className="major-hero" aria-label="학과 탐색">
          <p>KR_Labs 학과 탐색</p>
          <h1>관심 학과와 연구 분야별로 연구실을 찾아보세요</h1>
          <span>컴퓨터공학, 공학, 자연과학 중심으로 세부 학과를 조합해 볼 수 있습니다.</span>
        </section>

        <section className="major-layout" aria-label="학과 필터와 연구실 목록">
          <aside className="major-filter-panel" aria-label="학과 필터">
            <div className="major-filter-status">
              <strong>
                필터 <span>{selectedAreaIds.length > 0 ? "ON" : "OFF"}</span>
              </strong>
              <button type="button" aria-label="필터 초기화" onClick={resetFilters}>
                <RotateCcw size={14} />
              </button>
            </div>

            <div className="major-filter-list">
              {majorTaxonomies.map((taxonomy) => {
                const taxonomyAreaIds = getTaxonomyAreaIds(taxonomy);
                const selectedCount = taxonomyAreaIds.filter((key) => selectedAreaIds.includes(key)).length;

                return (
                  <button className="major-filter-row" type="button" key={taxonomy.slug} onClick={() => openDialog(taxonomy)}>
                    <span>
                      <strong>{taxonomy.label}</strong>
                      {selectedCount > 0 && <small>{selectedCount}개 선택</small>}
                    </span>
                    <span className="major-filter-plus">+</span>
                  </button>
                );
              })}
            </div>

            {selectedLabels.length > 0 && (
              <div className="major-selected-summary" aria-label="선택된 상세 학과">
                {selectedLabels.slice(0, 8).map((label) => (
                  <span key={label}>{label}</span>
                ))}
                {selectedLabels.length > 8 && <span>+{selectedLabels.length - 8}</span>}
              </div>
            )}
          </aside>

          <section className="major-results" aria-label="학과별 연구실">
            <div className="major-toolbar">
              <div>
                <p>해당 연구실</p>
                <h2>{labs.length.toLocaleString()}개</h2>
              </div>
              <div className="major-toolbar-actions">
                <button type="button" onClick={() => majorTaxonomies[0] && openDialog(majorTaxonomies[0])}>
                  <ListFilter size={14} />
                  필터
                </button>
                <button type="button">
                  추천순
                  <ChevronDown size={14} />
                </button>
              </div>
            </div>

            {labs.length === 0 ? (
              <StatusPanel title="표시할 연구실이 없습니다" body="컴퓨터공학, 공학, 자연과학 필터에서 상세 학과를 선택해보세요." />
            ) : (
              <div className="major-lab-grid">
                {labs.map((lab, index) => (
                  <LabCard key={lab.id ?? `${lab.school}-${lab.name}-${index}`} lab={lab} />
                ))}
              </div>
            )}
          </section>
        </section>
      </div>

      {dialogOpen && activeTaxonomy && activeGroup && (
        <div className="major-dialog-backdrop" role="presentation" onMouseDown={() => setDialogOpen(false)}>
          <section className="major-dialog" role="dialog" aria-modal="true" aria-labelledby="major-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="major-dialog-side">
              <h2 id="major-dialog-title">필터 선택</h2>
              {majorTaxonomies.map((taxonomy) => {
                const selectedCount = getTaxonomyAreaIds(taxonomy).filter((key) => draftSelected.has(key)).length;
                return (
                  <button
                    className={taxonomy.slug === activeTaxonomy.slug ? "active" : ""}
                    type="button"
                    key={taxonomy.slug}
                    onClick={() => selectTaxonomy(taxonomy)}
                  >
                    <span>{taxonomy.label}</span>
                    {selectedCount > 0 && <strong>{selectedCount}</strong>}
                  </button>
                );
              })}
            </div>

            <div className="major-dialog-groups">
              <div className="major-dialog-heading">
                <strong>{activeTaxonomy.label}</strong>
                <span>하나 이상 선택하세요</span>
              </div>
              {activeTaxonomy.groups.map((group) => {
                const selectedCount = group.areas.filter((area) => draftSelected.has(areaKey(activeTaxonomy.slug, area.id))).length;
                return (
                  <button
                    className={group.id === activeGroup.id ? "active" : ""}
                    type="button"
                    key={group.id}
                    onClick={() => setActiveGroupId(group.id)}
                  >
                    <span>{group.label}</span>
                    {selectedCount > 0 && <strong>{selectedCount}</strong>}
                  </button>
                );
              })}
            </div>

            <div className="major-dialog-detail">
              <button className="major-dialog-close" type="button" aria-label="닫기" onClick={() => setDialogOpen(false)}>
                <X size={19} />
              </button>
              <div className="major-dialog-detail-title">
                <span className="major-dialog-group-icon">
                  <BookOpenText size={23} />
                </span>
                <strong>{activeGroup.label}</strong>
              </div>
              <div className="major-dialog-chip-grid">
                <button className={activeGroupAllSelected ? "selected" : ""} type="button" onClick={toggleDraftGroup}>
                  전체
                </button>
                {activeGroup.areas.map((area) => {
                  const key = areaKey(activeTaxonomy.slug, area.id);
                  return (
                    <button className={draftSelected.has(key) ? "selected" : ""} type="button" key={key} onClick={() => toggleDraftArea(key)}>
                      {area.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <footer className="major-dialog-footer">
              <div className="major-dialog-selected-filters">
                {draftLabels.slice(0, 3).map((label) => (
                  <span key={label}>{label}</span>
                ))}
                {draftLabels.length > 3 && <span>+{draftLabels.length - 3}</span>}
              </div>
              <div className="major-dialog-actions">
                <button className="major-dialog-reset" type="button" onClick={() => setDraftAreaIds([])}>
                  <RotateCcw size={14} />
                  초기화
                </button>
                <button className="major-dialog-apply" type="button" onClick={applyFilters}>
                  {draftAreaIds.length.toLocaleString()}개 필터 적용
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
