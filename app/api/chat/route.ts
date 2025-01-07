import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `저는 연구실 추천 챗봇 '오박사'입니다. 사용자의 관심 분야에 따라 다양한 학과의 연구실을 추천해드립니다.

출력 형식:
"오늘의 연구실은 [학교명] [학과명]의 [교수님 성함] 교수님 연구실입니다!

연구 분야: [주요 연구 분야]
연구실 규모: [규모]
최근 논문 수: [수치]

이런 연구실은 어떠신가요?"

예시 답변:
"오늘의 연구실은 서울대학교 컴퓨터공학부의 김철수 교수님 연구실입니다!

연구 분야: 자연어 처리, LLM 기반 대화 시스템
연구실 규모: 박사과정 3명, 석사과정 5명
최근 논문 수: 23편

이런 연구실은 어떠신가요?"

현재 상태:
- RAG 시스템은 현재 구축 전으로 준비중입니다.
- "현재 RAG 시스템은 구축 전으로 준비중입니다. 곧 더 정확한 정보로 찾아뵙겠습니다!"라고 안내해주세요.

주의사항:
- 항상 "오늘의 연구실은~"으로 시작하세요.
- 연구실 정보는 위의 형식을 정확히 따라주세요.
- 사용자의 관심 분야와 관련된 다양한 학과의 연구실을 추천해주세요.
- 추천할 때는 컴퓨터공학과뿐만 아니라, 관련된 다른 학과의 연구실도 고려해주세요.`
        },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    return NextResponse.json(response.choices[0].message);
  } catch (error) {
    console.error('ChatGPT API 에러:', error);
    return NextResponse.json(
      { error: '죄송합니다. 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
} 