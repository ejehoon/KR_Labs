'use client';

import React, { useState, useEffect } from 'react';
import { University, ResearchField, SelectedSubFields } from '@/lib/types';
import ProfessorList from './professor-list';
import { getUniversities } from '@/lib/api';
import { ArrowLeft } from 'lucide-react';

type UniversityRankingsProps = {
  selectedSubFields: SelectedSubFields;
  enabledFields: ResearchField[];
};

export default function UniversityRankings({ selectedSubFields, enabledFields }: UniversityRankingsProps) {
  const [selectedUniversity, setSelectedUniversity] = useState<University | null>(null);
  const [universities, setUniversities] = useState<University[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Supabase에서 대학 데이터 가져오기
  useEffect(() => {
    async function fetchUniversities() {
      try {
        setLoading(true);
        const data = await getUniversities({
          selectedSubFields,
          enabledFields: enabledFields.map(f => f.name)
        });
        setUniversities(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch universities:', err);
        setError('대학 데이터를 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    }

    fetchUniversities();
  }, [selectedSubFields, enabledFields]);

  // enabledFields나 selectedSubFields가 변경될 때마다 selectedUniversity 업데이트
  useEffect(() => {
    if (selectedUniversity) {
      const updatedUniversity = universities.find(
        univ => univ.name === selectedUniversity.name
      );
      setSelectedUniversity(updatedUniversity || null);
    }
  }, [universities, selectedUniversity]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        데이터를 불러오는 중...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        {error}
      </div>
    );
  }

  if (!Object.keys(selectedSubFields).length && enabledFields.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        왼쪽에서 연구 분야를 선택하거나 활성화해주세요.
      </div>
    );
  }

  if (selectedUniversity) {
    return (
      <ProfessorList 
        university={selectedUniversity}
        onBack={() => setSelectedUniversity(null)}
        selectedSubFields={selectedSubFields}
        enabledFields={enabledFields}
      />
    );
  }

  if (!universities || universities.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">왼쪽에서 연구 분야를 선택하거나 활성화해주세요.</p>
      </div>
    );
  }

  return (
    <div className="p-6 relative z-10">
      <div className="w-[550px]">
        <button
          onClick={() => setSelectedUniversity(null)}
          className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          대학 목록으로 돌아가기
        </button>

        <h2 className="text-xl font-semibold mb-2">
          선택된 분야 대학 순위
        </h2>

        <div className="space-y-2">
          {universities.map((university, index) => (
            <button
              key={university.name}
              onClick={() => setSelectedUniversity(university)}
              className="w-full bg-white/50 hover:bg-white/30 p-4 rounded-xl transition-all 
                duration-200 text-left backdrop-blur-sm"
            >
              <div className="flex items-center gap-4">
                <span className="text-lg font-medium w-6">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-medium">{university.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    총 논문 수: {university.paperCount}편 | 연구실: {university.labCount}개
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {loading && (
          <div className="w-[600px] bg-white/20 backdrop-blur-sm p-4 rounded-xl flex items-center justify-center">
            <p className="text-muted-foreground">데이터를 불러오는 중...</p>
          </div>
        )}

        {error && (
          <div className="w-[600px] bg-white/20 backdrop-blur-sm p-4 rounded-xl flex items-center justify-center">
            <p className="text-red-500">{error}</p>
          </div>
        )}

        {!Object.keys(selectedSubFields).length && enabledFields.length === 0 && (
          <div className="w-[600px] bg-white/20 backdrop-blur-sm p-4 rounded-xl flex items-center justify-center">
            <p className="text-muted-foreground">
              왼쪽에서 연구 분야를 선택하거나 활성화해주세요.
            </p>
          </div>
        )}
      </div>
    </div>
  );
} 