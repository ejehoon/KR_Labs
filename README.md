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

## 시스템 아키텍처 및 자동화 로직 🔄

### 데이터 수집 자동화 파이프라인

![자동화 파이프라인 구조도](https://github.com/ejehoon/KR_Labs/blob/main/public/images/%EC%A7%84%ED%96%89%EC%A4%91%EC%9D%B8_%EC%9E%90%EB%8F%99%ED%99%94.png)

### 자동화 프로세스 상세

1. **데이터 소스**
   - Google Spreadsheet에 연구실 웹사이트 링크 저장
   - Make를 활용한 자동화 워크플로우 구축

2. **데이터 전처리**
   - HTTP/Text Parser를 통한 웹페이지 컨텐츠 정제
   - GPT 토큰 사용 최적화 및 정확도 향상

3. **정보 추출 (GPT)**
   - 연구실 웹페이지에서 교수 정보 추출
   - 논문 정보 및 연구 분야 분석
   - JSON 형식으로 데이터 구조화

4. **데이터 검증 및 보강**
   - Selenium을 활용한 자동화된 데이터 검증
   - Docker 컨테이너를 통한 안정적인 실행 환경 제공
   - AWS Lambda를 통한 서버리스 실행

5. **데이터 저장**
   - 검증된 데이터를 Google Spreadsheet에 임시 저장
   - Supabase 데이터베이스에 최종 데이터 적재

### 수집 데이터 항목
- 교수 기본 정보
- Google Scholar 프로필
- DBLP 프로필
- 논문 수
- 연구실 구성원 수
- 주요 연구 분야

### 개발 진행 상황
- [x] 기본 자동화 파이프라인 구축
- [x] HTTP/Text Parser 구현
- [x] GPT 연동 및 데이터 추출 로직
- [ ] Docker 이미지 최적화 (진행중)
- [ ] 논문 정보 부재 시 대체 로직 구현 (예정)
