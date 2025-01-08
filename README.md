# KR-rankings (한국 대학 연구실 순위)

[KR-rankings 웹사이트 미리보기](https://kr-labstest.vercel.app/)

## 프로젝트 소개 👋

안녕하세요! 이 프로젝트는 한국 대학의 컴퓨터공학 분야 연구실들을 쉽게 찾아볼 수 있도록 만든 웹 애플리케이션입니다. 
대학원 진학을 고민하며, 각 대학의 연구실 정보를 일일이 찾아보는 것이 불편하다고 느껴 이 프로젝트를 시작하게 되었습니다.


## 주요 기능 🚀

### 1. 연구 분야별 필터링
- CS 분야의 세부 카테고리(AI, Systems, Theory, Interdisciplinary Areas)별로 연구실 검색
- 각 카테고리의 세부 연구 분야별 필터링 가능
- ON/OFF 토글로 빠른 필터링

### 2. 대학 순위 확인
- DBLP 저널 수 기반 순위 제공
- 연구실 규모 정보 제공 (대형/중형/소형)
- 선택한 연구 분야에 따른 맞춤형 순위 확인

### 3. 교수/연구실 정보
- 교수별 상세 정보 (논문 수, 연구원 수, 연구 분야)
- 연구실 홈페이지 링크
- Google Scholar 프로필 연동
- DBLP 프로필 연동

### 4. 사용자 기능 (Coming Soon)
- 이메일/카카오톡 소셜 로그인
- 관심 연구실 즐겨찾기
- AI 챗봇을 통한 연구실 추천 및 정보 제공

## 기술 스택 💻

### Frontend
- Next.js 14 (App Router)
- React
- TypeScript
- TailwindCSS
- ShadCN UI

### Backend & Database
- Supabase (PostgreSQL)
- NextAuth.js (인증)

### AI & 챗봇
- LangChain
- OpenAI API
- RAG (Retrieval Augmented Generation)

### Deployment & Automation
- Vercel
- Make (크롤링 자동화)

## 현재 개발 진행 상황 📝

### 완료 ✅
- [x] ~~MVP 버전 개발 완료~~ (2025.01.02)
- [x] ~~Supabase 데이터베이스 설계 및 구축~~ (2025.01.01)
- [x] ~~대학/교수 정보 초기 데이터 수집~~


### 진행중 🚧
- [ ] 대학/교수 정보 데이터 수집
- [ ] 크롤링 자동화 시스템
- [ ] 기본 검색 및 필터링 시스템 구현
- [ ] 사용자 인증 시스템 (이메일/카카오톡 로그인)
- [ ] RAG 기반 AI 챗봇 도우미


### 예정 📅
- [ ] 연구실 즐겨찾기 기능
- [ ] 연구실 리뷰 기능
- [ ] 연구 분야 트렌드 분석
- [ ] 모바일 최적화
- [ ] 영문 버전 지원
- [ ] 데이터 자동 업데이트 파이프라인

## 기여하기 🤝

이 프로젝트는 개발 진행 중이며, 개선의 여지가 많습니다. 버그 리포트, 새로운 기능 제안, PR 모두 환영합니다!

## 연락처 📧

프로젝트에 대한 문의나 제안이 있으시다면 언제든 연락주세요!
- Email: kaak2203@naver.com
