'use client';

import { useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function DrOhChat() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '오늘의 연구실은 뭘까~~~요?'
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    try {
      setIsLoading(true);
      
      // 사용자 메시지 추가
      const userMessage: Message = { role: 'user', content: inputMessage };
      setMessages(prev => [...prev, userMessage]);
      setInputMessage('');

      // API 호출
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messages.concat(userMessage)
        }),
      });

      if (!response.ok) throw new Error('API 요청 실패');

      const data = await response.json();
      
      // 챗봇 응답 추가
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.content
      }]);

    } catch (error) {
      console.error('채팅 에러:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '죄송합니다. 오류가 발생했습니다. 다시 시도해주세요.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

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
          <div className="h-[400px] p-4 overflow-y-auto">
            <div className="flex flex-col space-y-4">
              {messages.map((message, index) => (
                <div key={index} className={`flex items-end gap-2 ${
                  message.role === 'assistant' ? '' : 'flex-row-reverse'
                }`}>
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8">
                      <img 
                        src="/images/Dr_Oh.png"
                        alt="Dr_Oh" 
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                  <div className={`rounded-lg p-3 max-w-[80%] ${
                    message.role === 'assistant' 
                      ? 'bg-gray-100 rounded-bl-none' 
                      : 'bg-blue-500 text-white rounded-br-none'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex items-end gap-2">
                  <div className="w-8 h-8">
                    <img 
                      src="/images/Dr_Oh.png"
                      alt="Dr_Oh" 
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="bg-gray-100 rounded-lg rounded-bl-none p-3">
                    <p className="text-sm">답변을 작성중입니다...</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 입력창 */}
          <div className="p-3 border-t bg-white">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="메시지를 입력하세요..."
                className="flex-1 p-2 text-sm border rounded-md"
              />
              <button 
                onClick={handleSendMessage}
                disabled={isLoading || !inputMessage.trim()}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  isLoading || !inputMessage.trim()
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
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
            src="/images/Dr_Oh.png"
            alt="Dr_Oh 챗봇"
            className="w-full h-full object-contain"
          />
        </div>
        <div className="bg-white/80 backdrop-blur-sm p-2 rounded-lg shadow-lg">
          <p className="text-xs font-medium text-gray-900">
            오박사님께 질문하기
          </p>
          <p className="text-[10px] text-gray-500">
            연구실 관련 궁금한 점을 물어보세요!
          </p>
        </div>
      </div>
    </div>
  );
} 