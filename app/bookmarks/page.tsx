'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { ArrowLeft, Home, BookOpen, Database, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { calculateLabSize } from '@/lib/utils';
import { LabSize } from '@/lib/types';
import BookmarkButton from '@/components/bookmark-button';

// 인터페이스 정의 추가
interface Professor {
  id: string;
  name: string;
  department: string;
  paper_count: number;
  lab_member_count: number | null;
  lab_url: string | null;
  scholar_url: string | null;
  dblp_url: string | null;
  university_id: string;
  research_sub_fields: number[];  // 연구 분야 ID 배열
  universities: {
    name: string;
  };
}

// RESEARCH_AREAS 타입 정의
interface ResearchArea {
  id: string;
  name: string;
  subFieldIds: number[];
}

const RESEARCH_AREAS: ResearchArea[] = [
  { 
    id: 'ai', 
    name: 'AI', 
    subFieldIds: [1, 2, 3, 4, 5]  // AI 관련 research_sub_fields의 id들
  },
  { 
    id: 'systems', 
    name: 'Systems', 
    subFieldIds: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]  // Systems 관련 id들
  },
  { 
    id: 'theory', 
    name: 'Theory', 
    subFieldIds: [18, 19, 20]  // Theory 관련 id들
  },
  { 
    id: 'interdisciplinary', 
    name: 'Interdisciplinary Areas', 
    subFieldIds: [21, 22, 23, 24, 25]  // Interdisciplinary 관련 id들
  },
  { 
    id: 'etc', 
    name: 'etc', 
    subFieldIds: [55]  // etc 관련 id들
  }

];

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const supabase = createClientComponentClient();
  const router = useRouter();

  useEffect(() => {
    const fetchBookmarks = async () => {
      try {
        // 1. 세션 확인
        const { data: { session } } = await supabase.auth.getSession();
        console.log('현재 세션:', session?.user.id); // 세션 확인
        
        if (!session) {
          router.push('/');
          return;
        }

        // 2. 북마크 정보 조회
        const { data: bookmarkData, error: bookmarkError } = await supabase
          .from('bookmarks')
          .select('lab_id')
          .eq('user_id', session.user.id);

        console.log('북마크 데이터:', bookmarkData); // 북마크 데이터 확인

        if (bookmarkError) {
          console.error('북마크 조회 에러:', bookmarkError);
          return;
        }

        if (!bookmarkData || bookmarkData.length === 0) {
          console.log('북마크가 없습니다.');
          setBookmarks([]);
          return;
        }

        // 3. professors 테이블에서 교수 정보 조회
        const labIds = bookmarkData.map(bookmark => bookmark.lab_id);
        console.log('조회할 lab_ids:', labIds);

        const { data: professorsData, error: professorsError } = await supabase
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
            university_id,
            research_sub_fields,
            universities!inner (
              name
            )
          `)
          .in('id', labIds);

        console.log('교수 데이터:', professorsData);

        if (professorsError) {
          console.error('교수 데이터 조회 에러:', professorsError);
          return;
        }

        if (!professorsData || professorsData.length === 0) {
          console.log('교수 데이터를 찾을 수 없습니다.');
          setBookmarks([]);
          return;
        }

        setBookmarks(professorsData);

      } catch (error) {
        console.error('전체 에러:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBookmarks();
  }, [supabase, router]);

  // 필터링된 북마크 목록
  const filteredBookmarks = selectedArea 
    ? bookmarks.filter((professor: Professor) => {
        const selectedAreaInfo = RESEARCH_AREAS.find(area => area.id === selectedArea);
        if (!selectedAreaInfo) return false;

        return professor.research_sub_fields?.some((subFieldId: number) => 
          selectedAreaInfo.subFieldIds.includes(subFieldId)
        );
      })
    : bookmarks;

  if (loading) {
    return <div className="p-4">로딩 중...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <button
        onClick={() => router.back()}
        className="flex items-center text-sm text-gray-500 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        뒤로 가기
      </button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">
          북마크한 연구실 총 <span className="text-amber-600">{bookmarks.length}</span>건
        </h1>
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-white border rounded-md hover:border-gray-300 transition-colors text-amber-600 font-bold"
          >
            {selectedArea ? RESEARCH_AREAS.find(area => area.id === selectedArea)?.name : '전체'}
            <ChevronDown className="h-4 w-4" />
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border rounded-md shadow-lg z-10">
              <button
                onClick={() => {
                  setSelectedArea(null);
                  setIsDropdownOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                  selectedArea === null ? 'text-amber-600' : 'text-gray-700'
                }`}
              >
                전체
              </button>
              {RESEARCH_AREAS.map(area => (
                <button
                  key={area.id}
                  onClick={() => {
                    setSelectedArea(area.id);
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                    selectedArea === area.id ? 'text-amber-600' : 'text-gray-700'
                  }`}
                >
                  {area.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filteredBookmarks.length === 0 ? (
        <p className="text-gray-500">
          {selectedArea ? '선택한 연구 분야의 북마크가 없습니다.' : '북마크한 연구실이 없습니다.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredBookmarks.map((professor) => {
            const labSize = professor.lab_member_count != null 
              ? calculateLabSize(professor.lab_member_count)
              : 'unknown';

            return (
              <div
                key={professor.id}
                className="w-full bg-white p-4 border rounded-md hover:border-gray-300 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{professor.name}</h3>
                      <div className="flex gap-2">
                        {professor.lab_url && (
                          <a
                            href={professor.lab_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                            title="연구실 홈페이지"
                          >
                            <Home className="h-4 w-4" />
                          </a>
                        )}
                        {professor.scholar_url && (
                          <a
                            href={professor.scholar_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                            title="Google Scholar"
                          >
                            <BookOpen className="h-4 w-4" />
                          </a>
                        )}
                        {professor.dblp_url && (
                          <a
                            href={professor.dblp_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                            title="DBLP"
                          >
                            <Database className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {professor.universities.name} | {professor.department} | 
                      논문 {professor.paper_count}편 | 
                      연구원 {professor.lab_member_count != null ? `${professor.lab_member_count}명` : '알 수 없음'}
                    </p>
                    <p className="text-sm text-gray-500">
                      연구 분야: {professor.research_sub_fields
                        ?.map(subField => subField.name)
                        .join(', ') || '정보 없음'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <BookmarkButton 
                      professorId={professor.id}
                      onBookmarkChange={() => {
                        // 북마크 해제 후 목록에서 제거
                        setBookmarks(prev => prev.filter(p => p.id !== professor.id));
                      }}
                    />
                    <span className={`px-3 py-1 rounded-full text-sm ${getLabSizeColor(labSize)}`}>
                      {getLabSizeText(labSize)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const getLabSizeColor = (size: LabSize | 'unknown'): string => {
  switch (size) {
    case 'large':
      return 'bg-indigo-100 text-indigo-700';
    case 'medium':
      return 'bg-emerald-100 text-emerald-700';
    case 'small':
      return 'bg-amber-100 text-amber-700';
    case 'unknown':
      return 'bg-slate-100 text-slate-600';
  }
};

const getLabSizeText = (labSize: LabSize | 'unknown') => {
  if (labSize === 'unknown') return '알 수 없음';
  return `${labSize === 'large' ? '대형' : labSize === 'medium' ? '중형' : '소형'} 연구실`;
}; 