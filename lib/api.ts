import { University } from './types';
import { getMockUniversities } from './mockData';

export async function getUniversities(params?: {
  selectedSubFields?: { [fieldName: string]: string[] };
  enabledFields?: string[];
}): Promise<University[]> {
  // Supabase 대신 mock 데이터 사용
  return getMockUniversities(params);
}

export async function getUniversity(id: string): Promise<University | null> {
  const universities = getMockUniversities();
  const university = universities.find(u => 
    u.professors.some(p => p.id === id)
  );
  return university || null;
} 