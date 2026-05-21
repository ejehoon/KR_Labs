# School Crawling Playbook

KR_Labs는 학교별로 "대학원 학과 목록 -> 학과/전공 홈페이지 -> 교수/연구실 -> 연구분야 분류" 순서로 확장한다.

## 원칙

1. 학교별 시작 URL은 공식 대학원 학과 목록 또는 학과소개 페이지를 우선한다.
2. 학과 목록에서는 계열, 학과명, 학과 홈페이지, 연락처만 안정적으로 수집한다.
3. 교수/연구실 수집은 세 단계로 시도한다.
   - 학교 공통 CMS parser
   - 학과별 adapter
   - generic table/card parser
4. 크롤링한 연구분야 텍스트는 최종 카테고리가 아니라 taxonomy 분류를 위한 evidence로만 취급한다.
5. 연구분야 분류는 중앙 taxonomy를 먼저 사용한다. `0.7` 이상이면 기존 카테고리에 배정하고, 그 미만이면 신규 카테고리 후보 또는 review로 넘긴다.
6. taxonomy에 매칭되지 않는 표현은 바로 새 카테고리로 확정하지 않고 validation report의 suggestion으로 남긴다.
7. Supabase 저장 전에는 항상 dry-run report를 확인한다.

## 서강대 기준 플로우

Primary source:

- `https://gradsch.sogang.ac.kr/gradsch/gradsch02_3_1.html`

수집 단위:

- `series`: 인문·사회, 이학, 공학, 융합, 학과간 협동과정
- `program`: 국어국문학과, 전자공학과, 컴퓨터공학과, 인공지능학과 등
- `facultyCandidate`: 교수명, 연구분야 텍스트, 연구실/프로필 URL, parser id
- `classification`: taxonomy 매칭 결과와 신규 후보

현재 전용 adapter:

- `sogang-cs-merged`: 컴퓨터공학과 교수소개 + 연구실소개 병합
- `sogang-ee-profile-card`: 전자공학과 카드형 교수 프로필
- `sogang-ai-faculty-table`: 인공지능학과 교수진 표

## Supabase 재사용 전략

현재 스키마는 전체 학문 분야 MVP에 그대로 사용할 수 있다.

- `universities`: 학교
- `departments`: 대학원 학과/전공/협동과정
- `professors`: 교수
- `labs`: 연구실 또는 교수 연구그룹
- `crawl_jobs`, `crawl_pages`, `crawl_errors`, `review_items`: 실행 로그와 검수 항목

초기 저장 방식:

- `departments.college_name`에 계열을 저장한다.
- `professors.research_interests`에는 원문이 아니라 taxonomy label을 저장한다.
- `labs.research_keywords`에 taxonomy label을 저장한다.
- `labs.normalized_keywords`에 taxonomy id를 저장한다.
- 원문 연구분야/홈페이지 본문은 최종 연구분야가 아니라 evidence, description, review metadata로만 저장한다.
- 분류 실패/애매한 항목은 `review_items`로 넘긴다.

상세 파이프라인은 `docs/crawling-classification-pipeline.md`를 따른다.

추후 정규화:

- `research_fields`
- `professor_research_fields`
- `lab_research_fields`

위 세 테이블을 추가하면 카테고리별 랭킹/필터가 더 안정적으로 된다.

## 학교 추가 절차

1. 공식 대학원 학과 목록 URL을 찾는다.
2. 학과 목록 parser로 전체 학과 seed를 만든다.
3. dry-run report에서 학과 수와 링크 품질을 확인한다.
4. 교수 후보가 적은 학과부터 adapter를 추가한다.
5. taxonomy suggestion을 검토해 중앙 taxonomy를 보강한다.
6. Supabase upsert dry-run을 거친 뒤 저장한다.

## 링크 기반 탐색 루프

학교별 adapter를 만들기 전에는 임의의 seed URL로 Playwright dry-run을 먼저 실행한다.

```bash
pnpm discover:seed --url="https://example.ac.kr/department" --school=example --name="예시대학교" --update-recipe
```

결과는 `reports/seed-discovery-<school>.json`에 저장되고, `--update-recipe`를 주면 `docs/crawler-recipes.json`의 학교 recipe가 갱신된다.

오류를 고친 뒤에는 수정 이력을 남긴다.

```bash
pnpm record:crawler-fix --school=example --description="교수진 탭 selector 보강" --files=packages/crawler/src/schools/example.ts
```

이 루프를 반복해 seed URL별 실패 패턴을 recipe에 축적하고, 안정화된 패턴만 학교별 adapter나 generic extractor로 승격한다.
