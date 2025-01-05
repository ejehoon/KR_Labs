'use client';

import { useState } from 'react';

export default function DrOhChat() {
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* 채팅 말풍선 */}
      {isChatOpen && (
        <div className="mb-4 w-[300px] bg-white rounded-lg shadow-lg overflow-hidden">
          {/* 채팅 헤더 */}
          <div className="bg-gray-50 p-3 border-b flex justify-between items-center">
            <h3 className="font-medium text-sm">오박사님과의 대화</h3>
            <button 
              onClick={() => setIsChatOpen(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          
          {/* 채팅 내용 */}
          <div className="h-[300px] p-4 overflow-y-auto">
            <div className="flex flex-col space-y-4">
              <div className="flex items-end gap-2">
                <div className="w-8 h-8">
                  <img 
                    src="/images/Dr_sry.png"
                    alt="Dr_Oh" 
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="bg-gray-100 rounded-lg rounded-bl-none p-3 max-w-[80%]">
                  <p className="text-sm">
                    죄송합니다. 현재 서비스 준비중입니다. <br/>
                    RAG 기술을 활용한 챗봇 서비스를 준비중입니다.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 입력창 */}
          <div className="p-3 border-t bg-white">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="서비스 준비중입니다..."
                className="flex-1 p-2 text-sm border rounded-md bg-gray-50"
                disabled
              />
              <button 
                className="px-3 py-2 rounded-md text-sm font-medium bg-gray-200 text-gray-500 cursor-not-allowed"
                disabled
              >
                전송
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 오박사님 아이콘 */}
      <div className="flex items-center gap-2 flex-row-reverse">
        <div 
          className={`w-[80px] h-[80px] cursor-pointer transition-all duration-300
            ${!isChatOpen ? 'hover:scale-110 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.5)]' : ''}
          `}
          onClick={() => setIsChatOpen(!isChatOpen)}
        >
          <img
            src={isChatOpen ? "/images/Dr_sry.png" : "/images/Dr_Oh.png"}
            alt="Dr_Oh 챗봇"
            className="w-full h-full object-contain"
          />
        </div>
        <div className="bg-white/80 backdrop-blur-sm p-2 rounded-lg shadow-lg">
          <p className="text-xs font-medium text-gray-900">
            {isChatOpen ? "서비스 준비중" : "오박사님께 질문하기"}
          </p>
          <p className="text-[10px] text-gray-500">
            {isChatOpen 
              ? "곧 찾아뵙겠습니다 :)" 
              : "연구실 관련 궁금한 점을 물어보세요!"
            }
          </p>
        </div>
      </div>
    </div>
  );
} 