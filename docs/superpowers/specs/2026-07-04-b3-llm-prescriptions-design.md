# B3 — LLM 처방 v2 (실데이터 근거) 설계 스펙

> 승인: 2026-07-04 (브레인스토밍 대화에서 설계 섹션 승인). issue #4 해소.

## 목적

처방(다음 행동)의 근거를 "질문 키워드 템플릿"(v1 heuristic)에서 **실측에서 수집된 페르소나별 실제 reason 텍스트**로 바꾼다. 만드는 산출물의 종류는 v1과 동일하고, 근거가 실데이터가 된다.

## 범위 (승인된 분할)

| 처방 메서드 | v2 | 근거 |
|---|---|---|
| drivers/objections | **LLM** | reason 해석이 핵심 가치. objections의 label 앞에 병목 분류를 `[가격]`/`[신뢰]`/`[습관]`/`[대체재]` 태그로 표기 (새 리포트 필드 추가 없음) |
| interviewQuestions | **LLM** | 실제 거부 이유를 파고드는 질문 생성 |
| interviews / survey / landingTests / validationPlan | heuristic 유지 | 기계적 골격 — 템플릿이 안정적 |

## 아키텍처

동기 인터페이스(`PrescriptionGenerator`)와 `generateFounderInsightReport` 시그니처는 **무변경**. LLM 호출은 리포트 생성 전에 비동기로 선행한다:

```
const gen = await buildLLMPrescriptions({ provider, result, options });
generateFounderInsightReport(result, options, ctx, gen ?? new HeuristicPrescriptionGenerator());
```

### 구성 요소

1. **`LLMProvider.generateJson?`** (옵셔널 계약, askChoice와 같은 패턴)
   - `generateJson(system: string, user: string, schema: { name: string; schema: object }): Promise<unknown>`
   - OpenAIProvider: chat/completions + `response_format: json_schema(strict)`
   - ClaudeProvider: tool use 강제(`strict: true`) — askChoice와 동일 메커니즘
   - usage 누적 동일.

2. **`sampleReasons(responses, positiveChoice, opts)`** (순수 함수, `src/report/llm-prescriptions.ts`)
   - 구조화 경로에서 `Response.answer`가 reason 텍스트임을 이용.
   - choice 기준 긍정/부정 분리, 각 최대 20개, 시드 결정적 추출, 중복 제거, 문장당 200자 절단.
   - answer가 choice 문구와 동일(reason 미수집·폴백 경로)한 응답은 제외.

3. **`buildLLMPrescriptions({ provider, result, options, seed? })`** (`src/report/llm-prescriptions.ts`)
   - 입력 프롬프트: 질문/선택지 + 세그먼트 요약(기회/저항 상위) + reason 샘플.
   - LLM 1회 호출, strict json_schema 출력: `{ drivers: [{label, rationale}], objections: [{label, rationale}], interviewQuestions: [{text, type}] }`.
   - 검증 실패·호출 실패·`generateJson` 미구현 → **null 반환** (호출자가 heuristic 폴백 + appendix caveat).
   - 성공 시 `LLMPrescriptionGenerator` 반환: LLM 항목은 자체 데이터, 나머지 4개 메서드는 내부 `HeuristicPrescriptionGenerator`에 위임하는 하이브리드.

4. **라벨 (불변식)**
   - `Basis`에 `"llm"` 추가 (`src/report/types.ts`).
   - LLM 항목: `provenance: "inferred"`, `basis: "llm"`, confidence = reason 표본 ≥ 20개면 medium, 미만이면 low.
   - rationale 끝에 `(응답 이유 N건 기반)` 표기. 렌더러의 AI 초안 배너 유지.
   - 폴백 시 appendix.caveats에 "LLM 처방 생성 실패 — heuristic 초안으로 대체" 기록: 이 caveat은 `generateFounderInsightReport`가 아니라 실행 표면(report:live)이 options 경유로 전달하거나, generator 스왑 호출부에서 기록한다 (generate 시그니처 무변경 원칙 우선).

5. **실행 표면: `eval/report-live.ts`** (`npm run report:live`)
   - 플래그: `--provider anthropic|openai --n --repeats --counterbalance --seed --question --choices`
   - 흐름: runCensusStudy(counterbalance+repeats) → buildLLMPrescriptions → generateFounderInsightReport → renderFounderInsightReport 출력 + usage 영수증.
   - 질문 입력 → 실측 → 실데이터 근거 리포트의 제품 루프 완성.

## 비용

리포트 1회 ≈ 실측 90콜(n=30×3) + LLM 1콜(입력 ~4K/출력 ~1.5K) ≈ **$0.012** (gpt-4o-mini 기준).

## 테스트 전략 (전부 키 없이)

- generateJson: fake fetch/client 주입 (openai.test / claude.test 기존 패턴).
- sampleReasons: 순수 함수 단위 테스트 (긍/부정 분리, 상한, 중복 제거, reason 미수집 제외, 결정성).
- buildLLMPrescriptions: fake provider가 고정 JSON 반환 → 하이브리드 조합(LLM 3종 + heuristic 4종)·basis 라벨·confidence 규칙 검증; malformed JSON/미구현 provider → null.
- report-live: MockProvider 경로 스모크 (LLM 미구현 → heuristic 폴백 + caveat).

## 불변식 (유지)

synthetic panel 과장 금지 · 처방은 초안 라벨 · 코어 타입/aggregate 무수정 · 런타임 의존성 무추가 · 테스트 키 없이 그린.
