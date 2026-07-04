# synth-persona 세션 인계 — 웹 v1 (Vercel+Turso) · 2026-07-05

> 이전 인계: `docs/handoff-2026-07-04-bundle-b-complete.md` (묶음 B 완료). 그 이후 웹 서비스 구축을 진행했고, **배포(Task 12) 직전**에서 넘긴다.

## 0. 한 줄 요약

CLI/라이브러리(v0.2.0, main 병합)에 이어 **웹 서비스 v1**을 구축했다. 질문 입력 → 진행 표시 → 리포트 + 공유 링크. 백엔드 로직·UI·차트·테스트까지 완료됐고, **남은 것은 Turso/Vercel 계정 연결 + 배포(Task 12)뿐**. 그 단계는 사용자 계정이 필요해 멈췄다.

## 1. 현재 상태

- 브랜치: **main** (origin 동기화 완료, working tree 깨끗)
- 테스트: **271개 그린** (49 파일, 전부 키 없이), lint·tsc·`app` next build 클린
- 모델 메모: 이 작업은 대부분 **Fable 5**로 진행. 마지막에 사용자가 Opus 4.8로 전환. `.claude/settings.json`은 Fable 5 핀 → 재시작 시 Fable 5로 돌아감 (원하면 확인)
- 브라우저 시각 검수는 **막힘**(확장이 다른 claude.ai 계정에 연결) → curl로 렌더 HTML 확인해 대체함. 다음 세션에서 실제 브라우저 스크린샷 검수 권장

## 2. 아키텍처 결정 (이번 세션)

플랫폼화 브레인스토밍 → 승인된 결정:
- **호스팅 모델**: 서버가 내 `OPENAI_API_KEY`로 호출, 방문자 키 불필요
- **식별/제한**: 익명 + IP 해시(원IP 미저장), IP당 일 3회 + 전역 일 100회(≈$1/일 하드캡)
- **스택**: 처음엔 Fly.io(단일 Node) 방향이었으나, "프론트 제대로 디자인" 목적에 맞춰 **Vercel + Next.js + Turso(libSQL)**로 재결정
- **UI 방향**: 리서치 에디토리얼(Noto Serif KR 헤드라인 + 크림 서피스 #faf6ef + 잉크 텍스트), 리포트에 검증된 SVG 차트 2종
- 스펙: `docs/superpowers/specs/2026-07-04-web-v1-design.md`

## 3. 구현된 것 — 두 개의 웹 구현이 공존

> ⚠️ **중요**: `web/`(Hono, Fly.io용)와 `app/`(Next.js, Vercel용) **둘 다 있다**. 최종 배포 대상은 **`app/`(Vercel)**. `web/`는 Fly 경로로 먼저 만든 것이고, 핵심 로직 모듈(store/limits/jobs/pipeline/charts/validate/run-report)을 `app/`이 그대로 재사용한다. web/의 Hono `server.ts`+`main.ts`(Fly 엔트리)는 지금은 잉여지만 삭제하지 않았다 — BYOK 셀프호스팅 옵션으로 남겨둘지 다음 세션에서 결정.

### 공유 로직 (`web/`)
- `store.ts` — `ReportStore` **async 인터페이스** + `SqliteStore`(node:sqlite, 로컬/테스트) + `rowToReport`
- `store-turso.ts` — `TursoStore`(@libsql/client, 프로덕션·서버리스 공유 상태)
- `limits.ts` — `checkLimit` (async, IP/전역 이중 캡)
- `run-report.ts` — `executeReport` (상태 전이 + 진행률 DB 기록, 5단위 스로틀) — JobQueue와 Vercel after() 공용
- `jobs.ts` — 로컬용 인프로세스 큐(동시 2) — executeReport 위임
- `pipeline.ts` — `makeReportRunner`: 실측(n=30×3, counterbalance) → LLM 처방 → 렌더 → **SVG 차트 2종 주입**. 진행률은 반복 누적(1..90)
- `charts.ts` — `shareBarSVG`(전체 분포 스택바, diverging blue/red) + `segmentBarsSVG`(세그먼트 긍정률 + 평균 기준선). dataviz 검증기 크림 서피스 대비 ALL PASS
- `validate.ts` — `validateReportInput` (질문 200자·선택지 2~4개 + XSS 이스케이프)
- 각 모듈 `.test.ts` 존재

### Vercel 앱 (`app/`, 배포 대상)
- `src/app/layout.tsx` — 에디토리얼 셸(masthead/colophon), Noto Serif/Sans KR 폰트
- `src/app/globals.css` — 전체 에디토리얼 스타일 + `.report` 마크다운 스타일
- `src/app/page.tsx` — 홈: 폼 + 진행 폴링(2.5초) → 완료 시 `/r/[id]` 이동
- `src/app/r/[id]/page.tsx` — 공유 리포트 SSR(force-dynamic) + generateMetadata(질문을 타이틀로)
- `src/app/api/reports/route.ts` — POST: 검증·rate limit·생성 후 **`after()`로 백그라운드 실측** (maxDuration 300, runtime nodejs)
- `src/app/api/reports/[id]/route.ts` — GET 상태/진행 폴링
- `src/lib/backend.ts` — 싱글턴: `TURSO_DATABASE_URL` 있으면 Turso, 없으면 로컬 SqliteStore
- `next.config.mjs` — `externalDir`(코어 src/·web/ 직접 컴파일) + `extensionAlias`(.js→.ts 해석)

### 검증 완료
- 로컬 `next start` 라이브 스모크 2회 통과(실키, ~$0.02): POST → 진행 폴링(35/90→done) → 공유 페이지에 13섹션 + LLM 처방(응답 이유 31~40건 기반) + 차트 2종 + disclaimer 렌더 확인

## 4. 남은 작업 — Task 12 (배포, 사용자 계정 필요)

```
# 1) Turso DB 생성
turso auth login          # 또는 웹 콘솔 turso.tech
turso db create synth-persona
turso db show synth-persona --url        # → TURSO_DATABASE_URL
turso db tokens create synth-persona     # → TURSO_AUTH_TOKEN

# 2) Vercel 프로젝트
#   - Root Directory: app/
#   - Framework: Next.js (자동 감지)
#   - 환경변수: OPENAI_API_KEY, IP_SALT(임의 랜덤), TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
#     선택: PER_IP_DAILY(기본 3), DAILY_GLOBAL_CAP(기본 100)
#   - Fluid Compute 켜기(after() 백그라운드 실행 보장), 함수 maxDuration은 코드에 300 명시됨
vercel  (또는 GitHub 연동 후 자동 배포)

# 3) 배포 후 라이브 스모크 1회 + Turso에 reports 테이블 자동 생성 확인
```

**주의점**:
- Turso 무료 티어면 충분. schema는 `store-turso.ts`가 CREATE IF NOT EXISTS로 자동 생성
- Vercel Hobby는 **비상업** 용도만 — 수익화 시 Pro($20/월)
- `after()`는 Vercel Fluid Compute 필요(기본 켜짐). 안 켜지면 응답 후 잡이 죽어 리포트가 안 생성됨 → 배포 후 첫 스모크로 반드시 확인
- IP 헤더: Vercel은 `x-forwarded-for` 정상 전달. 로컬은 "local"로 폴백

## 5. 후속 후보 (배포 이후)

- **web/ Hono 경로 처리**: 삭제 or BYOK 셀프호스팅 문서화 결정
- **OG 이미지**: 공유 링크가 핵심이라 리포트 OG(질문+핵심 수치) 동적 생성 — 브레인스토밍에서 언급됨, 미구현
- **다크 모드**: globals.css는 라이트 전용. dataviz 기준 다크는 별도 스텝 검증 필요(자동 플립 금지)
- **홈 갤러리**: 공유 링크 쌓이면 샘플 큐레이션
- npm 배포 여부(코어), Claude 교차 실측(보류 중)

## 6. 불변식 (유지)

synthetic panel 과장 금지 · 처방 초안 라벨(basis heuristic|llm) · `src/types.ts`·`aggregate` 무수정 · 코어 런타임 의존성 @anthropic-ai/sdk 단일(web/app만 hono·next·libsql 등 추가) · 테스트 키 없이 그린 · 차트 팔레트는 검증기 통과분만
