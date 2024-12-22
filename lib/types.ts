export type ResearchField = {
  name: string;
  subFields: string[];
  isEnabled: boolean;
};

export type ResearchCategory = {
  name: string;
  fields: ResearchField[];
};

export type LabSize = 'large' | 'medium' | 'small';

export type ProfessorField = {
  category: string;
  field: string;
  subFields: string[];
};

export type Professor = {
  id: string;
  name: string;
  department: string;
  citationsSince2019: number;
  labMemberCount: number;
  labUrl?: string;
  scholarUrl?: string;
  researchFields: ProfessorField[];
};

export type University = {
  name: string;
  paperCount: number;
  labCount: number;
  professors: Professor[];
};

// 선택된 세부 분야를 관리하기 위한 타입
export type SelectedSubFields = {
  [fieldName: string]: string[]; // key: field name (e.g., 'Systems'), value: array of selected subfields
}; 