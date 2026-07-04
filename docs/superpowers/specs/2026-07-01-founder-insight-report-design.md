# Founder-facing Insight Report (Plan 4) 설계 — 2026-07-01

> synth-persona의 synthetic panel response를 초기 창업자가 바로 실행할 수 있는 **"0차 시장검증 리포트"**로 번역한다. 예측기가 아니라, 다음 고객 인터뷰·설문·랜딩 테스트를 **설계해주는 report layer**다. 본 문서는 north-star이며, 구현은 **P4-1 / P4-2 / P4-3** 세 단계로 분해한다(각 단계 독립 test/build 가능). 처방 생성은 **키 없는 heuristic v1**으로 하고, LLM 생성(issue #4)은 후속 v2로 남긴다.

관련: [product-reorientation-design](2026-06-30-product-reorientation-design.md) §3(진단→처방) · [roadmap-bundle-B](../../roadmap-bundle-B.md) B3

---

## 0. 최종 원칙

Plan 4의 핵심은 리포트를 예쁘게 요약하는 것이 아니라, synthetic panel output을 창업자가 바로 실행할 수 있는 **검증 행동**으로 번역하는 것이다. **숫자는 결론이 아니라 신호**이고, 리포트의 끝은 항상 **"다음에 누구를 만나고 무엇을 물어볼 것인가"**여야 한다.

## 1. 핵심 원칙 (불변식)

1. 숫자를 결론으로 만들지 말고, 다음 행동으로 번역한다.
2. 결과는 항상 **synthetic panel response**로 라벨링한다. "구매율/시장점유율/성공확률"처럼 표현하지 않는다.
3. 신뢰도 카드와 가드레일을 **모든** 리포트에 포함한다.
4. 가격/구매력/지불의향은 소득·직업·자녀 축이 없으면 **낮은 신뢰**로 표시한다.
5. LLM 응답은 "사용자 실측"이 아니라 "조건화된 가상 응답"이다.
6. 모든 **처방**(인터뷰/설문/랜딩/드라이버·오브젝션)은 `provenance:"inferred"` + `basis:"heuristic"` — 렌더 시 "AI 생성 초안 · 검토 필요" 배너. "LLM이 깊게 분석한 결과"처럼 보이면 안 된다.
7. 코어 타입(`src/types.ts`)·`aggregate`는 건드리지 않는다(read-only 오버레이). 런타임 외부 의존성 추가 금지.

## 2. 입력 계약 (G1)

`runStudy`/`runCensusStudy`는 **공통으로 `StudyResult`를 반환한다** — 별도 `CensusStudyResult` 타입은 없다.

```ts
generateFounderInsightReport(
  result: StudyResult,
  options: FounderReportOptions,
  ctx?: { fidelity?: FidelityReport; bridges?: Record<string, string> },
): FounderInsightReport

interface FounderReportOptions {
  question: string;
  choices: string[];
  positiveChoice?: string;   // G2 — 기회/저항 방향 정의. 기본값 = choices[0]
  minN?: number;             // G3 — 기본 8. 미만 세그먼트는 "판단 보류"
  concept?: ConceptMeta;
  founderGoal?: FounderGoal; // optional. v1은 executiveSummary 문구 + 섹션 강조에만 사용(생성 로직 동일)
}

interface ConceptMeta {
  productName?: string;
  conceptDescription?: string;
  targetCustomerHypothesis?: string;
  price?: string;
  channel?: string;
  alternatives?: string[];
}

type FounderGoal =
  | "targeting" | "pricing" | "message"
  | "problem-validation" | "feature-priority";
```

### 2.1 choice 의미 (G2)

- `positiveChoice`(단일)만 받는다. 명시 안 하면 **`choices[0]`을 positive로 간주**. 나머지 선택지는 전부 negative.
- v1에서 **neutral 개념은 도입하지 않는다**(YAGNI). 3지선다여도 positive 1개 vs 나머지로만 다룬다.
- `positiveRatio = positive 응답 수 / 세그먼트 응답 수`.

### 2.2 weight 의미 3분리 (G3 — 혼동 금지)

각 세그먼트에 다음을 **분리 표기**한다. `sampleForSimulation`이 추출 페르소나에 원본 인구 weight를 유지하므로, weight 합을 "인구수"로 쓰면 과대계상된다.

| 필드 | 의미 | 용도 |
|---|---|---|
| `sampleCount` | 해당 세그먼트 표본 응답 수 | **랭킹·대표성의 1차 근거** |
| `sampleWeightShare` | 세그먼트 표본 weight 합 / 전체 표본 weight 합 (≈ 인구 비율) | **보조 표기만** |
| ~~populationHeadcount~~ | (원본 인구수 합) | **의도적 미노출** — 오해 유발 |

## 3. 출력 타입 (G1)

```ts
interface FounderInsightReport {
  title: string;
  disclaimer: string;               // synthetic panel response 라벨, 항상 포함
  executiveSummary: ExecutiveSummary;
  overallSignal: OverallSignalSection;
  opportunitySegments: SegmentInsight[];
  resistanceSegments: SegmentInsight[];
  observedButHeld: SegmentInsight[]; // sampleCount < minN — 판단 보류
  keyDrivers: DriverInsight[];
  keyObjections: DriverInsight[];
  riskyAssumptions: RiskyAssumption[];
  confidenceCard: ConfidenceCard;
  recommendedInterviews: InterviewTarget[];
  interviewQuestions: InterviewQuestion[];
  surveyDraft: SurveyQuestion[];
  landingPageMessageTests: MessageTest[];
  nextValidationPlan: ValidationAction[];
  appendix: ReportAppendix;
}

type Confidence = "high" | "medium" | "low" | "unknown";
type Basis = "measured" | "heuristic";   // 처방은 heuristic

interface ExecutiveSummary {
  headline: string;                 // "성공 가능성 높다" 금지 → "어느 방향을 더 확인해야 한다"
  topOpportunity?: string;
  topResistance?: string;
  doNotTrustYet: string;            // 지금 믿으면 안 되는 판단
  thisWeekAction: string;
}

interface OverallSignalSection {
  signal: "consensus" | "split";
  distribution: Record<string, number>;
  missingRate: number;
  n: number;
  seed?: number;
  provider?: string;
  label: string;                    // "가상 패널 응답 기준 · 실제 시장 반응 아님 · 탐색 신호"
}

interface SegmentInsight {
  segmentLabel: string;             // 예: "연령=30~34세"
  segmentDefinition: string;
  sampleCount: number;
  sampleWeightShare: number;
  responseDistribution: Record<string, number>;
  positiveRatio: number;
  signal: "consensus" | "split";
  whyItMatters: string;
  likelyReasoning: string;          // inferred
  confidence: Confidence;           // 속성 provenance 반영
  caveats: string[];
  recommendedFollowUpQuestion: string;
}

interface DriverInsight {
  label: string;
  rationale: string;
  provenance: "inferred";
  basis: Basis;                     // "heuristic"
  confidence: Confidence;           // 대개 low
}

interface RiskyAssumption {
  assumption: string;
  whyRisky: string;
  howToTest: string;
}

interface ConfidenceLayer {
  label: Confidence;
  reason: string;
  whatThisAllows: string;
  whatThisDoesNotAllow: string;
}
interface ConfidenceCard {
  composition: ConfidenceLayer;     // 1층 구성
  attributes: ConfidenceLayer;      // 2층 속성(provenance)
  responseConsistency: ConfidenceLayer; // 3층 응답(미측정)
  marketJudgment: ConfidenceLayer;  // 4층 시장판단(부정형)
}

interface InterviewTarget {
  targetLabel: string; whyInterview: string; whatToValidate: string;
  suggestedRecruitingScreener: string; sampleSizeRecommendation: string;
  provenance: "inferred"; basis: Basis;
}
interface InterviewQuestion {
  text: string;
  type: "problem-discovery" | "current-alternative" | "frequency"
      | "trust-barrier" | "willingness" | "message-test" | "price";
  provenance: "inferred"; basis: Basis; caution?: string;
}
interface SurveyQuestion {
  text: string;
  kind: "segmentation" | "problem-frequency" | "alternative"
      | "concept-reaction" | "reason" | "price";
  optional?: boolean; caution?: string;
  provenance: "inferred"; basis: Basis;
}
interface MessageTest {
  headline: string; subcopy: string; targetSegment: string;
  hypothesis: string; successMetric: string; caution: string;
  provenance: "inferred"; basis: Basis;
}
interface ValidationAction { day: string; action: string; }

interface ReportAppendix {
  generatedAt: string;
  options: FounderReportOptions;    // 재현용(positiveChoice/minN 포함)
  reliabilityCardRaw?: ReliabilityCard;
}
```

## 4. 생성 로직

### 4.1 세그먼트 랭킹 (G3)

- 각 `dim×세그먼트`에서 `positiveRatio`와 `sampleCount` 산출(`result.responses`로 재집계 — `aggregate` 수정 없음).
- 전체 positive 비율을 기준선으로.
- **opportunity**: `sampleCount ≥ minN` 이고 positiveRatio > 기준선 → `positiveRatio × log(sampleCount)` 내림차순.
- **resistance**: `sampleCount ≥ minN` 이고 positiveRatio < 기준선 → 낮은 순.
- **observedButHeld**: `sampleCount < minN` → 랭킹서 제외, "관찰됨·판단 보류" 목록으로. (작은 표본 100% 긍정 과대평가 방어.)
- 각 SegmentInsight의 `confidence`는 해당 dim의 provenance(assessReliability)를 반영 — conditioned/inferred면 저확신.

### 4.2 Confidence Card / Risky Assumptions 매핑

기존 `assessReliability(result, ctx)` → `ReliabilityCard`를 founder 언어로 재구성:
- `composition` → 1층, `attributes` → 2층, `responseConsistency`(not-measured) → 3층, `guardrails`+`missingAxes` → 4층(부정형) + `riskyAssumptions` 항목으로 전개.
- **가격 가드**: 질문/positiveChoice에 가격 신호(정규식 `원|월|구독|가격|₩|price`)가 있는데 `missingAxes`에 소득/직업/자녀가 있으면 pricing 관련 confidence를 **low로 강제**하고 riskyAssumption 추가.
- 필수 riskyAssumptions: 가격 판단 가능 여부 · 소득/직업/자녀 축 미포함 영향 · conditioned/inferred 의존 · LLM 응답 실측 아님 · low-n 세그먼트 존재.

### 4.3 처방 생성 (P4-2, heuristic v1)

```ts
interface PrescriptionGenerator {
  drivers(ctx: PrescriptionContext): { drivers: DriverInsight[]; objections: DriverInsight[] };
  interviews(ctx): InterviewTarget[];
  interviewQuestions(ctx): InterviewQuestion[];
  survey(ctx): SurveyQuestion[];
  landingTests(ctx): MessageTest[];
  validationPlan(ctx): ValidationAction[];
}
```
- v1 = `HeuristicPrescriptionGenerator`(키 없음). issue #4의 LLM v2는 이 인터페이스를 구현해 스왑.
- 질문 키워드 heuristic(신뢰→trust, 가격→price-caution, 구독→subscription-fatigue). **한국어 취약성 인지** → 매칭 실패 시 generic 폴백 + "free-text reason 수집 필요" 표기. 전부 `basis:"heuristic"`, confidence 대개 low.
- 인터뷰 질문: **과거 행동 우선**("최근 한 달 안에 …곤란했던 순간"), "이 앱 쓰겠어요?" 류 지양. willingness/price 질문은 confidence가 허용할 때만, 아니면 caution.
- 가격 처방: 축 결핍 시 price 문항 `optional/caution`.

## 5. 렌더러 (P4-3)

`renderFounderInsightReport(report): string` — markdown, **13 필수 섹션**:
1. 한 줄 요약 · 2. 전체 신호 · 3. 기회 세그먼트 · 4. 저항 세그먼트 · 5. 관심 이유/거부 이유 · 6. 위험한 가정 · 7. 신뢰도 카드 · 8. 추천 인터뷰 대상 · 9. 인터뷰 질문 · 10. 설문 초안 · 11. 랜딩페이지 메시지 테스트 · 12. 다음 7일 검증 액션 · 13. **"synthetic panel response · 실제 시장 반응 아님"** 라벨(상단+하단).
- 처방 섹션(8~11)은 **"⚠️ AI 생성 초안 · 검토 필요"** 배너를 머리에 단다.
- `observedButHeld`는 3·4 아래 "판단 보류(low-n)" 소절로.

## 6. 단계 분해 (P4-1 / P4-2 / P4-3)

| 단계 | 파일 | 산출물 | 키 |
|---|---|---|---|
| **P4-1** Report Core | `src/report/types.ts`, `src/report/generate.ts`, 테스트 | 타입 + `generateFounderInsightReport`(overall/segments 랭킹/minN guard/confidence·risky 매핑/disclaimer). 처방 필드는 빈 배열로 둠 | 불필요 |
| **P4-2** 처방 heuristic v1 | `src/report/prescriptions.ts`, 테스트 | `PrescriptionGenerator` + heuristic 구현, generate에 결선 | 불필요 |
| **P4-3** 렌더+데모+문서 | `src/report/render.ts`, `eval/report-demo.ts`, `package.json`(`report:demo`), `tsup.config.ts`, README-intro | markdown 렌더 + `report:demo` + 예시 갱신 | 불필요 |

배럴(`src/index.ts`): `generateFounderInsightReport`·`renderFounderInsightReport`·`PrescriptionGenerator`·주요 타입 export.

## 7. 테스트 / 불변식

**단계별 필수 테스트**
- P4-1: split→opportunity/resistance 분리 · low-n(<8)→observedButHeld · positiveChoice 기본값(choices[0]) 동작 · 가격질문→pricing confidence low · disclaimer 항상 포함 · weight 3필드 분리.
- P4-2: 처방 전부 `basis:"heuristic"`·`provenance:"inferred"` · 축 결핍→price 문항 caution · 인터뷰 질문 과거행동형 존재.
- P4-3: 렌더 출력에 13 섹션·synthetic panel 라벨·"초안 검토 필요" 배너 포함 · `report:demo` 실측.

**불변식**: 코어 타입·`aggregate` 미수정 · 외부 의존성 0 · 완전 5-way joint 비주장 · 모든 숫자 synthetic panel response · 처방 inferred/heuristic 라벨 · 가격/구매력 축결핍 시 low+가드레일 · low-n 과신 금지. 각 단계 `npm test`/`lint`/`tsc`/`build` 그린.

## 8. 범위 밖 (YAGNI)

웹 UI · TAM/SAM/SOM · 실측 구매율 예측 · 실제 패널 모집 · LLM deep analysis(v2, issue #4) · 외부 API 호출 · 결제/계정 · 소득/직업/자녀 축 추가 · neutral choice 개념.
