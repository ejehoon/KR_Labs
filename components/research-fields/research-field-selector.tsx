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
    <div className="w-80 bg-background border-r min-h-screen">
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-4">연구 분야</h2>
        <div className="space-y-2">
          {categories.map((category: ResearchCategory) => (
            <div key={category.name} className="space-y-1">
              <button
                onClick={() => toggleCategory(category.name)}
                className="flex items-center w-full hover:bg-accent hover:text-accent-foreground rounded-lg p-2 text-sm font-medium"
              >
                {expandedCategories.includes(category.name) ? (
                  <ChevronDown className="h-4 w-4 mr-1" />
                ) : (
                  <ChevronRight className="h-4 w-4 mr-1" />
                )}
                {category.name}
              </button>
              
              {expandedCategories.includes(category.name) && (
                <div className="ml-4 space-y-1">
                  {category.fields.map((field: ResearchField) => (
                    <div key={field.name} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => toggleField(field.name)}
                          className="flex items-center hover:bg-accent hover:text-accent-foreground rounded-lg p-2 text-sm"
                        >
                          {expandedFields.includes(field.name) ? (
                            <ChevronDown className="h-4 w-4 mr-1" />
                          ) : (
                            <ChevronRight className="h-4 w-4 mr-1" />
                          )}
                          {field.name}
                        </button>
                        <button
                          onClick={() => onFieldToggle(field)}
                          className="p-2 hover:bg-accent rounded-lg"
                        >
                          {isFieldEnabled(field.name) ? (
                            <span className="text-green-500">[ON]</span>
                          ) : (
                            <span className="text-gray-400">[OFF]</span>
                          )}
                        </button>
                      </div>
                      
                      {expandedFields.includes(field.name) && (
                        <div className="ml-6 space-y-1">
                          {field.subFields.map((subField) => (
                            <button
                              key={subField}
                              onClick={() => onSubFieldToggle(field.name, subField)}
                              className={`w-full flex items-center justify-between p-2 text-sm rounded-lg hover:bg-accent hover:text-accent-foreground ${
                                isSubFieldSelected(field.name, subField)
                                  ? 'bg-accent text-accent-foreground'
                                  : ''
                              }`}
                            >
                              <span>{subField}</span>
                              {isSubFieldSelected(field.name, subField) && (
                                <Check className="h-4 w-4" />
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