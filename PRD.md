# PRD.md — KR_Labs / 대학원랭킹

## 0. 문서 목적

이 문서는 Codex가 `KR_Labs` 프로젝트를 단계적으로 구현할 수 있도록 작성된 제품 요구사항 문서다. 전체 서비스의 장기 목표는 **대학원 진학 희망자가 관심 연구주제에 맞는 연구실·교수·논문을 찾도록 돕는 LLM 추천 서비스**를 만드는 것이다.

다만 현재 1차 개발 범위는 추천 UI가 아니라, 서비스의 기반이 되는 **공개 연구실 정보 크롤링·정제·저장·검증 시스템** 구축이다.

Codex는 이 문서를 기준으로 다음 순서대로 개발한다.

1. Supabase 데이터베이스 스키마 구축
2. Playwright 기반 학교별 크롤러 프레임워크 구축
3. 서울대, 연세대, 고려대, KAIST 등 학교별 크롤러를 하나씩 추가할 수 있는 구조 구현
4. 수집 결과를 Supabase에 저장하고 검증 리포트를 생성
5. 검증 완료 후 월 1회 연구실 홈페이지를 재크롤링하는 업데이트 잡 구현
6. 이후 LLM 기반 연구분야 분류, 검색, 추천, RAG 기능으로 확장

---

## 1. 제품 개요

### 1.1 제품명

- 내부 프로젝트명: `KR_Labs`
- 서비스명 후보: `대학원랭킹`

### 1.2 한 줄 소개

대학원 진학 희망자가 관심 연구주제에 맞는 연구실, 교수, 최근 논문을 탐색하고 비교할 수 있도록 돕는 연구실 인텔리전스 서비스.

### 1.3 핵심 사용자

- 대학원 진학을 고민하는 학부생
- 졸업 후 석사·박사 진학을 준비하는 예비 지원자
- 연구 경험이 부족해 관심 키워드와 실제 연구실을 연결하기 어려운 사용자
- 특정 학과명보다 연구주제 중심으로 연구실을 탐색하고 싶은 사용자

### 1.4 해결하려는 문제

현재 대학원 연구실 정보는 학교 홈페이지, 학과 홈페이지, 교수 소개 페이지, 연구실 홈페이지, 논문 검색 사이트 등에 흩어져 있다. 학교마다 정보 구조가 다르고, 교수 소개 페이지가 최신 연구주제를 반영하지 못하는 경우도 많다.

특히 LLM, 멀티모달, AI 에이전트, HCI, 데이터사이언스, 계산언어학처럼 여러 학과에 걸쳐 존재하는 연구주제는 학과명만으로 탐색하기 어렵다. 결과적으로 사용자는 수작업으로 여러 사이트를 돌아다니며 정보를 비교해야 하며, 주변에 대학원 경험자가 없는 학생은 정보 격차를 크게 겪는다.

KR_Labs는 공개된 연구실 정보를 수집·정제·분류하고, 사용자의 관심 연구주제와 조건에 맞는 연구실 후보를 추천해 이 탐색 비용을 줄인다.

---

## 2. 현재 개발 범위

### 2.1 이번 PRD의 1차 목표

이번 PRD의 1차 목표는 **연구실 크롤링 파이프라인 MVP**를 구현하는 것이다.

1차 목표에 포함되는 기능은 다음과 같다.

- Supabase 테이블 설계 및 마이그레이션
- 학교별 크롤러 실행 구조
- Playwright 기반 페이지 탐색 및 정보 추출
- 학교 → 학과 → 교수 → 연구실 → 논문/키워드 후보 수집
- 수집 결과 Supabase upsert
- 원본 페이지 텍스트/메타데이터 저장
- 크롤링 작업 로그 및 에러 로그 저장
- 수집 결과 검증용 CLI 리포트 생성
- 월 1회 기존 연구실 URL 재크롤링 잡 구현

### 2.2 이번 PRD에서 제외하는 기능

아래 기능은 장기 로드맵에 포함되지만, 크롤링 MVP 이후에 구현한다.

- 일반 사용자용 검색 UI
- LLM 챗봇/RAG 추천 UI
- 개인화 추천 리포트
- 결제/구독 기능
- 대학·연구실 B2B 광고/제휴 기능
- 커뮤니티 리뷰 기능
- 입시 합격 가능성 예측
- 비공개 정보 또는 로그인 필요한 정보 수집

---

## 3. 기술 스택 및 원칙

### 3.1 권장 기술 스택

- Language: TypeScript
- Runtime: Node.js
- Crawler: Playwright
- DB/BaaS: Supabase Postgres
- Validation: Zod
- Package manager: pnpm
- Scheduling: GitHub Actions cron, Vercel Cron, Cloud Run Jobs 중 하나
- Optional later: Supabase Storage, Supabase Vector, embedding API, LLM API

### 3.2 중요한 구현 원칙

- 크롤러는 한 번에 모든 학교를 완벽하게 처리하려 하지 않는다.
- `학교별 설정 + 공통 크롤러 엔진 + 학교별 override` 구조로 만든다.
- 먼저 한 학교를 끝까지 수집·저장·검증할 수 있게 만든 뒤 다른 학교를 추가한다.
- 수집 데이터는 항상 source URL, crawled_at, confidence_score를 함께 저장한다.
- 구조화 추출 결과가 불확실하면 임의로 확정하지 말고 `needs_review` 상태로 저장한다.
- 기존 데이터를 삭제하지 말고 inactive 또는 stale 상태로 표시한다.
- 월간 업데이트는 모든 학교 홈페이지를 다시 탐색하는 것이 아니라, 이미 확보한 교수/연구실 URL을 중심으로 변경 여부를 확인한다.

### 3.3 크롤링 윤리 및 제한

- 공개 웹페이지만 수집한다.
- 로그인, 세션 우회, 캡차 우회, 비공개 API 호출은 하지 않는다.
- robots.txt 및 사이트 접근 정책을 최대한 존중한다.
- 요청 간 지연 시간과 동시성 제한을 둔다.
- 유저 에이전트를 명시한다.
- 사람에게 민감할 수 있는 정보는 최소 수집한다.
- 교수명, 소속, 공식 이메일, 연구분야, 연구실 URL, 공개 논문 정보처럼 연구실 탐색에 필요한 공개 정보만 저장한다.
- 논문 PDF 전문이나 유료 논문 전문을 저장하지 않는다.

---

## 4. 사용자 시나리오

### 4.1 장기 사용자 시나리오

사용자는 “LLM 기반 에이전트 연구를 하고 싶다”라고 입력한다. 서비스는 관련 연구실을 학과명에 제한하지 않고 탐색한다. 컴퓨터공학과뿐 아니라 언어학과, 산업공학과, 데이터사이언스대학원, AI대학원 등 관련 연구가 있는 연구실을 함께 보여준다.

각 추천 결과에는 다음 정보가 포함된다.

- 학교
- 학과
- 교수명
- 연구실명
- 연구실 홈페이지
- 최근 연구 키워드
- 최근 논문
- 추천 이유
- 데이터 출처 URL
- 마지막 업데이트 날짜

### 4.2 현재 MVP 시나리오

관리자는 다음 명령어로 특정 학교의 크롤링을 실행한다.

```bash
pnpm crawl:school --school=snu --mode=discover
```

크롤러는 해당 학교의 공식 홈페이지와 학과/교수/연구실 페이지를 탐색하고, 발견한 정보를 Supabase에 저장한다.

관리자는 다음 명령어로 결과를 검증한다.

```bash
pnpm crawl:validate --school=snu
```

검증 리포트에는 수집된 학과 수, 교수 수, 연구실 수, URL 성공률, 중복 후보, low confidence 항목, 에러 목록이 포함된다.

검증이 끝난 학교는 월간 업데이트 대상에 포함된다.

```bash
pnpm crawl:update-labs --school=snu
```

---

## 5. 기능 요구사항

## 5.1 Supabase 스키마 구축

Codex는 `supabase/migrations`에 SQL 마이그레이션을 작성한다.

### 5.1.1 universities

대학교 정보를 저장한다.

필드:

- `id uuid primary key default gen_random_uuid()`
- `slug text unique not null` 예: `snu`, `yonsei`, `korea`, `kaist`
- `name_ko text not null`
- `name_en text`
- `homepage_url text not null`
- `country text default 'KR'`
- `is_active boolean default true`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### 5.1.2 departments

학과/대학원/전공 정보를 저장한다.

필드:

- `id uuid primary key default gen_random_uuid()`
- `university_id uuid references universities(id) on delete cascade`
- `name_ko text`
- `name_en text`
- `college_name text`
- `homepage_url text`
- `source_url text`
- `crawl_confidence numeric default 0`
- `status text default 'active'` values: `active`, `stale`, `inactive`, `needs_review`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Unique 후보:

- `(university_id, homepage_url)`
- 또는 `(university_id, name_ko, name_en)`

### 5.1.3 professors

교수 정보를 저장한다.

필드:

- `id uuid primary key default gen_random_uuid()`
- `university_id uuid references universities(id) on delete cascade`
- `department_id uuid references departments(id) on delete set null`
- `name_ko text`
- `name_en text`
- `title text`
- `email text`
- `profile_url text`
- `lab_url text`
- `research_interests text[] default '{}'`
- `source_url text`
- `crawl_confidence numeric default 0`
- `status text default 'active'`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Unique 후보:

- `(university_id, email)` when email is not null
- `(university_id, profile_url)` when profile_url is not null
- `(university_id, department_id, name_ko, name_en)`

### 5.1.4 labs

연구실 정보를 저장한다.

필드:

- `id uuid primary key default gen_random_uuid()`
- `university_id uuid references universities(id) on delete cascade`
- `department_id uuid references departments(id) on delete set null`
- `professor_id uuid references professors(id) on delete set null`
- `name_ko text`
- `name_en text`
- `homepage_url text`
- `description text`
- `research_keywords text[] default '{}'`
- `normalized_keywords text[] default '{}'`
- `source_url text`
- `last_crawled_at timestamptz`
- `last_changed_at timestamptz`
- `content_hash text`
- `crawl_confidence numeric default 0`
- `status text default 'active'`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Unique 후보:

- `(university_id, homepage_url)` where homepage_url is not null
- `(university_id, professor_id)` where professor_id is not null

### 5.1.5 publications

논문 후보 정보를 저장한다. 초기에는 완벽한 논문 DB가 아니라 연구실/교수 페이지에서 발견한 공개 논문 메타데이터 후보를 저장한다.

필드:

- `id uuid primary key default gen_random_uuid()`
- `university_id uuid references universities(id) on delete cascade`
- `lab_id uuid references labs(id) on delete set null`
- `professor_id uuid references professors(id) on delete set null`
- `title text not null`
- `authors text[] default '{}'`
- `venue text`
- `year int`
- `doi text`
- `url text`
- `abstract text`
- `source text` 예: `lab_page`, `professor_page`, `crossref`, `semantic_scholar_later`
- `source_url text`
- `crawl_confidence numeric default 0`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Unique 후보:

- `doi` where doi is not null
- `(professor_id, title, year)`

### 5.1.6 crawl_jobs

크롤링 실행 단위를 기록한다.

필드:

- `id uuid primary key default gen_random_uuid()`
- `job_type text not null` values: `discover_school`, `update_labs`, `validate`, `backfill`
- `school_slug text`
- `status text not null` values: `pending`, `running`, `success`, `failed`, `partial_success`
- `started_at timestamptz default now()`
- `finished_at timestamptz`
- `metrics jsonb default '{}'`
- `error_count int default 0`
- `created_by text default 'system'`

### 5.1.7 crawl_pages

크롤링한 원본 페이지의 텍스트, 해시, 메타데이터를 저장한다.

필드:

- `id uuid primary key default gen_random_uuid()`
- `crawl_job_id uuid references crawl_jobs(id) on delete cascade`
- `url text not null`
- `final_url text`
- `domain text`
- `page_type text` values: `university`, `department`, `faculty`, `professor`, `lab`, `publication`, `unknown`
- `http_status int`
- `title text`
- `extracted_text text`
- `content_hash text`
- `metadata jsonb default '{}'`
- `status text default 'success'` values: `success`, `failed`, `skipped`, `needs_review`
- `crawled_at timestamptz default now()`

### 5.1.8 crawl_errors

크롤링 에러를 저장한다.

필드:

- `id uuid primary key default gen_random_uuid()`
- `crawl_job_id uuid references crawl_jobs(id) on delete cascade`
- `url text`
- `error_type text`
- `message text`
- `stack text`
- `metadata jsonb default '{}'`
- `created_at timestamptz default now()`

### 5.1.9 review_items

수집 결과 중 사람이 확인해야 할 항목을 저장한다.

필드:

- `id uuid primary key default gen_random_uuid()`
- `entity_type text` values: `department`, `professor`, `lab`, `publication`
- `entity_id uuid`
- `reason text`
- `suggested_action text`
- `status text default 'open'` values: `open`, `resolved`, `ignored`
- `metadata jsonb default '{}'`
- `created_at timestamptz default now()`
- `resolved_at timestamptz`

---

## 5.2 크롤러 프로젝트 구조

Codex는 다음 구조를 권장한다. 기존 프로젝트 구조가 있다면 충돌을 최소화해 반영한다.

```text
/
  package.json
  pnpm-workspace.yaml
  .env.example
  /supabase
    /migrations
  /packages
    /db
      src/supabaseAdmin.ts
      src/types.ts
      src/upsert.ts
    /crawler
      src/index.ts
      src/config/schools.ts
      src/schools/snu.ts
      src/schools/yonsei.ts
      src/schools/korea.ts
      src/schools/kaist.ts
      src/core/browser.ts
      src/core/linkDiscovery.ts
      src/core/pageExtract.ts
      src/core/entityExtract.ts
      src/core/dedupe.ts
      src/core/hash.ts
      src/core/rateLimit.ts
      src/core/robots.ts
      src/core/report.ts
      src/types.ts
  /scripts
    crawl-school.ts
    update-labs.ts
    validate-crawl.ts
    seed-universities.ts
```

---

## 5.3 학교별 크롤러 설정

학교별 크롤러는 `SchoolCrawlerConfig` 형태로 관리한다.

예시 타입:

```ts
export type SchoolCrawlerConfig = {
  slug: string;
  nameKo: string;
  nameEn?: string;
  homepageUrl: string;
  allowedDomains: string[];
  seedUrls: string[];
  includeUrlPatterns: RegExp[];
  excludeUrlPatterns: RegExp[];
  departmentKeywords: string[];
  facultyKeywords: string[];
  labKeywords: string[];
  maxDepth: number;
  maxPages: number;
  concurrency: number;
  delayMs: number;
};
```

초기 대상 학교:

```ts
const schools = [
  {
    slug: 'snu',
    nameKo: '서울대학교',
    nameEn: 'Seoul National University',
    homepageUrl: 'https://www.snu.ac.kr',
  },
  {
    slug: 'yonsei',
    nameKo: '연세대학교',
    nameEn: 'Yonsei University',
    homepageUrl: 'https://www.yonsei.ac.kr',
  },
  {
    slug: 'korea',
    nameKo: '고려대학교',
    nameEn: 'Korea University',
    homepageUrl: 'https://www.korea.ac.kr',
  },
  {
    slug: 'kaist',
    nameKo: 'KAIST',
    nameEn: 'Korea Advanced Institute of Science & Technology',
    homepageUrl: 'https://www.kaist.ac.kr',
  },
];
```

주의:

- 위 URL은 seed 후보일 뿐이며, 실제 크롤러에서는 학교별 공식 학과/교수 페이지 URL을 추가할 수 있어야 한다.
- 각 학교는 구조가 다르므로 공통 탐색 로직만으로 완벽히 해결하려 하지 말고 site-specific override를 허용한다.

---

## 5.4 크롤링 모드

### 5.4.1 discover_school

학교의 학과, 교수, 연구실 후보를 처음 찾는 모드다.

실행 예시:

```bash
pnpm crawl:school --school=snu --mode=discover
```

동작:

1. `universities`에서 학교 정보를 가져오거나 seed한다.
2. 학교 config의 `seedUrls`에서 시작한다.
3. allowed domain 내 링크만 탐색한다.
4. 학과 후보 페이지를 찾는다.
5. 학과 페이지에서 교수/구성원/Faculty 페이지 후보를 찾는다.
6. 교수 페이지에서 연구실 URL, 연구분야, 이메일, 논문 후보를 추출한다.
7. 연구실 URL이 있으면 연구실 페이지를 방문해 연구 키워드와 설명을 추출한다.
8. Supabase에 upsert한다.
9. crawl job metrics를 저장한다.
10. review_items를 생성한다.

### 5.4.2 update_labs

이미 저장된 연구실 URL을 월 1회 업데이트하는 모드다.

실행 예시:

```bash
pnpm crawl:update-labs --school=snu
```

동작:

1. `labs`에서 active 상태의 `homepage_url` 목록을 가져온다.
2. 각 URL을 재방문한다.
3. 기존 `content_hash`와 새 hash를 비교한다.
4. 변경된 페이지만 재추출한다.
5. 연구 키워드, 설명, 논문 후보, last_crawled_at, last_changed_at을 업데이트한다.
6. 3회 연속 실패한 URL은 삭제하지 않고 `stale` 또는 `needs_review`로 표시한다.

### 5.4.3 validate

크롤링 결과를 검증하고 리포트를 만든다.

실행 예시:

```bash
pnpm crawl:validate --school=snu
```

리포트 내용:

- 학교명
- 크롤링 job id
- 총 방문 페이지 수
- 성공/실패/스킵 페이지 수
- 발견 학과 수
- 발견 교수 수
- 발견 연구실 수
- 발견 논문 후보 수
- 중복 후보 수
- low confidence 항목 수
- needs_review 항목 목록
- 에러 top 20
- 샘플 데이터 10개

리포트 출력 위치:

```text
/reports/{schoolSlug}-{jobId}.json
/reports/{schoolSlug}-{jobId}.md
```

---

## 5.5 링크 탐색 요구사항

Codex는 `linkDiscovery.ts`를 구현한다.

### 5.5.1 링크 정규화

- 상대 URL을 절대 URL로 변환한다.
- `#fragment` 제거
- 불필요한 tracking query 제거
- trailing slash 정규화
- http/https 중복 처리
- 동일 final URL 중복 제거

### 5.5.2 도메인 제한

- `allowedDomains`에 포함된 도메인만 방문한다.
- 외부 논문 사이트, 개인 홈페이지, GitHub, Google Scholar 등은 처음에는 방문하지 않고 URL만 후보로 저장한다.
- 연구실 홈페이지가 학교 도메인 밖에 있을 수 있으므로, 교수/학과 페이지에서 발견된 lab URL은 별도 후보로 저장한 뒤 사용자가 허용할 수 있도록 한다.

### 5.5.3 링크 점수화

링크 텍스트와 URL에 포함된 키워드로 우선순위를 정한다.

한국어 키워드 예시:

- 학과
- 대학원
- 전공
- 교수
- 교수진
- 구성원
- 연구실
- 연구분야
- 연구
- 논문
- 실험실
- 랩

영어 키워드 예시:

- department
- graduate
- faculty
- professor
- people
- member
- lab
- laboratory
- research
- publication
- publications
- group

---

## 5.6 페이지 추출 요구사항

Codex는 `pageExtract.ts`를 구현한다.

추출 항목:

- URL
- final URL
- HTTP status
- page title
- meta description
- visible text
- headings
- links
- tables text
- language hint
- content hash

제외 항목:

- navigation/footer 반복 텍스트는 최대한 제거한다.
- script/style/noscript 내용은 제거한다.
- 쿠키 배너나 공통 메뉴 텍스트는 가능하면 제거한다.

Playwright 동작:

- headless 기본값 true
- page timeout 설정
- networkidle 대기 시간 제한
- retry 최대 2회
- 페이지당 최대 텍스트 길이 제한
- 이미지, 폰트 등 불필요 리소스 차단 가능

---

## 5.7 엔티티 추출 요구사항

Codex는 `entityExtract.ts`를 구현한다.

### 5.7.1 Rule-based 우선

초기에는 LLM 호출 없이 rule-based 추출을 우선 구현한다. 이유는 비용, 속도, 재현성 때문이다.

교수 후보 추출:

- 이름
- 직함
- 이메일
- 프로필 URL
- 연구실 URL
- 연구분야 텍스트

연구실 후보 추출:

- 연구실명
- 연구실 URL
- 연구 설명
- 키워드 후보
- PI 교수명 후보

논문 후보 추출:

- 제목 후보
- 연도
- venue 후보
- URL
- DOI 후보

### 5.7.2 LLM 추출은 후순위

Rule-based로 추출이 어려운 경우에만 추후 LLM extraction을 추가한다. 이때도 원본 텍스트와 source URL을 반드시 남기고, LLM 결과에는 confidence를 부여한다.

### 5.7.3 confidence_score

각 엔티티는 0~1 사이 confidence를 가진다.

예시:

- 공식 학과 페이지에서 발견된 교수명 + 이메일 + 프로필 URL: 0.9 이상
- 교수 페이지에서 발견된 연구실 URL: 0.8 이상
- 링크 텍스트만으로 추정한 연구실 URL: 0.5 이하
- 이름만 있고 소속/URL이 불명확한 교수 후보: 0.4 이하 및 needs_review

---

## 5.8 Supabase 저장 요구사항

Codex는 `packages/db/src/upsert.ts`에 upsert 함수를 구현한다.

필요 함수:

- `upsertUniversity(input)`
- `upsertDepartment(input)`
- `upsertProfessor(input)`
- `upsertLab(input)`
- `upsertPublication(input)`
- `createCrawlJob(input)`
- `finishCrawlJob(jobId, metrics)`
- `insertCrawlPage(input)`
- `insertCrawlError(input)`
- `createReviewItem(input)`

저장 원칙:

- URL 또는 이메일 기반으로 중복을 줄인다.
- 기존 데이터가 있으면 새 source가 더 신뢰도 높을 때만 핵심 필드를 덮어쓴다.
- 배열 필드는 기존 값과 새 값을 merge하고 dedupe한다.
- 삭제 대신 status 변경을 사용한다.
- 모든 변경은 updated_at을 갱신한다.

---

## 5.9 검증 요구사항

Codex는 `validate-crawl.ts`를 구현한다.

검증 기준:

- URL이 비어 있는 lab 비율
- professor와 lab 연결 비율
- professor email 중복
- 같은 URL을 가진 lab 중복
- 같은 이름의 professor 중복
- source_url 누락 여부
- crawl_confidence 낮은 항목
- extracted_text가 너무 짧은 페이지
- 최근 crawl job에서 실패한 URL

출력 예시:

```md
# Crawl Validation Report: snu

- Job ID: ...
- Status: partial_success
- Pages crawled: 1,240
- Pages failed: 37
- Departments found: 18
- Professors found: 231
- Labs found: 146
- Publications found: 823
- Low confidence items: 42

## Needs Review

| type | name | url | reason | confidence |
|---|---|---|---|---|
| lab | Example Lab | https://... | lab URL found from weak link text | 0.42 |
```

---

## 5.10 월간 업데이트 요구사항

월간 업데이트는 initial discover와 다르게 동작한다.

### 5.10.1 대상

- `labs.status = active`
- `labs.homepage_url is not null`
- 선택적으로 `professors.profile_url is not null`

### 5.10.2 변경 감지

- 페이지 visible text 기반 hash 생성
- 이전 hash와 비교
- 변경 없으면 last_crawled_at만 갱신
- 변경 있으면 last_changed_at 갱신 및 재추출

### 5.10.3 실패 처리

- 1회 실패: crawl_errors 기록
- 2회 연속 실패: review_items 생성
- 3회 연속 실패: status를 stale 또는 needs_review로 변경
- 삭제 금지

### 5.10.4 스케줄링

서버리스/크론 실행은 아래 중 하나를 사용한다.

- GitHub Actions cron에서 Node script 실행
- Cloud Run Jobs + Cloud Scheduler
- Vercel Cron + serverless function

주의:

- Supabase Edge Functions는 Deno 기반이며 Playwright 브라우저 실행에 제약이 있을 수 있으므로, Playwright 크롤러 실행 환경으로는 우선 GitHub Actions 또는 Cloud Run Jobs를 권장한다.
- Supabase는 DB와 인증/저장소 역할로 사용한다.

---

## 6. CLI 요구사항

`package.json` scripts 예시:

```json
{
  "scripts": {
    "db:types": "supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > packages/db/src/database.types.ts",
    "seed:universities": "tsx scripts/seed-universities.ts",
    "crawl:school": "tsx scripts/crawl-school.ts",
    "crawl:update-labs": "tsx scripts/update-labs.ts",
    "crawl:validate": "tsx scripts/validate-crawl.ts"
  }
}
```

환경변수:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CRAWLER_HEADLESS=true
CRAWLER_MAX_PAGES=500
CRAWLER_CONCURRENCY=2
CRAWLER_DELAY_MS=1000
CRAWLER_USER_AGENT=KR-Labs-Crawler/0.1 contact@example.com
```

---

## 7. 데이터 품질 기준

### 7.1 초기 MVP 완료 기준

한 학교에 대해 다음이 가능하면 1차 MVP 완료로 본다.

- `pnpm crawl:school --school=snu --mode=discover` 실행 가능
- 크롤링 job이 Supabase에 기록됨
- 방문한 페이지가 `crawl_pages`에 저장됨
- 학과/교수/연구실 후보가 각각 DB에 저장됨
- 중복 URL이 과도하게 생성되지 않음
- 실패 URL이 `crawl_errors`에 기록됨
- `pnpm crawl:validate --school=snu`로 markdown/json 리포트 생성 가능
- low confidence 항목이 `review_items`에 생성됨
- 같은 명령을 다시 실행해도 중복 데이터가 폭증하지 않음

### 7.2 학교별 검증 완료 기준

학교별로 다음 조건을 만족하면 월간 업데이트 대상에 포함한다.

- 공식 도메인 내 주요 학과 페이지가 탐색됨
- 교수/연구실 데이터의 source URL이 존재함
- 연구실 URL의 70% 이상이 정상 접근 가능함
- low confidence 항목이 review_items에 분리됨
- 크롤러 재실행 시 upsert가 정상 동작함
- 검증 리포트에서 치명적 중복이 없음

수치는 초기 기준이며, 실제 데이터 품질에 따라 조정 가능하다.

---

## 8. 장기 확장: LLM 추천 서비스

크롤링 MVP 이후 다음 기능을 추가한다.

### 8.1 연구분야 자동 태깅

입력 데이터:

- 교수 소개 텍스트
- 연구실 설명
- 논문 제목/초록
- 연구 키워드

출력 데이터:

- normalized research topics
- high-level field tags
- user-friendly explanation

예시 태그:

- LLM
- AI Agent
- Multimodal AI
- NLP
- Computer Vision
- HCI
- Data Mining
- Robotics
- Bioinformatics
- Computational Linguistics

### 8.2 검색/RAG

사용자 질문 예시:

- “LLM 에이전트 연구실 찾아줘”
- “서울에 있는 멀티모달 연구실 추천해줘”
- “컴퓨터공학과가 아니어도 언어모델 연구하는 연구실 알려줘”
- “학부생이 이해하기 쉽게 이 연구실이 뭘 하는지 설명해줘”

응답에는 반드시 다음을 포함한다.

- 추천 연구실
- 추천 이유
- 관련 키워드
- 관련 최근 논문
- source URL
- last_crawled_at
- 데이터 신뢰도 또는 주의 문구

### 8.3 개인화 추천

사용자 입력:

- 관심 연구주제
- 선호 지역
- 희망 학위 과정
- GPA 또는 학업 배경
- 연구 경험
- 선호 진로
- 지원 준비 수준

출력:

- 도전/적정/안전 후보군
- 연구실별 준비 전략
- 읽어볼 논문
- 컨택 메일 준비 체크리스트

---

## 9. 위험 요소와 대응

### 9.1 학교별 사이트 구조가 매우 다름

대응:

- 완전 자동화보다 학교별 config/override 구조를 우선한다.
- 공통 crawler engine과 school-specific parser를 분리한다.
- 탐색 결과가 불확실하면 needs_review로 보낸다.

### 9.2 연구실 홈페이지가 외부 도메인에 있음

대응:

- 외부 도메인은 처음부터 무제한 탐색하지 않는다.
- 교수/학과 페이지에서 발견된 lab URL만 후보로 저장한다.
- allowed external lab domain 목록을 별도로 관리한다.

### 9.3 데이터가 오래되거나 틀릴 수 있음

대응:

- 모든 결과에 source URL과 last_crawled_at을 표시한다.
- 자동 추천 결과에서 최신성/신뢰도 표시를 포함한다.
- 월 1회 update_labs job을 실행한다.

### 9.4 Playwright 서버리스 실행 제약

대응:

- MVP는 로컬 CLI와 GitHub Actions cron을 우선한다.
- 이후 필요 시 Cloud Run Jobs로 이전한다.
- Supabase Edge Functions에서 브라우저 크롤링을 직접 실행하지 않는다.

### 9.5 법적/윤리적 리스크

대응:

- 공개 정보만 수집한다.
- 과도한 요청을 방지한다.
- 로그인/우회/캡차 회피를 하지 않는다.
- 유료 논문 전문을 저장하지 않는다.
- 문제가 제기된 URL은 blocklist 처리할 수 있게 한다.

---

## 10. Codex 작업 지시

Codex는 한 번에 전체 서비스를 구현하지 말고 아래 순서대로 PR을 나누어 구현한다.

### Task 1. 프로젝트 기본 구조 생성

목표:

- TypeScript 기반 crawler/db 패키지 구조 생성
- pnpm scripts 추가
- `.env.example` 작성

완료 기준:

- `pnpm install` 가능
- `pnpm crawl:school --help` 또는 기본 실행 가능
- 환경변수 누락 시 명확한 에러 출력

### Task 2. Supabase 마이그레이션 작성

목표:

- 위 스키마에 해당하는 SQL migration 작성
- 필요한 index/unique constraint 추가

완료 기준:

- Supabase local 또는 remote에 migration 적용 가능
- `seed:universities` 실행 시 초기 학교 데이터 저장 가능

### Task 3. 공통 Playwright 크롤러 구현

목표:

- Browser manager
- URL normalization
- link discovery
- page extraction
- content hash
- rate limit
- error logging

완료 기준:

- seed URL 1개를 받아 페이지를 방문하고 링크/텍스트를 추출할 수 있음
- 실패 시 crawl_errors에 기록됨

### Task 4. 학교별 config 구조 구현

목표:

- `schools.ts`와 학교별 파일 생성
- `snu`, `yonsei`, `korea`, `kaist` config 추가

완료 기준:

- `--school=snu` 인자로 해당 config 로드 가능
- 없는 school slug 입력 시 에러 출력

### Task 5. discover_school 구현

목표:

- 학교 → 학과 후보 → 교수 후보 → 연구실 후보 탐색
- rule-based entity extraction
- Supabase upsert

완료 기준:

- `pnpm crawl:school --school=snu --mode=discover` 실행 가능
- DB에 crawl_jobs, crawl_pages, departments, professors, labs 데이터 생성
- 재실행해도 중복이 폭증하지 않음

### Task 6. validation report 구현

목표:

- `validate-crawl.ts` 작성
- markdown/json 리포트 생성
- needs_review 항목 생성

완료 기준:

- `/reports`에 리포트 파일 생성
- DB의 review_items에 low confidence 항목 저장

### Task 7. update_labs 구현

목표:

- 기존 lab URL 목록을 재방문
- content hash 비교
- 변경된 연구실만 재추출

완료 기준:

- `pnpm crawl:update-labs --school=snu` 실행 가능
- 변경 없는 페이지는 last_crawled_at만 갱신
- 변경된 페이지는 last_changed_at과 키워드/설명을 갱신

### Task 8. 월간 크론 설정

목표:

- GitHub Actions cron 또는 선택한 스케줄링 환경 구성

완료 기준:

- 월 1회 update_labs가 실행되도록 workflow 작성
- secrets로 Supabase 환경변수 사용
- 실행 결과가 crawl_jobs에 기록됨

---

## 11. 테스트 요구사항

### 11.1 Unit tests

- URL normalization
- link scoring
- content hash
- dedupe logic
- entity extraction regex
- upsert merge logic

### 11.2 Integration tests

- mock HTML 페이지에서 department/professor/lab 추출
- Supabase test DB에 upsert
- crawl job 생성/종료
- validation report 생성

### 11.3 수동 테스트

- 학교 하나를 선택해 discover 실행
- Supabase에서 저장 결과 확인
- report 확인
- 동일 명령 재실행 후 중복 증가 여부 확인
- update_labs 실행 후 hash 비교 정상 동작 확인

---

## 12. 최종 산출물

1차 크롤링 MVP 완료 시 아래 산출물이 있어야 한다.

- Supabase migration SQL
- 학교 seed script
- Playwright crawler core
- 학교별 crawler config
- discover_school command
- update_labs command
- validate command
- crawl reports
- README 또는 developer guide
- GitHub Actions cron workflow 또는 동등한 스케줄링 설정

---

## 13. README에 포함할 실행 예시

```bash
# install
pnpm install
pnpm exec playwright install chromium

# env
cp .env.example .env

# seed schools
pnpm seed:universities

# crawl one school
pnpm crawl:school --school=snu --mode=discover

# validate results
pnpm crawl:validate --school=snu

# monthly update simulation
pnpm crawl:update-labs --school=snu
```

---

## 14. 개발 시 주의사항

- 데이터 추출이 완벽하지 않아도 된다. 대신 confidence와 review flow를 반드시 둔다.
- 한 학교를 완성한 뒤 다른 학교로 확장한다.
- 무리하게 모든 URL을 깊게 탐색하지 않는다.
- 초기 maxDepth와 maxPages를 낮게 두고 점진적으로 확장한다.
- 크롤러는 중단되어도 다음 실행에서 이어갈 수 있도록 idempotent하게 만든다.
- 추천 서비스의 신뢰성을 위해 모든 구조화 데이터는 source URL과 연결되어야 한다.
- LLM 추천 단계에서 hallucination을 줄이려면 원본 출처, 마지막 크롤링 시점, 데이터 신뢰도를 반드시 사용자에게 보여줘야 한다.

---

## 15. MVP 성공 정의

KR_Labs 크롤링 MVP는 다음 상태에 도달하면 성공으로 본다.

- 관리자가 학교 slug 하나를 지정해 크롤링을 실행할 수 있다.
- 크롤러가 학과, 교수, 연구실 후보를 Supabase에 저장한다.
- 각 데이터에는 출처 URL과 confidence가 있다.
- 검증 리포트로 사람이 품질을 확인할 수 있다.
- 동일 학교를 재실행해도 중복 데이터가 폭증하지 않는다.
- 연구실 URL을 월 1회 업데이트할 수 있는 구조가 있다.
- 이후 LLM 검색/RAG 추천으로 확장 가능한 데이터 구조가 준비되어 있다.
