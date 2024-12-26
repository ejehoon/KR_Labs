import { University, Professor } from './types';

const mockProfessors: { [key: string]: Professor[] } = {
  'KAIST': [
    {
      id: '1',
      name: '김철수',
      department: '전산학부',
      paperCount: 150,
      labMemberCount: 25,
      labUrl: 'https://mllab.kaist.ac.kr',
      scholarUrl: 'https://scholar.google.com/profile1',
      dblpUrl: 'https://dblp.org/pid/profile1',
      researchFields: [
        {
          category: 'CS',
          field: 'AI',
          subFields: ['Machine learning', 'Computer vision']
        }
      ]
    },
    {
      id: '2',
      name: '이영희',
      department: '전산학부',
      paperCount: 100,
      labMemberCount: 15,
      labUrl: 'https://dblab.kaist.ac.kr',
      scholarUrl: 'https://scholar.google.com/profile2',
      dblpUrl: 'https://dblp.org/pid/profile2',
      researchFields: [
        {
          category: 'CS',
          field: 'Systems',
          subFields: ['Databases', 'Computer networks']
        }
      ]
    }
  ],
  'Seoul National University': [
    {
      id: '3',
      name: '박민준',
      department: '컴퓨터공학부',
      paperCount: 100,
      labMemberCount: 20,
      labUrl: 'https://ailab.snu.ac.kr',
      scholarUrl: 'https://scholar.google.com/profile3',
      dblpUrl: 'https://dblp.org/pid/profile3',
      researchFields: [
        {
          category: 'CS',
          field: 'AI',
          subFields: ['Natural language processing', 'Machine learning']
        }
      ]
    },
    {
      id: '4',
      name: '정다인',
      department: '컴퓨터공학부',
      paperCount: 70,
      labMemberCount: 12,
      scholarUrl: 'https://scholar.google.com/profile4',
      dblpUrl: 'https://dblp.org/pid/profile4',
      researchFields: [
        {
          category: 'CS',
          field: 'Systems',
          subFields: ['Operating systems', 'Computer security']
        }
      ]
    }
  ],
  'POSTECH': [
    {
      id: '5',
      name: '최준호',
      department: '컴퓨터공학과',
      paperCount: 80,
      labMemberCount: 18,
      labUrl: 'https://seclab.postech.ac.kr',
      scholarUrl: 'https://scholar.google.com/profile5',
      dblpUrl: 'https://dblp.org/pid/profile5',
      researchFields: [
        {
          category: 'CS',
          field: 'Systems',
          subFields: ['Computer security', 'Computer networks']
        }
      ]
    },
    {
      id: '6',
      name: '강서연',
      department: '컴퓨터공학과',
      paperCount: 50,
      labMemberCount: 10,
      labUrl: 'https://graphics.postech.ac.kr',
      scholarUrl: 'https://scholar.google.com/profile6',
      dblpUrl: 'https://dblp.org/pid/profile6',
      researchFields: [
        {
          category: 'CS',
          field: 'Interdisciplinary Areas',
          subFields: ['Computer graphics', 'Visualization']
        }
      ]
    }
  ]
};

export const getMockUniversities = (params?: {
  selectedSubFields?: { [fieldName: string]: string[] };
  enabledFields?: string[];
}): University[] => {
  const universities: University[] = Object.entries(mockProfessors).map(([name, professors]) => {
    // 필터링된 교수 목록
    const filteredProfessors = professors.filter(professor => {
      if (!params) return true;

      // 활성화된 필드에 속한 교수 찾기
      const matchesEnabledField = params.enabledFields?.length ? 
        professor.researchFields.some(rf => 
          params.enabledFields?.includes(rf.field)
        ) : true;

      // 선택된 세부 분야에 속한 교수 찾기
      const matchesSelectedSubFields = Object.keys(params.selectedSubFields || {}).length ?
        Object.entries(params.selectedSubFields || {}).some(([fieldName, subFields]) =>
          professor.researchFields.some(rf =>
            rf.field === fieldName &&
            rf.subFields.some(sf => subFields.includes(sf))
          )
        ) : true;

      return matchesEnabledField || matchesSelectedSubFields;
    });

    return {
      name,
      professors: filteredProfessors,
      paperCount: filteredProfessors.reduce((sum, prof) => sum + prof.paperCount, 0),
      labCount: filteredProfessors.length
    };
  }).filter(univ => univ.professors.length > 0) // 필터링 후 교수가 있는 대학만 반환
    .sort((a, b) => b.paperCount - a.paperCount); // 논문 수 기준 내림차순 정렬

  return universities;
}; 