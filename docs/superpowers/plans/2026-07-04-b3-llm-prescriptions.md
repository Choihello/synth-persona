# B3 — LLM 처방 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 처방(drivers/objections/인터뷰 질문)을 실측 reason 텍스트에 근거해 LLM으로 생성하고, 나머지 처방은 heuristic에 위임하는 하이브리드 generator를 기존 스왑 지점에 꽂는다.

**Architecture:** `LLMProvider.generateJson?`(옵셔널, askChoice 패턴)으로 프로바이더 중립 구조화 생성 → `buildLLMPrescriptions`가 reason 층화 샘플 + 세그먼트 요약으로 LLM 1회 호출 → 성공 시 하이브리드 `LLMPrescriptionGenerator`, 실패 시 null(호출자 heuristic 폴백). `generateFounderInsightReport`/`PrescriptionGenerator` 시그니처 무변경.

**Tech Stack:** TypeScript(ESM), vitest, 내장 fetch(OpenAI)/@anthropic-ai/sdk(Claude).

## Global Constraints

- 테스트 전부 키 없이 그린 (fake 주입만, 실 API 호출 금지).
- 런타임 의존성 추가 금지 (`@anthropic-ai/sdk` 단일).
- `src/types.ts`·`src/aggregate/uncertainty.ts` 수정 금지. `src/report/types.ts`는 수정 가능.
- LLM 처방 라벨: `provenance:"inferred"` + `basis:"llm"` + confidence(reason ≥20 → medium, 미만 → low) + rationale 끝 `(응답 이유 N건 기반)`.
- 각 태스크 완료 시 `npm test`+`npm run lint`+`npx tsc --noEmit` 그린 후 커밋.

---

### Task 1: `LLMProvider.generateJson` 계약 + OpenAIProvider 구현

**Files:**
- Modify: `src/llm/provider.ts` (옵셔널 메서드 추가)
- Modify: `src/llm/openai.ts`
- Test: `src/llm/openai.test.ts` (추가)

**Interfaces:**
- Produces: `generateJson?(system: string, user: string, schema: { name: string; schema: Record<string, unknown> }): Promise<unknown>` — Task 2가 Claude에 동일 시그니처 구현, Task 4가 소비.

- [x] **Step 1: 실패하는 테스트** — openai.test.ts에 추가: fakeFetch로 `response_format.json_schema.name/strict/schema` 전달 검증 + content JSON 파싱 반환 + usage 누적.
- [x] **Step 2: RED 확인** `npx vitest run src/llm/openai.test.ts`
- [x] **Step 3: 구현** — `chat()` 재사용, `max_completion_tokens: 2048`, content JSON.parse 실패 시 throw.
- [x] **Step 4: GREEN + lint/tsc**
- [x] **Step 5: 커밋** `feat(llm): generateJson structured-output contract + OpenAI impl`

### Task 2: ClaudeProvider.generateJson (tool use 강제)

**Files:**
- Modify: `src/llm/claude.ts`
- Test: `src/llm/claude.test.ts` (추가)

**Interfaces:**
- Consumes/Produces: Task 1의 시그니처와 동일 — tool 정의 `{name: schema.name, strict: true, input_schema: schema.schema}` + `tool_choice: {type:"tool", name: schema.name}`, tool_use input 반환, usage 누적(track 재사용).

- [x] **Step 1: 실패하는 테스트** (fake client, askChoice 테스트 패턴 복제)
- [x] **Step 2: RED 확인** → **Step 3: 구현** → **Step 4: GREEN** → **Step 5: 커밋** `feat(llm): ClaudeProvider.generateJson via forced tool use`

### Task 3: `sampleReasons` 순수 함수

**Files:**
- Create: `src/report/llm-prescriptions.ts`
- Test: `src/report/llm-prescriptions.test.ts`

**Interfaces:**
- Produces: `sampleReasons(responses: Response[], positiveChoice: string, opts?: { maxPerSide?: number; seed?: number }): { positive: string[]; negative: string[] }` — Task 4가 소비. 규칙: `r.answer === r.choice`(reason 미수집) 제외, 중복 제거, 200자 절단, side당 기본 20개, seed 결정적(makeRng 스타일 mulberry32 인라인).

- [x] **Step 1: 실패하는 테스트** — 긍/부정 분리·미수집 제외·상한·중복 제거·같은 seed 같은 결과.
- [x] **Step 2~5: RED → 구현 → GREEN → 커밋** `feat(report): stratified reason sampler for LLM prescriptions`

### Task 4: `buildLLMPrescriptions` + 하이브리드 generator + Basis "llm"

**Files:**
- Modify: `src/report/types.ts` (`Basis`에 `"llm"`)
- Modify: `src/report/llm-prescriptions.ts`
- Test: `src/report/llm-prescriptions.test.ts` (추가)
- Modify: `src/index.ts` (배럴 export)

**Interfaces:**
- Consumes: Task 1/2 `generateJson`, Task 3 `sampleReasons`, 기존 `HeuristicPrescriptionGenerator`/`PrescriptionContext`.
- Produces: `buildLLMPrescriptions(opts: { provider: LLMProvider; result: StudyResult; options: FounderReportOptions; seed?: number }): Promise<PrescriptionGenerator | null>` — null이면 호출자가 heuristic 사용. LLM json_schema: `{drivers:[{label,rationale}], objections:[{label,rationale}], interviewQuestions:[{text,type}]}` (objections label에 `[가격|신뢰|습관|대체재]` 태그 지시). 반환 generator: drivers/objections/interviewQuestions는 LLM 데이터(+라벨 규칙), interviews/survey/landingTests/validationPlan은 heuristic 위임.

- [x] **Step 1: 실패하는 테스트** — fake provider(고정 JSON) → basis "llm"·confidence 규칙·rationale N건 표기·heuristic 위임 4종 확인; malformed JSON → null; generateJson 미구현 provider → null.
- [x] **Step 2~5: RED → 구현 → GREEN → 커밋** `feat(report): LLM prescription generator grounded on measured reasons`

### Task 5: `eval/report-live.ts` + npm script

**Files:**
- Create: `eval/report-live.ts`, Test: `eval/report-live.test.ts`
- Modify: `tsup.config.ts`(entry), `package.json`(`report:live`)

**Interfaces:**
- Consumes: `runCensusStudy(repeats)`, `buildLLMPrescriptions`, `generateFounderInsightReport`, `renderFounderInsightReport`, CLI 플래그 파싱은 b2-live 패턴.
- Produces: `runReportLive(opts: { provider: LLMProvider; question?; choices?; n?; seed?; repeats?; counterbalance?; concurrency? }): Promise<string>` — LLM null 폴백 시 렌더 결과 앞에 `> ⚠️ LLM 처방 생성 실패 — heuristic 초안으로 대체` 한 줄 prepend.

- [x] **Step 1: 실패하는 테스트** — MockProvider(generateJson 없음) → heuristic 폴백 + 경고 라인 + 13섹션 존재.
- [x] **Step 2~5: RED → 구현 → GREEN(build 포함) → 커밋** `feat(eval): report:live — end-to-end measured report with LLM prescriptions`

### Task 6: 라이브 실행 + 기록 (수동)

- [x] `npm run report:live -- --provider openai --n 30 --repeats 3 --counterbalance` (~$0.012)
- [x] 산출 리포트 발췌·비용·품질 관찰을 `docs/b3-live-notes-2026-07-04.md`에 기록, issue #4에 결과 코멘트 남길 준비(사용자 승인 후), README 묶음 B3 체크.
- [x] 커밋 `docs: B3 live report notes` + push
