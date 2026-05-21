export type ResearchAreaGroup = {
  id: string;
  label: string;
  defaultOpen: boolean;
  areas: ResearchArea[];
};

export type ResearchArea = {
  id: string;
  label: string;
  matchTerms: string[];
};

export type ResearchTaxonomy = {
  slug: string;
  label: string;
  groups: ResearchAreaGroup[];
};
