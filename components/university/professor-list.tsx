import React from 'react';
import { ArrowLeft, Home, BookOpen, Database } from 'lucide-react';
import { University, LabSize, ResearchField, SelectedSubFields } from '@/lib/types';
import { calculateLabSize, LAB_SIZE_CRITERIA } from '@/lib/utils';

type ProfessorListProps = {
  university: University;
  onBack: () => void;
  selectedSubFields: SelectedSubFields;
  enabledFields: ResearchField[];
};

const getLabSizeLabel = (size: LabSize | 'unknown'): string => {
  switch (size) {
    case 'large':
      return '대형';
    case 'medium':
      return '중형';
    case 'small':
      return '소형';
    case 'unknown':
      return '알 수 없음';
  }
};

const getLabSizeColor = (size: LabSize | 'unknown'): string => {
  switch (size) {
    case 'large':
      return 'bg-indigo-100 text-indigo-700';
    case 'medium':
      return 'bg-emerald-100 text-emerald-700';
    case 'small':
      return 'bg-amber-100 text-amber-700';
    case 'unknown':
      return 'bg-slate-100 text-slate-600';
  }
};

const getLabSizeText = (labSize: LabSize) => {
  if (labSize === 'unknown') return '알 수 없음';
  return `${labSize === 'large' ? '대형' : labSize === 'medium' ? '중형' : '소형'} 연구실`;
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

  const totalPapers = filteredProfessors.reduce((sum, prof) => sum + (prof.paperCount || 0), 0);
  const totalLabCount = filteredProfessors.length;

  return (
    <div className="p-4">
      <div className="w-[550px]">
        <button
          onClick={onBack}
          className="flex items-center text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          대학 목록으로 돌아가기
        </button>

        <h2 className="text-lg font-bold mb-2">
          {university.name}
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          총 논문 수: {totalPapers} | 연구실: {totalLabCount}개
        </p>

        <div className="flex gap-2 mb-4">
          {[
            ['small', LAB_SIZE_CRITERIA.small],
            ['medium', LAB_SIZE_CRITERIA.medium],
            ['large', LAB_SIZE_CRITERIA.large]
          ].map(([size, criteria]) => (
            <div
              key={size}
              className={`text-xs px-2 py-1 rounded-full ${getLabSizeColor(size as LabSize)}`}
            >
              {getLabSizeLabel(size as LabSize)}: {criteria}
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {filteredProfessors.map((professor) => {
            const labSize = professor.labMemberCount != null 
              ? calculateLabSize(professor.labMemberCount)
              : 'unknown';

            return (
              <div
                key={professor.id}
                className="w-full bg-white p-4 border rounded-md"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{professor.name}</h3>
                      <div className="flex gap-2">
                        {professor.labUrl && (
                          <a
                            href={professor.labUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                            title="연구실 홈페이지"
                          >
                            <Home className="h-4 w-4" />
                          </a>
                        )}
                        {professor.scholarUrl && (
                          <a
                            href={professor.scholarUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                            title="Google Scholar"
                          >
                            <BookOpen className="h-4 w-4" />
                          </a>
                        )}
                        {professor.dblpUrl && (
                          <a
                            href={professor.dblpUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                            title="DBLP"
                          >
                            <Database className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {professor.department} | 논문 {professor.paperCount}편 | 
                      연구원 {professor.labMemberCount != null ? `${professor.labMemberCount}명` : '알 수 없음'}
                    </p>
                    <p className="text-sm text-gray-500">
                      연구 분야: {professor.researchFields
                        .flatMap(field => field.subFields)
                        .join(', ')}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm ${getLabSizeColor(labSize)}`}>
                    {getLabSizeText(labSize)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
} 