# synth-persona 세션 인계 — Plan 4 (Founder Insight Report) P4-1 완료 · 2026-07-02

> 컨텍스트가 차서 P4-1 완료 지점에서 넘긴다. **P4-1은 독립적으로 완결·검증된 단위**(처방은 의도적으로 빈 배열). 다음은 P4-2(처방 heuristic v1). 이 문서만 읽고 이어갈 수 있게 정리했다.

## 0. 한 줄 요약

Plan 4 = synthetic panel 결과를 창업자용 "0차 시장검증 리포트"로 번역하는 report layer. **P4-1(코어 스키마 + 세그먼트 랭킹 + 신뢰도/위험가정 매핑)까지 완료**. 155 테스트 그린, 코어 타입/aggregate 불변, 외부 API/LLM 호출 없음. 남은 건 **P4-2(처방 생성, heuristic)**, **P4-3(렌더러+데모+문서)**.

## 1. 현재 상태

- 브랜치: **`feat/founder-report-p4-1`** (main보다 3커밋 앞섬, **아직 미푸시**)
- working tree 깨끗
- 커밋:
  - `6accdd5` feat(report): add founder insight report core types
  - `fb44b8f` feat(report): rank opportunity and resistance segments
  - `9dcf372` feat(report): map confidence and risky assumptions

## 2. Plan 4 핵심 원칙 (불변 — 반드시 유지)

- **결과를 다음 검증 행동으로 번역한다.** 숫자는 결론이 아니라 신호. 리포트의 끝은 "다음에 누구를 만나고 무엇을 물어볼 것인가".
- 모든 수치는 **synthetic panel response**이며 **실제 시장 반응·구매율이 아니다**. disclaimer 항상 포함.
- 신뢰도 카드 + 가드레일을 모든 리포트에 포함. 가격/구매력은 소득·직업·자녀 축 없으면 **low**.
- 코어 타입(`src/types.ts`)·`aggregate` 수정 금지(read-only 오버레이). 런타임 외부 의존성 추가 금지.
- **P4-2 처방은 전부 `provenance:"inferred"` + `basis:"heuristic"` + 렌더 시 "AI 생성 초안·검토 필요" 배너.** "LLM이 깊게 분석한 결과"처럼 보이면 안 됨.
- **LLM/외부 API 호출 금지** — 처방 heuristic v1은 키 없이 rule/template. LLM 생성(v2)은 후속 [issue #4](https://github.com/Choihello/synth-persona/issues/4).

## 3. P4-1에서 구현된 것 (변경 파일과 역할)

| 파일 | 역할 |
|---|---|
| `src/report/types.ts` | `FounderInsightReport` + 전체 서브타입, `FounderReportOptions`. 처방 서브타입은 `provenance:"inferred"`+`basis` 필드 보유 |
| `src/report/generate.ts` | `generateFounderInsightReport(result, options, ctx?)` — 입력검증·overall·segments 결선·confidence/risky 결선·executiveSummary·appendix·disclaimer. **처방 필드는 빈 배열**(P4-2에서 채움). `DISCLAIMER`/`DEFAULT_MIN_N`(=8) export |
| `src/report/segments.ts` | `rankSegments(result, positiveChoice, minN)` — 순수. opportunity/resistance/observedButHeld + globalPositiveRatio |
| `src/report/confidence.ts` | `buildConfidenceCard(card)`, `buildRiskyAssumptions(card, hasPriceSignal, observedButHeldCount)`, `worstAttributeConfidence(card)` — `assessReliability`의 `ReliabilityCard`를 founder 언어로 |
| `src/index.ts` | 배럴 export(`generateFounderInsightReport` + 타입). ⚠️ `Confidence` 타입은 `assess/reliability`에서 이미 export되므로 report에서 재-export 안 함(중복 방지) |
| `src/report/{generate,segments,confidence}.test.ts` | 각 모듈 테스트(+17개) |

### P4-1 반영된 설계 결정 (보완 1~7)
- **positiveChoice 기본값** = `choices[0]`. 미지정 시 `appendix.caveats`에 `"positiveChoice assumed from choices[0]"` 기록. positiveChoice가 choices에 없거나 `choices.length < 2`면 **throw**.
- **3지선다 collapse caveat**: `choices.length > 2`면 "positive 1개 vs 나머지, 중립 응답이 negative로 합쳐질 수 있음" caveat 기록.
- **랭킹 공식**: `opportunityScore = (positiveRatio − globalPositiveRatio) × log(sampleCount)`, resistance는 부호 반대. 조건 `positiveRatio ≷ globalPositiveRatio && sampleCount ≥ minN`.
- **minN=8 미만 → `observedButHeld`**(판단 보류) 로 전량 보존. 랭킹 제외. (렌더 cap은 P4-3.)
- **weight**: `sampleCount`(랭킹 근거) + `sampleWeightShare`(≈인구비율, 보조)만 노출. populationHeadcount 미노출.
- **fidelity/ctx 없으면 구성 신뢰도 `unknown`**(high 추정 금지). 응답 신뢰도는 항상 `unknown`(미측정), 시장판단은 항상 `low`(부정형).
- **가격 신호**(`/원|월|구독|가격|₩|price/i`) + 축 결핍 → pricing riskyAssumption + 세그먼트 caveat.
- **처방은 빈 배열 유지**(P4-2).

## 4. 검증 결과 (P4-1 완료 시점)

- `npm test` → **155 passed (34 files)**
- `npm run lint` → clean (76 files)
- `npx tsc --noEmit` → exit 0
- `npm run build` → success
- `git diff --stat main -- src/types.ts src/aggregate/uncertainty.ts` → **변경 없음**(코어 불변)

## 5. 남은 작업

### P4-2: Actionable Founder Prescriptions (heuristic v1) — 다음 작업
- 파일: `src/report/prescriptions.ts`(+test), `src/report/generate.ts` 수정(generator 주입).
- **인터페이스** `PrescriptionGenerator`:
  - `drivers(ctx)` → `{ drivers: DriverInsight[]; objections: DriverInsight[] }`
  - `interviews(ctx)` → `InterviewTarget[]` (3~5개)
  - `interviewQuestions(ctx)` → `InterviewQuestion[]` (8~12개, **과거 행동 우선**, "이 앱 쓰겠어요?" 지양)
  - `survey(ctx)` → `SurveyQuestion[]`
  - `landingTests(ctx)` → `MessageTest[]`
  - `validationPlan(ctx)` → `ValidationAction[]` (Day 1~7)
- `generateFounderInsightReport(result, options, ctx, generator = new HeuristicPrescriptionGenerator())` — generator 주입 기본값. issue #4 LLM v2가 이 인터페이스 구현해 스왑.
- 규칙: 질문 키워드 heuristic(신뢰/가격/구독) → 매칭 실패 시 generic 폴백 + "free-text reason 수집 필요". 가격 축 결핍 → price 문항 `optional/caution`. 전부 `basis:"heuristic"`, confidence 대개 low.
- 테스트: 처방 전부 heuristic/inferred · 축결핍→price caution · 인터뷰 질문 과거행동형 존재 · opportunity 없을 때 안전한 폴백.

### P4-3: Markdown Renderer + Demo + Docs
- 파일: `src/report/render.ts`(+test), `eval/report-demo.ts`(+test), `package.json`(`report:demo`), `tsup.config.ts`(entry 추가 필수), `docs/README-intro.md`.
- `renderFounderInsightReport(report): string` — markdown 13 섹션(한줄요약·전체신호·기회·저항·관심/거부이유·위험가정·신뢰도카드·추천인터뷰·인터뷰질문·설문초안·랜딩테스트·다음7일·라벨).
- 처방 섹션에 **"⚠️ AI 생성 초안·검토 필요"** 배너. **observedButHeld cap**: markdown엔 상위 `min(10,N)`개만, 나머지는 `appendix.observedButHeldCount`로 "외 N개(판단 보류)" 요약. 데이터 객체엔 전량 보존.
- `report:demo` = census 합성인구 + MockProvider → generate → render 출력(키 불필요, tsup entry 필수).

상세: [plan](superpowers/plans/2026-07-01-founder-insight-report.md), [spec](superpowers/specs/2026-07-01-founder-insight-report-design.md).

## 6. 새 세션 시작 프롬프트 (복붙용)

```
synth-persona 프로젝트(C:\Users\zerat\OneDrive\바탕 화면\Teddy\synth-persona)를 이어서 진행해.
먼저 docs/handoff-2026-07-02-founder-report-p4-1.md 를 읽고, git log --oneline -5 + npm test 로 상태 확인.
Plan 4 P4-1(리포트 코어)은 완료·검증됨(155 테스트 그린, feat/founder-report-p4-1 브랜치). 다음은 P4-2(처방 heuristic v1).
플랜: docs/superpowers/plans/2026-07-01-founder-insight-report.md 의 P4-2 아웃라인을 bite-sized로 상세화 후 구현.
불변식: 결과=synthetic panel response(실제 시장 반응 아님) · 처방은 전부 inferred/heuristic/draft 라벨 · LLM/외부 API 호출 금지(issue #4로 후속) · 코어 타입/aggregate 수정 금지 · 가격/구매력은 축 결핍 시 low.
구현은 인라인, 각 단계 test/lint/tsc/build 그린 후 커밋.
```

## 7. 운영 메모

- P4-1 브랜치는 처방이 빈 배열이라 **단독으로도 완결·병합 가능**. P4-2를 이어서 같은 브랜치에 쌓아도 되고, P4-1을 먼저 main 병합 후 새 브랜치로 P4-2를 가도 됨(사용자 결정).
- biome: 긴 줄/포맷은 `npx biome check --write`로 정리.
