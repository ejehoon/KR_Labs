import React from 'react';
import { ArrowLeft, Home, BookOpen } from 'lucide-react';
import { University, Professor, LabSize, ResearchField, SelectedSubFields } from '@/lib/types';
import { calculateLabSize, LAB_SIZE_CRITERIA } from '@/lib/utils';

type ProfessorListProps = {
  university: University;
  onBack: () => void;
  selectedSubFields: SelectedSubFields;
  enabledFields: ResearchField[];
};

const getLabSizeLabel = (size: LabSize): string => {
  switch (size) {
    case 'large':
      return '대형';
    case 'medium':
      return '중형';
    case 'small':
      return '소형';
  }
};

const getLabSizeColor = (size: LabSize): string => {
  switch (size) {
    case 'large':
      return 'text-blue-600 bg-blue-50';
    case 'medium':
      return 'text-green-600 bg-green-50';
    case 'small':
      return 'text-orange-600 bg-orange-50';
  }
};

export default function ProfessorList({ university, onBack, selectedSubFields, enabledFields }: ProfessorListProps) {
  const filteredProfessors = university.professors.filter(professor => {
    const matchesEnabledField = enabledFields.length > 0 && professor.researchFields.some(
      researchField => enabledFields.some(
        enabledField => enabledField.name === researchField.field
      )
    );

    const matchesSelectedSubFields = Object.entries(selectedSubFields).some(([fieldName, subFields]) =>
      professor.researchFields.some(
        researchField =>
          researchField.field === fieldName &&
          researchField.subFields.some(sf => subFields.includes(sf))
      )
    );

    return matchesEnabledField || matchesSelectedSubFields;
  });

  const totalCitations = filteredProfessors.reduce((sum, prof) => sum + prof.citationsSince2019, 0);
  const totalLabCount = filteredProfessors.length;

  return (
    <div className="p-6">
      <button
        onClick={onBack}
        className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        대학 목록으로 돌아가기
      </button>

      <h2 className="text-xl font-semibold mb-2">
        {university.name}
      </h2>
      <p className="text-sm text-muted-foreground mb-2">
        2019년 이후 총 인용 수: {totalCitations} | 연구실: {totalLabCount}개
      </p>
      <div className="flex gap-2 mb-6">
        {(Object.entries(LAB_SIZE_CRITERIA) as [LabSize, string][]).map(([size, criteria]) => (
          <div
            key={size}
            className={`text-xs px-2 py-1 rounded-full ${getLabSizeColor(size as LabSize)}`}
          >
            {getLabSizeLabel(size as LabSize)}: {criteria}
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {filteredProfessors.map((professor) => {
          const labSize = calculateLabSize(professor.labMemberCount);
          
          const allSubFields = professor.researchFields
            .flatMap(field => field.subFields)
            .filter((value, index, self) => self.indexOf(value) === index)
            .join(', ');

          return (
            <div
              key={professor.id}
              className="p-4 rounded-lg border hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    {professor.labUrl ? (
                      <a
                        href={professor.labUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:text-blue-600 transition-colors group flex items-center gap-2"
                        title="연구실 홈페이지 방문"
                      >
                        <h3>{professor.name}</h3>
                        <Home className="h-4 w-4 text-muted-foreground group-hover:text-blue-600" />
                      </a>
                    ) : (
                      <h3 className="font-medium">{professor.name}</h3>
                    )}
                    {professor.scholarUrl && (
                      <a
                        href={professor.scholarUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-blue-600 transition-colors"
                        title="구글 스칼라 프로필 방문"
                      >
                        <BookOpen className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {professor.department} | 2019년 이후 인용 수: {professor.citationsSince2019} | 연구원: {professor.labMemberCount}명
                  </p>
                  <p className="text-sm text-muted-foreground">
                    연구 분야: {allSubFields}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm ${getLabSizeColor(labSize)}`}>
                  {getLabSizeLabel(labSize)} 연구실
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
} 