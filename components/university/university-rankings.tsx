'use client';

import React, { useState } from 'react';
import { University, ResearchField, SelectedSubFields } from '@/lib/types';
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
            subFields: [
              "Computer vision",
              "Machine learning",
              "Artificial intelligence"
            ]
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
            subFields: [
              "Computer networks",
              "Computer security",
              "Mobile computing",
              "Operating systems"
            ]
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
            subFields: [
              "Natural language processing",
              "Machine learning",
              "The Web & information retrieval"
            ]
          },
          {
            category: "Computer Science",
            field: "Systems",
            subFields: [
              "Databases",
              "Software engineering"
            ]
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
            subFields: [
              "Machine learning",
              "Natural language processing",
              "Computer vision",
              "The Web & information retrieval"
            ]
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
            subFields: [
              "Operating systems",
              "Computer networks",
              "High-performance computing",
              "Computer security"
            ]
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
            subFields: [
              "Computer vision",
              "Machine learning",
              "The Web & information retrieval",
              "Artificial intelligence"
            ]
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
            subFields: [
              "Algorithms & complexity",
              "Cryptography",
              "Logic & verification"
            ]
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
            subFields: [
              "Machine learning",
              "Artificial intelligence",
              "Computer vision",
              "Natural language processing"
            ]
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
            subFields: [
              "Databases",
              "Software engineering",
              "High-performance computing",
              "Programming languages"
            ]
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
            subFields: [
              "Natural language processing",
              "Machine learning",
              "The Web & information retrieval",
              "Artificial intelligence"
            ]
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
            subFields: [
              "Human-computer interaction",
              "Computer graphics",
              "Visualization",
              "Computer science education"
            ]
          },
          {
            category: "Computer Science",
            field: "Systems",
            subFields: [
              "Software engineering",
              "Programming languages"
            ]
          }
        ]
      }
    ]
  },
  {
    name: "단국대학교",
    paperCount: 95,
    labCount: 5,
    professors: [
      {
        id: "12",
        name: "오교수",
        paperCount: 25,
        labMemberCount: 9,
        researchFields: [
          {
            category: "Computer Science",
            field: "AI",
            subFields: [
              "Machine learning",
              "Computer vision",
              "Artificial intelligence",
              "The Web & information retrieval"
            ]
          }
        ]
      },
      {
        id: "13",
        name: "신교수",
        paperCount: 22,
        labMemberCount: 16,
        researchFields: [
          {
            category: "Computer Science",
            field: "Systems",
            subFields: [
              "Computer networks",
              "Mobile computing",
              "Computer security",
              "Operating systems"
            ]
          }
        ]
      },
      {
        id: "14",
        name: "황교수",
        paperCount: 18,
        labMemberCount: 25,
        researchFields: [
          {
            category: "Computer Science",
            field: "Theory",
            subFields: [
              "Algorithms & complexity",
              "Logic & verification",
              "Cryptography"
            ]
          },
          {
            category: "Computer Science",
            field: "AI",
            subFields: [
              "Artificial intelligence",
              "Machine learning"
            ]
          }
        ]
      },
      {
        id: "15",
        name: "백교수",
        paperCount: 16,
        labMemberCount: 14,
        researchFields: [
          {
            category: "Computer Science",
            field: "Interdisciplinary Areas",
            subFields: [
              "Computer graphics",
              "Visualization",
              "Human-computer interaction"
            ]
          }
        ]
      },
      {
        id: "16",
        name: "문교수",
        paperCount: 14,
        labMemberCount: 23,
        researchFields: [
          {
            category: "Computer Science",
            field: "Systems",
            subFields: [
              "Software engineering",
              "Programming languages",
              "Operating systems",
              "High-performance computing"
            ]
          }
        ]
      }
    ]
  }
];

type UniversityRankingsProps = {
  selectedSubFields: SelectedSubFields;
  enabledFields: ResearchField[];
};

export default function UniversityRankings({ selectedSubFields, enabledFields }: UniversityRankingsProps) {
  const [selectedUniversity, setSelectedUniversity] = useState<University | null>(null);

  // enabledFields나 selectedSubFields가 변경될 때마다 selectedUniversity 업데이트
  React.useEffect(() => {
    if (selectedUniversity) {
      // 원본 대학 데이터 찾기
      const originalUniversity = mockUniversities.find(
        univ => univ.name === selectedUniversity.name
      );
      if (originalUniversity) {
        setSelectedUniversity(originalUniversity);
      }
    }
  }, [enabledFields, selectedSubFields]);

  const filterProfessors = (professors: Professor[]) => {
    return professors.filter(professor => {
      // 1. 활성화된 필드에 속한 교수 찾기
      const matchesEnabledField = professor.researchFields.some(
        researchField => enabledFields.some(
          enabledField => enabledField.name === researchField.field
        )
      );

      // 2. 선택된 세부 분야에 속한 교수 찾기
      const matchesSelectedSubFields = Object.entries(selectedSubFields).some(([fieldName, subFields]) =>
        professor.researchFields.some(
          researchField =>
            researchField.field === fieldName &&
            (subFields.length === 0 || // 세부 분야가 선택되지 않았거나
            researchField.subFields.some(sf => subFields.includes(sf))) // 선택된 세부 분야와 일치
        )
      );

      return matchesEnabledField || matchesSelectedSubFields;
    });
  };

  const filterUniversities = (universities: University[]) => {
    return universities.map(university => {
      const filteredProfessors = filterProfessors(university.professors);

      return {
        ...university,
        professors: filteredProfessors,
        paperCount: filteredProfessors.reduce((sum, prof) => sum + prof.paperCount, 0),
        labCount: filteredProfessors.length
      };
    })
    .filter(university => university.professors.length > 0)
    .sort((a, b) => b.paperCount - a.paperCount);
  };

  if (!Object.keys(selectedSubFields).length && enabledFields.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        왼쪽에서 연구 분야를 선택하거나 활성화해주세요.
      </div>
    );
  }

  const filteredUniversities = filterUniversities(mockUniversities);

  if (selectedUniversity) {
    // 선택된 대학의 모든 교수 데이터를 유지하면서 필터링
    const currentUniversity = {
      ...selectedUniversity,
      professors: filterProfessors(selectedUniversity.professors)
    };

    // 필터링된 교수가 없는 경우에도 대학 정보는 유지
    return (
      <ProfessorList 
        university={{
          ...currentUniversity,
          paperCount: currentUniversity.professors.reduce((sum, prof) => sum + prof.paperCount, 0),
          labCount: currentUniversity.professors.length
        }}
        onBack={() => setSelectedUniversity(null)}
        selectedSubFields={selectedSubFields}
        enabledFields={enabledFields}
      />
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-6">
        {Object.keys(selectedSubFields).length ? '선택된 분야' : '활성화된 분야'} 대학 순위
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