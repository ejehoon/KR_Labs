'use client';

import React, { useState } from 'react';
import ResearchFieldSelector from '@/components/research-fields/research-field-selector';
import UniversityRankings from '@/components/university/university-rankings';
import { ResearchField } from '@/lib/types';

export default function Home() {
  const [selectedSubField, setSelectedSubField] = useState<string | null>(null);
  const [enabledFields, setEnabledFields] = useState<ResearchField[]>([]);

  const handleFieldToggle = (field: ResearchField) => {
    setEnabledFields(prev => {
      const existingFieldIndex = prev.findIndex(f => f.name === field.name);
      if (existingFieldIndex >= 0) {
        // 이미 있는 필드라면 제거
        return prev.filter(f => f.name !== field.name);
      } else {
        // 없는 필드라면 추가
        return [...prev, { ...field, isEnabled: true }];
      }
    });
  };

  return (
    <main className="flex min-h-screen">
      <ResearchFieldSelector 
        onSubFieldSelect={setSelectedSubField}
        onFieldToggle={handleFieldToggle}
        enabledFields={enabledFields}
      />
      <div className="flex-1">
        <UniversityRankings 
          selectedSubField={selectedSubField}
          enabledFields={enabledFields}
        />
      </div>
    </main>
  );
}
