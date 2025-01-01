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
  paperCount: number;
  labMemberCount: number;
  labUrl?: string;
  scholarUrl?: string;
  dblpUrl?: string;
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

// Supabase 응답 타입 추가
export type ProfessorFromDB = {
  id: string;
  name: string;
  department: string;
  paper_count: number;
  lab_member_count: number | null;
  lab_url: string | null;
  scholar_url: string | null;
  dblp_url: string | null;
  research_sub_fields: number[];
  universities: {
    id: string;
    name: string;
  };
}; 