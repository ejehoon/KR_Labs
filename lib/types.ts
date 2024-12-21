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
  field: string;       // ex: 'AI', 'Systems' 등
  subFields: string[];
};

export type Professor = {
  id: string;
  name: string;
  paperCount: number;
  labMemberCount: number;
  labUrl?: string;
  researchFields: ProfessorField[];
};

export type University = {
  name: string;
  paperCount: number;
  labCount: number;
  professors: Professor[];
}; 