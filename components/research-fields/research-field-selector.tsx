'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import { RESEARCH_CATEGORIES, ResearchCategory } from '@/lib/constants';
import { ResearchField, SelectedSubFields } from '@/lib/types';

type ResearchFieldSelectorProps = {
  onFieldToggle: (field: ResearchField) => void;
  onSubFieldToggle: (fieldName: string, subField: string) => void;
  enabledFields: ResearchField[];
  selectedSubFields: SelectedSubFields;
};

export default function ResearchFieldSelector({ 
  onFieldToggle,
  onSubFieldToggle,
  enabledFields,
  selectedSubFields
}: ResearchFieldSelectorProps) {
  const [categories] = useState<ResearchCategory[]>(RESEARCH_CATEGORIES);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['CS']);
  const [expandedFields, setExpandedFields] = useState<string[]>([]);

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories(prev =>
      prev.includes(categoryName)
        ? prev.filter(c => c !== categoryName)
        : [...prev, categoryName]
    );
  };

  const toggleField = (fieldName: string) => {
    setExpandedFields(prev =>
      prev.includes(fieldName)
        ? prev.filter(f => f !== fieldName)
        : [...prev, fieldName]
    );
  };

  const isFieldEnabled = (fieldName: string) => {
    return enabledFields.some(field => field.name === fieldName);
  };

  const isSubFieldSelected = (fieldName: string, subField: string) => {
    return selectedSubFields[fieldName]?.includes(subField) || false;
  };

  return (
    <div className="w-[360px] min-h-screen">
      <div className="p-6">
        <h2 className="text-xl font-bold mb-6 text-[#1A237E] flex items-center">
          <span className="bg-white rounded-full p-2 mr-2">
            🔍
          </span>
          연구 분야
        </h2>
        <div className="space-y-2 bg-white/20 rounded-xl p-4 backdrop-blur-sm">
          {categories.map((category: ResearchCategory) => (
            <div key={category.name} className="space-y-1">
              <button
                onClick={() => toggleCategory(category.name)}
                className="flex items-center w-full hover-effect rounded-lg p-3 text-sm font-bold
                  bg-white/70 hover:bg-[#FFF8E1] hover:text-[#F57F17] transition-all
                  shadow-sm hover:shadow"
              >
                {expandedCategories.includes(category.name) ? (
                  <ChevronDown className="h-4 w-4 mr-2 text-[#F57F17]" />
                ) : (
                  <ChevronRight className="h-4 w-4 mr-2 text-[#F57F17]" />
                )}
                {category.name}
              </button>
              
              {expandedCategories.includes(category.name) && (
                <div className="ml-4 space-y-1">
                  {category.fields.map((field: ResearchField) => (
                    <div key={field.name} className="space-y-1">
                      <div className="flex items-center justify-between group">
                        <button
                          onClick={() => toggleField(field.name)}
                          className="flex items-center flex-1 hover-effect rounded-lg p-2.5 text-sm min-w-0"
                        >
                          {expandedFields.includes(field.name) ? (
                            <ChevronDown className="h-4 w-4 mr-2 text-[#F57F17]/70 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 mr-2 text-[#F57F17]/70 flex-shrink-0" />
                          )}
                          <span className="truncate leading-normal">{field.name}</span>
                        </button>
                        <button
                          onClick={() => onFieldToggle(field)}
                          className="p-1.5 rounded-full hover-effect ml-2 flex-shrink-0"
                        >
                          <span className={`inline-block px-3 py-1 text-xs font-bold rounded-full whitespace-nowrap
                            ${isFieldEnabled(field.name) 
                              ? 'bg-[#F57F17] text-white' 
                              : 'bg-gray-200 text-gray-500'}`}
                          >
                            {isFieldEnabled(field.name) ? 'ON' : 'OFF'}
                          </span>
                        </button>
                      </div>
                      
                      {expandedFields.includes(field.name) && (
                        <div className="ml-6 space-y-1 animate-slideDown">
                          {field.subFields.map((subField) => (
                            <button
                              key={subField}
                              onClick={() => onSubFieldToggle(field.name, subField)}
                              className={`w-full flex items-center justify-between p-2.5 text-sm rounded-lg
                                hover-effect transition-all
                                ${isSubFieldSelected(field.name, subField)
                                  ? 'bg-[#FFF8E1] text-[#F57F17] font-bold shadow-sm'
                                  : 'hover:bg-[#FFF8E1] hover:text-[#F57F17]'
                                }`}
                            >
                              <span className="truncate mr-2">{subField}</span>
                              {isSubFieldSelected(field.name, subField) && (
                                <Check className="h-4 w-4 flex-shrink-0 text-[#F57F17]" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 