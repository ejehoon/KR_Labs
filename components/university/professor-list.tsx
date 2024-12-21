import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { University, Professor, LabSize } from '@/lib/types';
import { calculateLabSize, LAB_SIZE_CRITERIA } from '@/lib/utils';

type ProfessorListProps = {
  university: University;
  onBack: () => void;
  selectedSubField: string;
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

export default function ProfessorList({ university, onBack, selectedSubField }: ProfessorListProps) {
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
        전체 논문 수: {university.paperCount} | 연구실: {university.labCount}개
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
        {university.professors.map((professor) => {
          const labSize = calculateLabSize(professor.labMemberCount);
          const relevantFields = professor.researchFields
            .filter(field => field.subFields.includes(selectedSubField))
            .map(field => field.field)
            .join(', ');

          return (
            <div
              key={professor.id}
              className="p-4 rounded-lg border hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{professor.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    논문 수: {professor.paperCount} | 연구원: {professor.labMemberCount}명
                  </p>
                  <p className="text-sm text-muted-foreground">
                    연구 분야: {relevantFields}
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