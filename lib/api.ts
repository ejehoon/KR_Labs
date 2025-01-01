import { supabase } from './supabase';
import { University } from './types';

export async function getUniversities(params?: {
  selectedSubFields?: { [fieldName: string]: string[] };
  enabledFields?: string[];
}): Promise<University[]> {
  try {
    // 1. 기본 쿼리 구성
    const query = supabase
      .from('professors')
      .select(`
        id,
        name,
        department,
        paper_count,
        lab_member_count,
        lab_url,
        scholar_url,
        dblp_url,
        research_sub_fields,
        universities!inner (
          id,
          name
        )
      `);

    // 2. 데이터 가져오기
    const { data: professors, error } = await query;
    if (error) throw error;

    // 3. 연구 분야 정보 가져오기
    const { data: subFields } = await supabase
      .from('research_sub_fields')
      .select(`
        id,
        name,
        research_fields!inner (
          id,
          name,
          category_id
        )
      `);

    // 4. 대학별로 데이터 그룹화
    const universitiesMap = new Map<string, University>();

    professors?.forEach(professor => {
      const universityName = professor.universities.name;

      // 교수의 연구 분야 데이터 변환
      const researchFields = new Map<string, { category: string; field: string; subFields: string[] }>();
      
      professor.research_sub_fields.forEach((subFieldId: number) => {
        const subField = subFields?.find(sf => sf.id === subFieldId);
        if (subField) {
          const field = subField.research_fields.name;
          if (!researchFields.has(field)) {
            researchFields.set(field, {
              category: String(subField.research_fields.category_id),
              field: field,
              subFields: []
            });
          }
          researchFields.get(field)?.subFields.push(subField.name);
        }
      });

      const professorResearchFields = Array.from(researchFields.values());

      // 필터링 조건 확인
      const hasSelectedSubFields = Object.keys(params?.selectedSubFields || {}).length > 0;

      const matchesFilters = hasSelectedSubFields
        ? Object.entries(params?.selectedSubFields || {}).some(([fieldName, subFields]) =>
            professorResearchFields.some(rf =>
              rf.field === fieldName &&
              rf.subFields.some(sf => subFields.includes(sf))
            )
          )
        : !params?.enabledFields?.length ||
          professorResearchFields.some(rf => params.enabledFields?.includes(rf.field));

      if (matchesFilters) {
        if (!universitiesMap.has(universityName)) {
          universitiesMap.set(universityName, {
            name: universityName,
            professors: [],
            paperCount: 0,
            labCount: 0
          });
        }

        const university = universitiesMap.get(universityName)!;
        university.professors.push({
          id: professor.id,
          name: professor.name,
          department: professor.department,
          paperCount: professor.paper_count,
          labMemberCount: professor.lab_member_count,
          labUrl: professor.lab_url,
          scholarUrl: professor.scholar_url,
          dblpUrl: professor.dblp_url,
          researchFields: professorResearchFields
        });
        university.paperCount += professor.paper_count;
        university.labCount = university.professors.length;
      }
    });

    return Array.from(universitiesMap.values())
      .sort((a, b) => b.paperCount - a.paperCount);

  } catch (error) {
    console.error('Error fetching universities:', error);
    throw error;
  }
}

export async function getUniversity(id: string): Promise<University | null> {
  try {
    const { data: professor, error } = await supabase
      .from('professors')
      .select(`
        id,
        name,
        department,
        paper_count,
        lab_member_count,
        lab_url,
        scholar_url,
        dblp_url,
        universities!inner (
          id,
          name
        ),
        professor_research_fields!left (
          research_fields!inner (
            id,
            name,
            category_id
          ),
          professor_sub_fields!left (
            research_sub_fields!inner (
              id,
              name
            )
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!professor) return null;

    // 대학 정보 구성
    const university: University = {
      name: professor.universities.name,
      professors: [{
        id: professor.id,
        name: professor.name,
        department: professor.department,
        paperCount: professor.paper_count,
        labMemberCount: professor.lab_member_count,
        labUrl: professor.lab_url,
        scholarUrl: professor.scholar_url,
        dblpUrl: professor.dblp_url,
        researchFields: professor.professor_research_fields.map(prf => ({
          category: String(prf.research_fields.category_id),
          field: prf.research_fields.name,
          subFields: prf.professor_sub_fields.map(psf => psf.research_sub_fields.name)
        }))
      }],
      paperCount: professor.paper_count,
      labCount: 1
    };

    return university;

  } catch (error) {
    console.error('Error fetching university:', error);
    throw error;
  }
} 