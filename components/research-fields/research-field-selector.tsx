'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Check, Search } from 'lucide-react';
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
    <div className="w-[280px] min-h-screen bg-white border-r">
      <div className="p-4">
        <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-2 mb-4">
          <Search className="h-4 w-4 text-gray-500" />
          <input
            type="text"
            placeholder="연구 분야"
            className="bg-transparent w-full text-sm focus:outline-none"
          />
        </div>

        <div className="space-y-2">
          {categories.map((category: ResearchCategory) => (
            <div key={category.name} className="space-y-1">
              <button
                onClick={() => toggleCategory(category.name)}
                className="flex items-center w-full text-left p-2 hover:bg-gray-100 rounded text-sm font-medium"
              >
                {expandedCategories.includes(category.name) ? (
                  <ChevronDown className="h-4 w-4 mr-2 text-gray-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 mr-2 text-gray-500" />
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
                          className="flex items-center flex-1 p-2 hover:bg-gray-100 rounded text-sm"
                        >
                          {expandedFields.includes(field.name) ? (
                            <ChevronDown className="h-3 w-3 mr-2 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-3 w-3 mr-2 text-gray-400" />
                          )}
                          <span className="truncate">{field.name}</span>
                        </button>
                        <button
                          onClick={() => onFieldToggle(field)}
                          className="px-2 py-1 text-xs font-medium rounded"
                        >
                          <span className={`inline-block px-2 py-0.5 rounded
                            ${isFieldEnabled(field.name) 
                              ? 'bg-blue-100 text-blue-700' 
                              : 'bg-gray-100 text-gray-500'}`}
                          >
                            {isFieldEnabled(field.name) ? 'ON' : 'OFF'}
                          </span>
                        </button>
                      </div>
                      
                      {expandedFields.includes(field.name) && (
                        <div className="ml-6 space-y-1">
                          {field.subFields.map((subField) => (
                            <button
                              key={subField}
                              onClick={() => onSubFieldToggle(field.name, subField)}
                              className={`w-full text-left p-2 text-sm rounded
                                ${isSubFieldSelected(field.name, subField)
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'hover:bg-gray-100'
                                }`}
                            >
                              <span className="truncate">{subField}</span>
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