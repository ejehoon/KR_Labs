'use client';

import React, { useState } from 'react';
import ResearchFieldSelector from '@/components/research-fields/research-field-selector';
import UniversityRankings from '@/components/university/university-rankings';
import { ResearchField, SelectedSubFields } from '@/lib/types';

export default function Home() {
  const [selectedSubFields, setSelectedSubFields] = useState<SelectedSubFields>({});
  const [enabledFields, setEnabledFields] = useState<ResearchField[]>([]);

  const handleFieldToggle = (field: ResearchField) => {
    setEnabledFields(prev => {
      const existingFieldIndex = prev.findIndex(f => f.name === field.name);
      if (existingFieldIndex >= 0) {
        // 이미 있는 필드라면 제거하고 해당 필드의 선택된 세부 분야도 초기화
        setSelectedSubFields(prev => {
          const { [field.name]: removed, ...rest } = prev;
          return rest;
        });
        return prev.filter(f => f.name !== field.name);
      } else {
        // 없는 필드라면 추가하고 모든 세부 분야를 선택
        setSelectedSubFields(prev => ({
          ...prev,
          [field.name]: field.subFields // 모든 세부 분야를 선택
        }));
        return [...prev, { ...field, isEnabled: true }];
      }
    });
  };

  const handleSubFieldToggle = (fieldName: string, subField: string) => {
    setSelectedSubFields(prev => {
      const currentSubFields = prev[fieldName] || [];
      const newSubFields = currentSubFields.includes(subField)
        ? currentSubFields.filter(sf => sf !== subField)
        : [...currentSubFields, subField];
      
      // 세부 분야가 모두 해제되면 필드도 비활성화
      if (newSubFields.length === 0) {
        setEnabledFields(prev => prev.filter(f => f.name !== fieldName));
        const { [fieldName]: removed, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [fieldName]: newSubFields
      };
    });
  };

  return (
    <main className="flex min-h-screen">
      <ResearchFieldSelector 
        onFieldToggle={handleFieldToggle}
        onSubFieldToggle={handleSubFieldToggle}
        enabledFields={enabledFields}
        selectedSubFields={selectedSubFields}
      />
      <div className="flex-1">
        <UniversityRankings 
          selectedSubFields={selectedSubFields}
          enabledFields={enabledFields}
        />
      </div>
    </main>
  );
}
