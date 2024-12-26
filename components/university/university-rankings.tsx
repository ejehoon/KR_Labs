'use client';

import React, { useState, useEffect } from 'react';
import { University, ResearchField, SelectedSubFields } from '@/lib/types';
import ProfessorList from './professor-list';
import { getUniversities } from '@/lib/api';

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

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-6">
        {Object.keys(selectedSubFields).length ? '선택된 분야' : '활성화된 분야'} 대학 순위
      </h2>
      <div className="space-y-4">
        {universities.map((university, index) => (
          <button
            key={university.name}
            onClick={() => setSelectedUniversity(university)}
            className="w-full p-4 rounded-lg border hover:bg-accent/50 transition-colors text-left"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-lg font-medium w-8">{index + 1}</span>
                <div>
                  <h3 className="font-medium">{university.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    총 논문 수: {university.paperCount}편 | 연구실: {university.labCount}개
                  </p>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
} 