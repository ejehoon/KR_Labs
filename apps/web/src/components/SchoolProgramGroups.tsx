import { ExternalLink, Home } from "lucide-react";
import type { GraduateProgramRow, LabRow } from "../data";
import { getPrimaryLabUrl, getPrimaryLabUrlTitle } from "../lib/labLinks";

type SchoolProgramGroupsProps = {
  programs: GraduateProgramRow[];
  labs: LabRow[];
  visibleLabs: LabRow[];
};

export function SchoolProgramGroups({ programs, labs, visibleLabs }: SchoolProgramGroupsProps) {
  const labsByProgram = groupLabsByProgram(labs);
  const visibleLabsByProgram = groupLabsByProgram(visibleLabs);
  const groups = [...new Map(programs.map((program) => [program.series, programs.filter((item) => item.series === program.series)])).entries()];

  return (
    <section className="program-groups" aria-label="Graduate programs">
      {groups.map(([series, seriesPrograms]) => (
        <section className="program-series" key={series}>
          <div className="series-heading">
            <h2>{series}</h2>
            <span>{seriesPrograms.length.toLocaleString()}개 학과/과정</span>
          </div>

          <div className="program-list">
            {seriesPrograms.map((program) => {
              const programLabs = labsByProgram.get(program.name) ?? [];
              const visibleProgramLabs = visibleLabsByProgram.get(program.name) ?? [];

              return (
                <article className="program-block" key={`${program.series}-${program.name}`}>
                  <div className="program-head">
                    <div>
                      <h3>{program.name}</h3>
                      <p>
                        교수/연구실 {programLabs.length.toLocaleString()}명
                        {visibleProgramLabs.length !== programLabs.length && programLabs.length > 0
                          ? ` | 현재 필터 ${visibleProgramLabs.length.toLocaleString()}명`
                          : ""}
                      </p>
                    </div>
                    {program.homepageUrl && (
                      <a className="program-link" href={program.homepageUrl} target="_blank" rel="noreferrer" title="학과 페이지">
                        <Home size={15} />
                        학과
                      </a>
                    )}
                  </div>

                  {programLabs.length === 0 ? (
                    <div className="program-empty">
                      <span>교수 목록 수집 전</span>
                      {program.homepageUrl && (
                        <a href={program.homepageUrl} target="_blank" rel="noreferrer">
                          학과 페이지 열기
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="faculty-list">
                      {programLabs.map((lab) => {
                        const primaryUrl = getPrimaryLabUrl(lab);
                        const content = (
                          <>
                            <span className="faculty-name">{lab.name}</span>
                            <span className="faculty-field">
                              {formatFieldLabels(lab)}
                            </span>
                            {primaryUrl && <ExternalLink size={12} />}
                          </>
                        );

                        return primaryUrl ? (
                          <a
                            className="faculty-row"
                            href={primaryUrl}
                            target="_blank"
                            rel="noreferrer"
                            title={getPrimaryLabUrlTitle(lab)}
                            key={lab.id ?? lab.name}
                          >
                            {content}
                          </a>
                        ) : (
                          <div className="faculty-row" key={lab.id ?? lab.name}>
                            {content}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}

function formatFieldLabels(lab: LabRow): string {
  if (lab.keywords.length > 0) {
    return lab.keywords.slice(0, 4).join(", ");
  }
  return "분류 검토 필요";
}

function groupLabsByProgram(labs: LabRow[]): Map<string, LabRow[]> {
  const grouped = new Map<string, LabRow[]>();
  for (const lab of labs) {
    const key = lab.programName ?? lab.department ?? "기타";
    grouped.set(key, [...(grouped.get(key) ?? []), lab]);
  }
  return grouped;
}
