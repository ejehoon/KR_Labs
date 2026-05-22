# KR_Labs Crawler Skill Guide

이 문서는 새 Mac 또는 새 Codex 세션에서 `kr-labs-crawler` 스킬과 KR_Labs 크롤링 파이프라인을 그대로 사용하는 방법을 정리한다.

## 1. 이 스킬이 하는 일

`kr-labs-crawler`는 Codex가 KR_Labs의 학교별 크롤링 규칙을 재사용하도록 하는 로컬 Codex Skill이다.

스킬이 지시하는 기본 흐름:

1. 사용자가 학교/대학원/학과/교수진/연구실 URL을 준다.
2. Playwright로 페이지 구조를 먼저 확인한다.
3. 학과 목록, 학과 홈페이지, 교수진 페이지, 연구실 페이지, 교수 개인 연구실 홈페이지를 순서대로 찾는다.
4. 연구분야 텍스트는 최종 카테고리가 아니라 evidence로 저장한다.
5. KR_Labs taxonomy에 먼저 매칭한다.
6. 기존 taxonomy에 없으면 alias를 우선 보강하고, 그래도 없으면 교수/연구실 1개당 최대 1개 신규 카테고리만 만든다.
7. 연구근거가 없거나 메뉴/푸터만 잡히면 학과명 fallback으로 분류한다.
8. 연구원 수는 교수 개인 연구실 홈페이지에서만 `Members`, `Students`, `People`, `Team`, `구성원`, `멤버`, `학생`, `연구원` 등을 찾아 현재 인원만 센다.
9. `Alumni`, `Former`, `Past`, `졸업`, `동문`은 제외한다.
10. 검증 리포트 확인 후 Supabase에 적재한다.

중요: 스킬은 독립 실행 프로그램이 아니라, Codex가 이 repo의 Playwright/TypeScript 파이프라인을 올바른 순서로 실행하도록 하는 작업 지침이다.

## 2. 새 Mac에서 프로젝트 가져오기

```bash
git clone https://github.com/ejehoon/KR_Labs.git
cd KR_Labs
pnpm install
pnpm exec playwright install chromium
cp .env.example .env
```

`.env`를 열어서 Supabase 값을 채운다.

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CRAWLER_HEADLESS=true
CRAWLER_USER_AGENT=KR-Labs-Crawler/0.1 contact@example.com
```

`SUPABASE_SERVICE_ROLE_KEY`는 GitHub에 올리지 않는다. Mac마다 로컬 `.env`에만 둔다.

설치 확인:

```bash
pnpm typecheck
```

## 3. 스킬 설치

repo 안의 스킬 폴더를 Codex 스킬 폴더로 복사한다.

```bash
mkdir -p ~/.codex/skills
rm -rf ~/.codex/skills/kr-labs-crawler
cp -R skills/kr-labs-crawler ~/.codex/skills/
```

그 다음 Codex를 새로 열거나 새 세션을 시작한다.

Codex에게 이렇게 말하면 된다:

```text
kr-labs-crawler 스킬을 사용해서 이 학교 링크를 크롤링해줘: <URL>
```

또는:

```text
이 KR_Labs 폴더에서 한양대 파이프라인 다시 돌려줘.
```

repo 루트에는 `AGENTS.md`도 있으므로, Codex가 이 폴더에서 시작하면 스킬 설치 없이도 기본 프로젝트 지침은 읽을 수 있다. 다만 여러 프로젝트에서 재사용하려면 위처럼 `~/.codex/skills`에 설치하는 쪽이 좋다.

## 4. 한양대 전체 파이프라인 실행

한양대는 현재 가장 완성된 학교별 파이프라인이다.

Discovery:

```bash
pnpm discover:hanyang-grad \
  --max-research-enrichment-labs=9999 \
  --max-member-enrichment-labs=9999 \
  --homepage-enrichment=verified
```

검증:

```bash
pnpm validate:hanyang-grad \
  --report=reports/hanyang-grad-discovery.json \
  --validation=reports/hanyang-grad-discovery-validation.json
```

Supabase 한양대 데이터 삭제 후 재적재:

```bash
pnpm reset:hanyang-supabase --confirm
pnpm upsert:hanyang-grad \
  --confirm \
  --allow-needs-review \
  --report=reports/hanyang-grad-discovery.json \
  --validation=reports/hanyang-grad-discovery-validation.json
```

이미 적재된 한양대 row에서 연구원 수만 보강:

```bash
pnpm enrich:hanyang-member-counts --confirm --concurrency=6
```

## 5. 새 학교 링크를 받았을 때

아직 학교별 전용 스크립트가 없으면 seed discovery부터 시작한다.

```bash
pnpm discover:seed \
  --url="학교_또는_학과_URL" \
  --school=school-slug \
  --name="학교명" \
  --update-recipe
```

이 명령은 구조 탐색 결과를 `reports/`에 쓰고, `--update-recipe`가 있으면 `docs/crawler-recipes.json`에 학교별 패턴을 기록한다.

그 다음 Codex가 해야 할 일:

1. 리포트에서 학과/교수진/연구실 URL이 제대로 잡혔는지 확인한다.
2. 누락된 구조가 있으면 공통 extractor 또는 학교별 discovery script를 보강한다.
3. taxonomy alias/category를 보강한다.
4. validation report를 만든다.
5. Supabase 적재 스크립트를 추가하거나 기존 패턴을 복제한다.

즉, 새 학교는 처음부터 100% 자동 완성이라기보다 `구조 탐색 -> 오류 발견 -> 공통 파이프라인 보강 -> 재실행` 방식으로 점점 촘촘해진다.

## 6. 연구원 수 규칙

연구원 수는 다음 조건을 만족할 때만 저장한다.

- 교수 개인 연구실 홈페이지에서 확인됨
- 현재 구성원 섹션에서 확인됨
- `Members`, `People`, `Team`, `Students`, `구성원`, `멤버`, `맴버`, `학생`, `대학원생`, `연구원` 계열 페이지 또는 섹션임

저장하지 않는 경우:

- 학과 홈페이지
- 교수진 목록
- 교수 프로필 페이지
- 대학원 `lab_03.php` fallback 페이지
- 논문/뉴스/활동/수상 페이지
- `Alumni`, `Former`, `Past`, `졸업`, `동문` 섹션
- 현재 구성원인지 확실하지 않은 경우

## 7. 주요 파일

- `skills/kr-labs-crawler/SKILL.md`: Codex Skill 본문
- `AGENTS.md`: 이 repo에서 Codex가 따라야 할 프로젝트 지침
- `packages/crawler/src/schools/hanyangGraduateDiscovery.ts`: 한양대 discovery 파이프라인
- `packages/crawler/src/core/labResearchEvidence.ts`: Research evidence 탐색
- `packages/crawler/src/core/labMetrics.ts`: Playwright/fetch 기반 연구원 수 탐색
- `packages/crawler/src/taxonomy/researchTaxonomy.ts`: 중앙 taxonomy와 alias
- `scripts/upsert-hanyang-grad.ts`: Supabase 적재
- `scripts/enrich-hanyang-member-counts.ts`: 이미 적재된 한양대 row의 연구원 수 보강
- `docs/crawler-recipes.json`: 학교별 오류/보강 이력

## 8. 자주 쓰는 명령

```bash
pnpm typecheck
pnpm discover:hanyang-grad
pnpm validate:hanyang-grad \
  --report=reports/hanyang-grad-discovery.json \
  --validation=reports/hanyang-grad-discovery-validation.json
pnpm upsert:hanyang-grad --confirm --allow-needs-review \
  --report=reports/hanyang-grad-discovery.json \
  --validation=reports/hanyang-grad-discovery-validation.json
pnpm enrich:hanyang-member-counts --confirm --concurrency=6
```

## 9. GitHub에 반영

변경 후:

```bash
git status
pnpm typecheck
git add -A
git commit -m "Describe crawler change"
git push
```

현재 GitHub 기본 브랜치는 `main`이고, 이 문서와 스킬은 repo에 포함되어 있어 새 Mac에서 바로 복사해 설치할 수 있다.
