# LLM 관련성 게이트 설계 — 2026-07-05

## 문제

통계 게이트(2026-07-05-segment-gate)는 우연을 거르지만, **표본이 크고 효과도
큰데 인과적으로 무의미한** 축(예: 보안솔루션 질문 ↔ 혼인)은 통과할 수 있다.
질문↔차원 관련성은 통계로 판정 불가 — LLM 1콜로 판단해 2차 필터를 얹는다.

## 결정 사항 (브레인스토밍 합의)

- low 판정 축의 승격 세그먼트는 **제외 + 이유 명시** (숨김 아님):
  헤드라인·쉬운 요약·차트·처방에서 빠지고 "참고" 영역에 AI 판단 이유와 함께 보존
- 판정 실패·미지원 provider는 **조용한 폴백** (게이트 미적용, 현재와 동일)
- 보수 규칙: **확신할 때만 low** (잘못 제외 > 잘못 포함)
- "AI 판단" 라벨 필수 (basis=llm 철학)

## ① 판정 모듈 — `src/report/relevance.ts` (신규)

llm-prescriptions와 같은 계약 (generateJson 옵셔널, 실패 시 null):

```ts
export interface RelevanceVerdict {
  /** 차원 → 관련성. 판정 누락 차원은 소비자가 high로 취급 */
  relevant: Record<string, "high" | "low">;
  /** low 차원의 한 줄 이유 (렌더 caveat용) */
  reasons: Record<string, string>;
  basis: "llm";
}

export async function judgeDimensionRelevance(opts: {
  provider: LLMProvider;
  question: string;
  dimensions: string[]; // 응답 attrs에서 수집한 차원명 (예: 연령·성·지역·가구원수·혼인)
  seed?: number;
}): Promise<RelevanceVerdict | null>;
```

- `provider.generateJson` 미구현 → null. 호출 throw → null. 스키마 검증
  실패(차원 키 아님, high/low 아님) → null. (llm-prescriptions 패턴 그대로)
- JSON 스키마: `{ verdicts: [{ dimension, relevance: "high"|"low", reason }] }`
  — dimensions에 없는 항목은 무시, 누락 차원은 high 취급
- 시스템 프롬프트 요지: "질문에 대한 응답 성향이 이 인구 차원에 따라 달라질
  타당한 인과/상관 경로가 있으면 high. **확실히 무관할 때만 low.**
  불확실하면 high. low에는 한 줄 이유."
- 결정성: temperature 등은 provider 구현에 위임 (기존 generateJson 경로와 동일)

## ② 적용 — `src/report/generate.ts`

- `generateFounderInsightReport(result, options, reliability?, llmGen?,
  relevance?)` — 마지막 선택 인자 `relevance?: RelevanceVerdict | null`
- rankSegments 결과의 opportunity/resistance에서 `relevant[dim] === "low"`인
  항목을 빼서 신규 `lowRelevance: SegmentInsight[]`로 이동 (원래 순서 유지).
  이동 시 caveats에 `질문과 관련성이 낮아 보여 순위에서 제외 (AI 판단: {reason})`
  추가 — reason이 없으면 `(AI 판단)`까지만
- dim은 segmentLabel의 `=` 앞부분으로 판별 (기존 라벨 규약)
- weakSignals/withinNoise/observedButHeld는 그대로 (이미 비승격)
- FounderInsightReport에 `lowRelevance: SegmentInsight[]` 필드 추가
  (src/report/types.ts). relevance가 null/미전달이면 빈 배열
- appendix.caveats에 판정 요약 1줄 기록: `관련성 판단(AI): low = 혼인, 성`
  (low가 없으면 기록 생략; relevance null이면 기록 없음)
- executiveSummary·처방·차트·쉬운 요약은 정화된 opportunity/resistance를
  소비하므로 자동 반영 — 코드 변경 없음

## ③ 표기 — `src/report/render.ts`

- 참고 섹션 제목 변경: "## 참고 — 우연일 수 있는 차이" →
  **"## 참고 — 순위에 올리지 않은 차이"** (lowRelevance·weakSignals·
  withinNoise 중 하나라도 있으면 렌더, 전부 0이면 생략)
- 섹션 내 순서:
  1. lowRelevance 각 항목:
     `- 라벨 (긍정 X% · 페르소나 N명) — 질문과 관련성이 낮아 보여 제외 (AI 판단: 이유)`
  2. weakSignals 최대 5개 (기존 형식 유지)
  3. `- 우연 범위 내(±10%p 미만): …` (기존)
- 기존 테스트의 섹션 제목 문자열 갱신 필요

## ④ 호출 위치 — `web/pipeline.ts`

- buildLLMPrescriptions 호출 옆에서 `judgeDimensionRelevance` 호출
  (같은 provider·seed). dimensions는 `result.responses[0]` 기준이 아니라
  전체 응답 attrs 키의 합집합으로 수집
- generate 호출에 5번째 인자로 전달
- CLI·데모·키 없는 경로는 인자 미전달 → 게이트 미적용 (기존과 동일 출력)
- 비용: 리포트당 +1콜 (짧은 프롬프트, ≈$0.001 미만)

## ⑤ 검증 (전부 키 없이 — mock provider)

- judgeDimensionRelevance: 정상 JSON 파싱, generateJson 미구현 → null,
  throw → null, 스키마 위반(relevance 오타 값) → null, 누락 차원 high 취급
- generate 통합: relevance 주입 시 low 차원 승격 세그먼트가 lowRelevance로
  이동(+caveat), relevance null이면 이동 없음·빈 배열, "모든 축 low" →
  기회/저항 전멸 → 기존 "유의한 … 없음" 문구 경로
- render: lowRelevance 라인 형식, 새 섹션 제목, 세 목록의 순서
- pipeline: mock generateJson으로 low 판정 주입 시 md에 제외 라인 노출
- 라이브 스모크 1건으로 실동작 확인 (배포 후)

## 불변식 (유지)

src/types.ts·src/aggregate 무수정 · 테스트 키 없이 그린 · 코어 런타임 의존성
@anthropic-ai/sdk 단일 · og-stats "응답 분포:" 불릿 불변 · 쉬운 요약 통계
용어 금지(이번 변경으로 쉬운 요약 문구 변화 없음) · 조용한 폴백(관련성 판정
실패가 리포트 생성을 실패시키지 않음)

## 범위 밖

- 판정 결과 캐싱(질문별) — 리포트당 1콜이라 불필요 (YAGNI)
- 사용자에게 판정 오버라이드 UI 제공
