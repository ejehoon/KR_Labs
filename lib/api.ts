import { supabase } from './supabase';
import { University, Professor, ProfessorField } from './types';

export async function getUniversities(params?: {
  selectedSubFields?: { [fieldName: string]: string[] };
  enabledFields?: string[];
}) {
  try {
    console.log('Fetching with params:', params);

    // 1. 모든 대학 정보 가져오기
    const { data: universities, error: univError } = await supabase
      .from('universities')
      .select('*')
      .order('name');

    if (univError) throw univError;

    // 2. 각 대학별 교수 정보와 연구 분야 가져오기
    const universitiesWithProfessors = await Promise.all(
      universities.map(async (univ) => {
        // 교수 정보 조회 쿼리 구성
        let query = supabase
          .from('professors')
          .select(`
            *,
            professor_research_fields!left (
              id,
              research_fields!left (
                id,
                name,
                category_id
              ),
              professor_sub_fields!left (
                research_sub_fields!left (
                  id,
                  name
                )
              )
            )
          `)
          .eq('university_id', univ.id);

        const { data: professors, error: profError } = await query;
        if (profError) throw profError;

        // 교수 데이터 필터링 및 변환
        const filteredProfessors = professors?.filter(professor => {
          if (!professor.professor_research_fields?.length) return false;

          // 활성화된 필드에 속한 교수 찾기
          const matchesEnabledField = params?.enabledFields?.length ? 
            professor.professor_research_fields.some(prf => 
              params.enabledFields?.includes(prf.research_fields?.name)
            ) : true;

          // 선택된 세부 분야에 속한 교수 찾기
          const matchesSelectedSubFields = Object.keys(params?.selectedSubFields || {}).length ?
            Object.entries(params.selectedSubFields || {}).some(([fieldName, subFields]) =>
              professor.professor_research_fields.some(prf =>
                prf.research_fields?.name === fieldName &&
                prf.research_fields?.research_sub_fields?.some(sf =>
                  subFields.includes(sf.name)
                )
              )
            ) : true;

          return matchesEnabledField || matchesSelectedSubFields;
        });

        // 교수 데이터 변환
        const transformedProfessors: Professor[] = filteredProfessors.map(prof => ({
          id: prof.id,
          name: prof.name,
          department: prof.department,
          citationsSince2019: prof.citations_since_2019,
          labMemberCount: prof.lab_member_count,
          labUrl: prof.lab_url,
          scholarUrl: prof.scholar_url,
          researchFields: prof.professor_research_fields
            .filter(prf => prf.research_fields)
            .map(prf => ({
              category: String(prf.research_fields.category_id),
              field: prf.research_fields.name,
              subFields: prf.professor_sub_fields
                ?.map(psf => psf.research_sub_fields.name) || []
            }))
        }));

        // 대학 정보 반환
        return {
          name: univ.name,
          professors: transformedProfessors,
          paperCount: transformedProfessors.reduce((sum, prof) => sum + prof.citationsSince2019, 0),
          labCount: transformedProfessors.length
        };
      })
    );

    // 교수가 있는 대학만 필터링하여 반환
    return universitiesWithProfessors.filter(univ => univ.professors.length > 0);

  } catch (error) {
    console.error('Error fetching universities:', error);
    throw error;
  }
}

// 단일 대학 조회
export async function getUniversity(id: number) {
  try {
    // 대학 정보 조회
    const { data: university, error: univError } = await supabase
      .from('universities')
      .select('*')
      .eq('id', id)
      .single();

    if (univError) throw univError;

    // 해당 대학 교수 정보 조회
    const { data: professors, error: profError } = await supabase
      .from('professors')
      .select(`
        *,
        professor_research_fields!left (
          id,
          research_fields!left (
            id,
            name,
            category_id
          ),
          professor_sub_fields!left (
            research_sub_fields!left (
              id,
              name
            )
          )
        )
      `)
      .eq('university_id', id);

    if (profError) throw profError;

    // 교수 데이터 변환
    const transformedProfessors: Professor[] = professors.map(prof => ({
      id: prof.id,
      name: prof.name,
      department: prof.department,
      citationsSince2019: prof.citations_since_2019,
      labMemberCount: prof.lab_member_count,
      labUrl: prof.lab_url,
      scholarUrl: prof.scholar_url,
      researchFields: prof.professor_research_fields
        .filter(prf => prf.research_fields)
        .map(prf => ({
          category: String(prf.research_fields.category_id),
          field: prf.research_fields.name,
          subFields: prf.professor_sub_fields
            ?.map(psf => psf.research_sub_fields.name) || []
        }))
    }));

    return {
      name: university.name,
      professors: transformedProfessors,
      paperCount: transformedProfessors.reduce((sum, prof) => sum + prof.citationsSince2019, 0),
      labCount: transformedProfessors.length
    };

  } catch (error) {
    console.error('Error fetching university:', error);
    throw error;
  }
} 