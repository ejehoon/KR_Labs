import { ResearchField } from './types';

export type ResearchCategory = {
  name: string;
  fields: ResearchField[];
};

export const RESEARCH_CATEGORIES: ResearchCategory[] = [
  {
    name: 'CS',
    fields: [
      {
        name: 'AI',
        isEnabled: false,
        subFields: [
          'Artificial intelligence',
          'Computer vision',
          'Machine learning',
          'Natural language processing',
          'The Web & information retrieval',
        ],
      },
      {
        name: 'Systems',
        isEnabled: false,
        subFields: [
          'Computer architecture',
          'Computer networks',
          'Computer security',
          'Databases',
          'Design automation',
          'Embedded & real-time systems',
          'High-performance computing',
          'Mobile computing',
          'Measurement & perf. analysis',
          'Operating systems',
          'Programming languages',
          'Software engineering',
        ],
      },
      {
        name: 'Theory',
        isEnabled: false,
        subFields: [
          'Algorithms & complexity',
          'Cryptography',
          'Logic & verification',
        ],
      },
      {
        name: 'Interdisciplinary Areas',
        isEnabled: false,
        subFields: [
          'Comp. bio & bioinformatics',
          'Computer graphics',
          'Computer science education',
          'Economics & computation',
          'Human-computer interaction',
          'Robotics',
          'Visualization',
        ],
      },
      // etc 카테고리 추가
      {
        name: 'etc',
        isEnabled: false,
        subFields: [
          'Uncategorized'
        ],
      },
    ],
  },
];