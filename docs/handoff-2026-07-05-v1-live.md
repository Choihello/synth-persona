# synth-persona 세션 인계 — 웹 v1 라이브 + 후속 4종 · 2026-07-05 (2차)

> 이전 인계: `docs/handoff-2026-07-05-web-vercel.md` (배포 직전 상태). 이번 세션에서 **Task 12(배포)를 완료**하고 후속 후보 4종을 구현했다.

## 0. 한 줄 요약

**웹 v1이 라이브다: https://synth-persona-app.vercel.app** (Vercel + Turso, GitHub main 연동 자동 배포). 라이브 스모크 통과 — after() 백그라운드 잡(Fluid Compute), Turso 테이블 자동 생성, 공유 페이지 13섹션 + 차트 2종 렌더 확인. 이어서 web/ Hono 정리·OG 이미지·다크 모드·홈 갤러리를 구현했다.

## 1. 배포 (Task 12) — 완료

- Vercel 프로젝트: Root Directory = `app/`, GitHub `Choihello/synth-persona` main 연동 → push 시 자동 배포
- 환경변수: `OPENAI_API_KEY`, `IP_SALT`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `PER_IP_DAILY=3`, `DAILY_GLOBAL_CAP=100`
- 스모크 리포트: https://synth-persona-app.vercel.app/r/1zt5RRsfUs (주 4일 근무제, ~30초 완료)

### 배포에서 잡은 장애 3건 (재발 방지 지식)

1. **Vercel은 Root Directory 안에서만 npm install** — 워크스페이스 호이스팅에 의존하면 안 됨. `app/`이 쓰는 의존성은 전부 `app/package.json`에 직접 선언 (`@anthropic-ai/sdk`, `@libsql/client`, devDeps `typescript`·`@types/node` 포함. Next는 로컬에선 typescript를 자동 설치해주지만 CI에선 에러).
2. **`.gitignore`의 비앵커 `reports/` 규칙이 `app/src/app/api/reports/`까지 무시** → API 라우트가 GitHub에 안 올라갔었음. `/reports/`로 앵커링해 해결.
3. **Vercel CLI는 한글 경로("바탕 화면")에서 ByteString 오류로 사용 불가** → 배포는 GitHub 연동으로만.
4. **Vercel은 커밋이 Root Directory(`app/`) 밖만 건드리면 배포를 스킵** ("Skipped - Not affected") — `web/`·`src/`는 app이 import하는데도 스킵된다 (og-stats 수정이 실제로 안 나갔던 사례). 확인: `gh api repos/Choihello/synth-persona/commits/<sha>/status`. **영구 해결: Vercel Settings → Git → Ignored Build Step을 항상 빌드로**(예: Custom `exit 1`). 설정 전까지는 web/·src/ 변경 시 app/ 파일도 함께 커밋하거나 대시보드 Redeploy.

또한 `web/store.ts`의 `node:sqlite` 로드를 SqliteStore 생성 시점으로 지연 — Turso 프로덕션은 실험적 내장 모듈 없이 동작.

## 2. 이번 세션 구현 (후속 4종)

### web/ Hono 경로 정리
- 삭제: `web/server.ts`, `web/main.ts`, `web/views.ts`, `web/server.test.ts` (+ 루트 `web:dev`/`web:start` 스크립트, tsup 엔트리)
- `web/package.json` 의존성은 `@libsql/client` 단독. `escapeHtml`은 `web/validate.ts`로 이동
- BYOK 셀프호스팅이 필요해지면 git 히스토리(`edf5e12` 이전)에서 복구 가능

### OG 이미지 (`app/src/app/r/[id]/opengraph-image.tsx`)
- 1200×630 에디토리얼 카드: 크림 서피스 + Noto Serif KR(구글 폰트 css2 `text=` 서브셋 fetch, 700/400) + 질문 헤드라인 + 검증 팔레트 분포 바 + "가상 패널 응답 — 실제 여론이 아닙니다" 면책
- 수치는 `web/og-stats.ts`(`extractOgStats`)가 리포트 md의 "응답 분포:"/"- n=" 줄에서 파싱 (테스트 5개)
- 미완료/없는 리포트는 폴백 카드 (질문 또는 기본 타이틀)

### 다크 모드 (`app/src/app/globals.css` 끝의 미디어쿼리)
- 페이지 크롬만 웜 잉크 토큰으로 반전 (`--surface:#191613` 등)
- **차트 SVG는 다크에서 크림(#faf6ef) 카드 위에 그대로** — 팔레트 자동 플립 금지 불변식 유지
- 미디어쿼리는 특이성이 없으므로 반드시 **파일 끝**에 있어야 함 (앞에 두면 기본 규칙이 이김)

### 홈 갤러리 (`GALLERY_IDS` 환경변수)
- 쉼표 구분 리포트 id → done 상태만 질문 링크로 노출. 미설정 시 섹션 없음
- 홈은 서버 컴포넌트 + `report-form.tsx`(클라이언트)로 분리, `revalidate = 3600`
- **주의**: 정적 페이지라 빌드 시점 env 사용 — Vercel에서 `GALLERY_IDS` 변경 후 재배포 필요
- 큐레이션 후보: `1zt5RRsfUs` (스모크 리포트)

### 쉬운 요약 카드 ("한눈에 보기")
- `web/easy-summary.ts` 결정적 템플릿(판정 5단계 + 4블록, LLM 없음) → `pipeline.ts`가 "## 한 줄 요약" 앞에 주입
- 신규 리포트에만 적용 (저장된 기존 md는 불변 — 카드 없는 게 정상). 라이브 검증: /r/BAJnsFMKrF
- 스펙: `docs/superpowers/specs/2026-07-05-easy-summary-design.md` · 플랜: `docs/superpowers/plans/2026-07-05-easy-summary.md`

### 랜딩 페이지 (/ ↔ /new 분리)
- /는 신문 1면 정적 랜딩("가짜 90명" 헤드라인 + 예시 카드 2장 + 작동 방식 3단계 + 정직 면책), 폼·갤러리는 /new로 이동, r/[id] backlink → /new
- 예시 카드는 /r/BAJnsFMKrF 하드코딩 링크 — 해당 리포트 행이 지워지면 교체 필요 (운영 메모)
- 스펙: docs/superpowers/specs/2026-07-05-landing-page-design.md
- 디자인 스킬 3종 설치됨(~/.claude/skills): frontend-design, web-design-guidelines, impeccable-design-polish (출처: nexu-io/open-design, 내용 검토 후 선별 설치)

### 세그먼트 유의성 게이트 (신뢰 개선)
- rankSegments가 페르소나 단위(반복 과반 투표, 동률 비긍정) Wilson 90% + 효과 ≥10%p 2티어 게이트로 승격 판정 — 우연/무관 세그먼트가 한줄요약·쉬운요약·차트·처방에 오르지 않음 (GATE_Z/GATE_MIN_EFFECT 상수)
- 약한 신호는 "## 참고 — 우연일 수 있는 차이"(최대 5), 나머지 "우연 범위 내" 한 줄. 세그먼트 전멸 시 정직 문구 + 쉬운 요약 "뚜렷한 차이는 없었어요" + 차트 생략
- 라이브 검증: /r/YY172ydchh (보안솔루션 질문 — 혼인·성별·가구원수가 우연 범위로 정확히 강등)
- app/vercel.json `ignoreCommand: exit 1` 추가 — **배포 스킵 함정 영구 해결** (코드로 관리, 대시보드 설정 불필요)
- ~~후속 후보: B. LLM 관련성 게이트~~ → 완료 (2026-07-05): judgeDimensionRelevance 1콜 → 통계 유의해도 무관 축은 "## 참고 — 순위에 올리지 않은 차이"로 제외+AI 사유 명시. 실패 시 조용한 폴백. 스펙: docs/superpowers/specs/2026-07-05-relevance-gate-design.md
- **교훈(중요)**: OpenAI strict structured outputs는 **모든 properties가 required에 있어야** 함 — 누락 시 HTTP 400으로 요청 거부되는데 조용한 폴백 탓에 프로덕션서 무증상 무력화됐음. 라이브 프로브로 발견, real-API 재현으로 확정, 재귀 strict-compat 회귀 테스트로 고정 (relevance.test.ts). generateJson에 새 스키마 추가 시 이 테스트 패턴을 복사할 것
- 잔여 Minor(이연): weak/noise/lowRelevance 티어 confidence 필드 정합 · relevance 프롬프트 델리미터 하드닝
- 스펙: docs/superpowers/specs/2026-07-05-segment-gate-design.md

### Nemotron 서사 레이어 (2026-07-06, 기본 ON)
- KOSIS IPF 표본 페르소나에 Nemotron-Personas-Korea 서사를 결정적 매칭(연령대×성×권역×혼인 + 가구 호환 필터)해 **프롬프트만** 풍부화 — 표본·가중치·세그먼트·수치 불변
- 풀: data/nemotron/kr-pool.json (3,022 엔트리, 167/168 스트라텀, HF rows API 층화 수집, CC BY 4.0 — appendix·콜로폰·README 표기). 재생성: `node dist/scripts/build-nemotron-pool.js` (결정적)
- 검증 3층 전부 통과: 자동 감사 200표본 모순 0(텍스트 모순 그물 포함) · 정성 20건(발견 1건 → hh 보정 2단 수정) · **라이브 A/B GO** (파싱 90/90 양쪽, 분포 붕괴 없음 — 있다 50%→39% 현실 보정, reason에 삶의 맥락 반영)
- 차단: `NARRATIVE=off` 환경변수. **불변식 갱신: src/types.ts는 "기존 필드 무수정" — optional `narrative?` 1줄은 사용자 승인분(2026-07-05)**
- 실행 기록: 서브에이전트 전부 Opus 4.8(사용자 지시), 컨트롤러 fable. Opus 리뷰 6회(태스크4+수정2) + 최종 전체 리뷰 통과
- 잔여 Minor(이연): 풀 정적 import는 NARRATIVE=off여도 콜드스타트에 파싱(기본 ON이라 실질 무관) · refineHhFromNarrative 정규식은 데이터 갱신 시 재감사 필요

### 기타
- 기존 main에 있던 biome lint 오류 10건 정리 (eval/b2-live.ts 템플릿 리터럴, llm-prescriptions.test.ts non-null 단언 → 가드로 교체)
- `.claude/launch.json` 추가 (프리뷰 서버 `next start app -p 3211`)

## 3. 검증 상태

- 테스트 **263개 그린** (49 파일 — server.test 13개 제거, og-stats 5개 추가)
- `tsc --noEmit`·`biome check .`·`app next build` 모두 클린
- OG 이미지는 로컬 `next start`에서 PNG 실렌더 확인 (본 카드 + 폴백), 다크 모드는 프리뷰 다크 에뮬레이션에서 computed style 검증

## 3.5 방향 결정 (2026-07-06): 사업화

- **npm 오픈소스 공개 스킵** (패키징 준비는 완료돼 있음 — private 플래그로 봉인, 필요 시 한 줄 제거로 재개 가능). Claude 교차 실측 보류 유지
- 사업화 시 검토 필요 (사용자 결정 대기): ① GitHub 저장소가 현재 **public + MIT** — 비공개 전환/라이선스 재고 여부 ② **Vercel Hobby는 비상업 전용** — 수익화 시점에 Pro($20/월) 전환 필수

## 4. 남은 후속 후보

- **Ignored Build Step 설정** (§1-4): web/·src/ 변경도 배포되게 — 대시보드에서 1분
- ~~GALLERY_IDS 설정~~ → 완료: `BAJnsFMKrF, 1zt5RRsfUs` (Production+Preview). IP_SALT도 첫 설정 때 누락됐던 것을 발견해 함께 추가함 (2026-07-05)
- **사이트 기본 OG**: app/src/app/opengraph-image.tsx — 랜딩/new 공용 정적 카드(히어로 카피). 폰트 로더는 lib/og-font.ts로 공용화
- **npm 배포 (코어)**: npm 계정 필요 — 사용자 결정 대기
- **Claude 교차 실측**: API 비용 발생 — 보류 중
- **커스텀 도메인**: 필요 시 Vercel에서 연결 (metadataBase는 Vercel이 자동 해석)
- Vercel Hobby는 비상업 용도만 — 수익화 시 Pro

## 5. 불변식 (유지)

synthetic panel 과장 금지 · 처방 초안 라벨(basis heuristic|llm) · `src/types.ts`·`aggregate` 무수정 · 코어 런타임 의존성 @anthropic-ai/sdk 단일(app은 next·libsql 등 자체 선언) · 테스트 키 없이 그린 · 차트 팔레트는 검증기 통과분만(다크에서도 크림 카드 위에 유지)
