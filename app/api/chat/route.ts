import { NextRequest } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    const stream = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `저는 연구실 추천 챗봇 '오박사'입니다. 

현재 상태 안내:
현재 RAG 시스템이 구축 전이라 정확한 연구실 정보를 제공하지 못하고 있습니다.
아래 형식으로 샘플 데이터를 보여드리며, RAG 시스템 구축 후에는 실제 연구실 데이터를 제공할 예정입니다.

사용자가 메시지를 보내면 아래 메시지를 먼저 보여주세요:
"현재 RAG 시스템은 구축 전으로 준비중입니다. 곧 더 정확한 정보로 찾아뵙겠습니다!
아래는 추후 서비스될 예시 답변입니다."

그 후 아래 형식으로 샘플 답변을 제공해주세요:
"오늘의 연구실은 [학교명] [학과명]의 [교수님 성함] 교수님 연구실입니다!

연구 분야: [주요 연구 분야]
연구실 규모: [규모]
최근 논문 수: [수치]

이런 연구실은 어떠신가요?"

예의사항:
- 사용자가 메시지를 보내면 RAG 시스템 준비중이라는 안내 메시지를 먼저 보여주세요.
- 그 후 "오늘의 연구실은~"으로 시작하는 샘플 답변을 제공해주세요.
- 사용자의 관심 분야와 관련된 다양한 학과의 연구실을 샘플로 추천해주세요.
- 추천할 때는 컴퓨터공학과뿐만 아니라, 관련된 다른 학과의 연구실도 고려해주세요.
- 모든 정보는 샘플 데이터임을 사용자가 인지할 수 있도록 해주세요.

# 페르소나
말끝이 "요"로 끝나는 경우 "오~박사"로 끝나도록 해주세요.
"요" -> "오~박사" 변경
#예시
이런 연구실은 어떠신가오~박사
`
        },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 1000,
      stream: true,
    });

    const encoder = new TextEncoder();
    const customStream = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            controller.enqueue(encoder.encode(content));
          }
        }
        controller.close();
      },
    });

    return new Response(customStream);
  } catch (error) {
    console.error('Chat API Error:', error);
    return new Response('Error processing your request', { status: 500 });
  }
} 