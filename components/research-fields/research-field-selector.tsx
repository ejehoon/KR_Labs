'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { RESEARCH_CATEGORIES } from '@/lib/constants';
import { ResearchField } from '@/lib/types';

type ResearchFieldSelectorProps = {
  onSubFieldSelect: (subField: string | null) => void;
  onFieldToggle: (field: ResearchField) => void;
  enabledFields: ResearchField[];
};

export default function ResearchFieldSelector({ 
  onSubFieldSelect, 
  onFieldToggle,
  enabledFields 
}: ResearchFieldSelectorProps) {
  const [categories] = useState(RESEARCH_CATEGORIES);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [expandedFields, setExpandedFields] = useState<string[]>([]);
  const [selectedSubField, setSelectedSubField] = useState<string | null>(null);

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

  const toggleFieldEnabled = (field: ResearchField) => {
    if (!isFieldEnabled(field.name)) {
      setSelectedSubField(null);
      onSubFieldSelect(null);
    }
    onFieldToggle(field);
  };

  const isFieldEnabled = (fieldName: string) => {
    return enabledFields.some(field => field.name === fieldName);
  };

  const handleSubFieldClick = (subField: string) => {
    if (selectedSubField === subField) {
      setSelectedSubField(null);
      onSubFieldSelect(null);
    } else {
      setSelectedSubField(subField);
      onSubFieldSelect(subField);
    }
  };

  return (
    <div className="w-80 bg-background border-r min-h-screen">
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-4">연구 분야</h2>
        <div className="space-y-2">
          {categories.map((category, categoryIndex) => (
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
                  {category.fields.map((field) => (
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
                          onClick={() => toggleFieldEnabled(field)}
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
                              onClick={() => handleSubFieldClick(subField)}
                              className={`w-full text-left p-2 text-sm rounded-lg hover:bg-accent hover:text-accent-foreground ${
                                selectedSubField === subField
                                  ? 'bg-accent text-accent-foreground'
                                  : ''
                              }`}
                            >
                              {subField}
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