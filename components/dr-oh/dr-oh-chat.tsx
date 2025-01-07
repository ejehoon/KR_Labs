'use client';

import { useState, useRef, useEffect } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function DrOhChat() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isChatOpen && messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: '오늘의 연구실은 뭘까~~~요?\n\n관심 있는 연구 분야나 키워드를 알려주시면 맞춤형 연구실을 추천해드릴게오~박사'
        }
      ]);
    }
  }, [isChatOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage.content }),
      });

      if (!response.ok) throw new Error('응답에 실패했습니다.');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('스트림을 읽을 수 없습니다.');

      let assistantMessage = '';
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = new TextDecoder().decode(value);
        assistantMessage += text;

        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: assistantMessage },
        ]);
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '죄송합니다. 오류가 발생했습니다.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isChatOpen && (
        <div className="mb-4 w-[300px] bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="bg-gray-50 p-3 border-b flex justify-between items-center">
            <h3 className="font-medium text-sm">오박사님과의 대화</h3>
            <button 
              onClick={() => {
                setIsChatOpen(false);
                setMessages([]);
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          
          <div className="h-[300px] p-4 overflow-y-auto">
            <div className="flex flex-col space-y-4">
              {messages.map((message, index) => (
                <div key={index} className={`flex items-end gap-2 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
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
                    message.role === 'user' 
                      ? 'bg-blue-500 text-white rounded-br-none'
                      : 'bg-gray-100 rounded-bl-none'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-3 border-t bg-white">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="메시지를 입력하세요..."
                className="flex-1 p-2 text-sm border rounded-md"
                disabled={isLoading}
              />
              <button 
                type="submit"
                disabled={isLoading}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  isLoading 
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                전송
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex items-center gap-2 flex-row-reverse">
        <div 
          className={`w-[80px] h-[80px] cursor-pointer transition-all duration-300
            ${!isChatOpen ? 'hover:scale-110 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.5)]' : ''}
          `}
          onClick={() => setIsChatOpen(!isChatOpen)}
        >
          <img
            src={isChatOpen ? "/images/Dr_Oh.png" : "/images/Dr_Oh.png"}
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