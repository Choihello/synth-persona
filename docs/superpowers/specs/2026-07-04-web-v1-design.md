# synth-persona Web v1 설계 스펙

> 승인: 2026-07-04 브레인스토밍. 결정: 호스팅(내 OPENAI_API_KEY) · 익명+IP 제한 · 입력→진행→리포트+공유링크 · 단일 Node 서버.

## 목적

키 없는 방문자가 질문 하나로 0차 시장검증 리포트를 받아보고 공유 링크로 퍼뜨릴 수 있는 최소 웹 서비스.

## 아키텍처

같은 저장소 `web/` npm workspace (코어의 "런타임 의존성 단일" 불변식은 코어 package에만 적용 — web은 hono·@hono/node-server·better-sqlite3·marked·nanoid 허용).

- **web/store.ts** — better-sqlite3. `reports(id TEXT PK, question, choices, status, md, error, created_at, ip_hash)`. 일별 카운트 조회(ip_hash별·전역). 테스트는 `:memory:`.
- **web/limits.ts** — `checkLimit(store, ipHash, now, {perIpDaily:3, globalDaily:100})` → ok | per-ip 초과 | 전역 초과.
- **web/jobs.ts** — 인프로세스 큐(동시 2). `enqueue(id)` → 주입된 runner 실행, progress(done,total,phase) 구독, 완료 시 store에 md/failed 기록. 서버 재시작 시 지속성 없음(YAGNI).
- **web/pipeline.ts** — 실제 runner: OpenAIProvider + runCensusStudy(n=30·seed 무작위·repeats=3·counterbalance on·concurrency 4) + buildLLMPrescriptions + generate + render → markdown. 파라미터 사용자 조절 불가(비용 고정 ~$0.02/회).
- **web/server.ts** — Hono `createApp({store, queue})` (테스트는 app.request()):
  - `POST /api/reports` {question, choices[]} — 검증(질문 1~200자, 선택지 2~4개·각 1~20자), rate limit(429), 생성 → {id}
  - `GET /api/reports/:id` — {status, progress, error} (폴링 폴백)
  - `GET /api/reports/:id/events` — SSE progress/done/error
  - `GET /r/:id` — 저장 md를 marked로 렌더한 공유 페이지(재생성 없음)
  - `GET /` — 입력 폼 + 진행 UI(inline JS, SSE→폴링 폴백)
- **web/views.ts** — 레이아웃/홈/리포트 HTML 템플릿. 리포트 페이지에 disclaimer(렌더러 출력 무변형) + "gpt-4o-mini 합성 패널 n=90 기반" 메타.

## 어뷰즈/비용 방어

IP는 `sha256(ip+IP_SALT)`로만 저장(원IP 미보관). IP당 일 3회 + 전역 일 100회(`DAILY_GLOBAL_CAP` env, ≈$1/일 하드캡). 초과 시 안내 문구. 잡 동시 2개(키 rate limit 보호).

## 에러 처리

runner 실패 → status failed + reason(전원 실패 시 첫 사유 포함) → SSE error + 화면 재시도 안내. 검증 실패 400 + 필드별 메시지.

## 테스트 (전부 키 없이)

store/limits 단위 · jobs는 fake runner(성공/실패/진행) · server는 app.request()로 검증/429/공유페이지/폴링 흐름. 라이브 스모크는 로컬 서버 + 실제 키 1회(~$0.02).

## 배포 (구현 후 별도 단계)

Dockerfile + Fly.io(또는 Railway). Secrets: OPENAI_API_KEY, IP_SALT, DAILY_GLOBAL_CAP. 도메인 미정 — 기본 서브도메인 시작.

## v1 제외

로그인·과금·갤러리·BYOK·히스토리·잡 지속성.
