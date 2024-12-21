'use client';

import React, { useState } from 'react';
import { University, ResearchField } from '@/lib/types';
import ProfessorList from './professor-list';

// 임시 데이터
const mockUniversities: University[] = [
  {
    name: "서울대학교",
    paperCount: 150,
    labCount: 5,
    professors: [
      {
        id: "1",
        name: "김교수",
        paperCount: 45,
        labMemberCount: 15,
        researchFields: [
          {
            category: "Computer Science",
            field: "AI",
            subFields: ["Computer vision", "Machine learning"]
          }
        ]
      },
      {
        id: "2",
        name: "이교수",
        paperCount: 38,
        labMemberCount: 8,
        researchFields: [
          {
            category: "Computer Science",
            field: "Systems",
            subFields: ["Computer networks", "Computer security"]
          }
        ]
      },
      {
        id: "3",
        name: "박교수",
        paperCount: 35,
        labMemberCount: 4,
        researchFields: [
          {
            category: "Computer Science",
            field: "AI",
            subFields: ["Natural language processing"]
          },
          {
            category: "Computer Science",
            field: "Systems",
            subFields: ["Databases"]
          }
        ]
      },
    ]
  },
  {
    name: "KAIST",
    paperCount: 140,
    labCount: 4,
    professors: [
      {
        id: "4",
        name: "정교수",
        paperCount: 42,
        labMemberCount: 12,
        researchFields: [
          {
            category: "Computer Science",
            field: "AI",
            subFields: ["Machine learning", "Natural language processing"]
          }
        ]
      },
      {
        id: "5",
        name: "최교수",
        paperCount: 36,
        labMemberCount: 7,
        researchFields: [
          {
            category: "Computer Science",
            field: "Systems",
            subFields: ["Operating systems", "Computer networks"]
          }
        ]
      }
    ]
  },
  {
    name: "포항공과대학교",
    paperCount: 120,
    labCount: 4,
    professors: [
      {
        id: "6",
        name: "한교수",
        paperCount: 40,
        labMemberCount: 10,
        researchFields: [
          {
            category: "Computer Science",
            field: "AI",
            subFields: ["Computer vision", "The Web & information retrieval"]
          }
        ]
      },
      {
        id: "7",
        name: "임교수",
        paperCount: 32,
        labMemberCount: 6,
        researchFields: [
          {
            category: "Computer Science",
            field: "Theory",
            subFields: ["Algorithms & complexity", "Cryptography"]
          }
        ]
      }
    ]
  },
  {
    name: "고려대학교",
    paperCount: 110,
    labCount: 3,
    professors: [
      {
        id: "8",
        name: "송교수",
        paperCount: 38,
        labMemberCount: 9,
        researchFields: [
          {
            category: "Computer Science",
            field: "AI",
            subFields: ["Machine learning", "Artificial intelligence"]
          }
        ]
      },
      {
        id: "9",
        name: "윤교수",
        paperCount: 30,
        labMemberCount: 5,
        researchFields: [
          {
            category: "Computer Science",
            field: "Systems",
            subFields: ["Databases", "Software engineering"]
          }
        ]
      }
    ]
  },
  {
    name: "연세대학교",
    paperCount: 100,
    labCount: 3,
    professors: [
      {
        id: "10",
        name: "강교수",
        paperCount: 35,
        labMemberCount: 8,
        researchFields: [
          {
            category: "Computer Science",
            field: "AI",
            subFields: ["Natural language processing", "Machine learning"]
          }
        ]
      },
      {
        id: "11",
        name: "조교수",
        paperCount: 28,
        labMemberCount: 6,
        researchFields: [
          {
            category: "Computer Science",
            field: "Interdisciplinary Areas",
            subFields: ["Human-computer interaction", "Computer graphics"]
          }
        ]
      }
    ]
  }
];

type UniversityRankingsProps = {
  selectedSubField: string | null;
  enabledFields: ResearchField[];
};

export default function UniversityRankings({ selectedSubField, enabledFields }: UniversityRankingsProps) {
  const [selectedUniversity, setSelectedUniversity] = useState<University | null>(null);

  const filterUniversities = (universities: University[]) => {
    return universities.map(university => {
      const filteredProfessors = university.professors.filter(professor => {
        // 1. 활성화된 필드에 속한 교수 찾기
        const matchesEnabledField = enabledFields.length > 0 && professor.researchFields.some(
          researchField => enabledFields.some(
            enabledField => enabledField.name === researchField.field
          )
        );

        // 2. 선택된 세부 분야에 속한 교수 찾기
        const matchesSelectedSubField = selectedSubField && professor.researchFields.some(
          researchField => researchField.subFields.includes(selectedSubField)
        );

        // 둘 중 하나라도 만족하면 포함
        return matchesEnabledField || matchesSelectedSubField;
      });

      // 필터링된 교수들의 정보로 대학 정보 업데이트
      return {
        ...university,
        professors: filteredProfessors,
        paperCount: filteredProfessors.reduce((sum, prof) => sum + prof.paperCount, 0),
        labCount: filteredProfessors.length
      };
    }).filter(university => university.professors.length > 0);
  };

  if (!selectedSubField && enabledFields.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        왼쪽에서 연구 분야를 선택하거나 활성화해주세요.
      </div>
    );
  }

  const filteredUniversities = filterUniversities(mockUniversities);

  if (selectedUniversity) {
    return (
      <ProfessorList 
        university={{
          ...selectedUniversity,
          professors: selectedUniversity.professors.filter(professor => {
            const matchesEnabledField = enabledFields.length > 0 && professor.researchFields.some(
              researchField => enabledFields.some(
                enabledField => enabledField.name === researchField.field
              )
            );
            const matchesSelectedSubField = selectedSubField && professor.researchFields.some(
              researchField => researchField.subFields.includes(selectedSubField)
            );
            return matchesEnabledField || matchesSelectedSubField;
          })
        }}
        onBack={() => setSelectedUniversity(null)}
        selectedSubField={selectedSubField}
      />
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-6">
        {selectedSubField ? `${selectedSubField} 분야` : '활성화된 분야'} 대학 순위
      </h2>
      <div className="space-y-4">
        {filteredUniversities.map((university, index) => (
          <button
            key={university.name}
            onClick={() => setSelectedUniversity(university)}
            className="w-full p-4 rounded-lg border hover:bg-accent/50 transition-colors text-left"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-lg font-medium w-8">{index + 1}</span>
                <div>
                  <h3 className="font-medium">{university.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    논문 수: {university.paperCount} | 연구실: {university.labCount}개
                  </p>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
} 