# 세그먼트 유의성 게이트 + 정직 표기 설계 — 2026-07-05

## 문제

`rankSegments`는 세그먼트가 전체 평균보다 조금이라도 높/낮으면 기회/저항으로
승격한다 (유의성 검정 없음). n=9에서 +2%p 같은 순수 우연이 "최우선 기회"로
한 줄 요약·쉬운 요약·차트·처방 4곳에 증폭된다. 질문과 무관한 속성(예:
보안솔루션 질문에 혼인=사별·이혼)이 결과에 영향을 주는 것처럼 보여 신뢰를
깎는다. 또한 응답 90개는 페르소나 30명 × 반복 3회라 세그먼트 유효 표본은
표시보다 작다.

## 결정 사항 (브레인스토밍 합의)

- **A. 통계 게이트** (결정적) + **C. 표기 정직화**를 한 묶음으로. B(LLM
  관련성 게이트)는 이번 범위 밖 — 후속 후보로만 기록
- **2티어 게이트**: 뚜렷한 신호만 승격, 약한 신호는 "우연일 수 있음" 강등,
  나머지는 우연 범위 한 줄
- 유의성은 **페르소나 단위**(반복 클러스터링 보정)로 계산
- CLI 리포트에도 동일 적용 (의도된 품질 변화)

## ① 페르소나 단위 재집계 (src/report/segments.ts)

- 응답을 `persona.id`로 그룹: 페르소나의 반복 K회(choice 파싱된 것만) 중
  positiveChoice 선택 횟수가 **과반(> K/2)** 이면 그 페르소나는 긍정 1,
  아니면(동률 포함, 보수적) 비긍정 0
- choice가 전부 null인 페르소나는 페르소나 단위 집계에서 제외
- 전체 긍정률 `globalPersonaRatio`와 세그먼트 긍정률 `segPersonaRatio`,
  세그먼트 페르소나 수 `nP`를 이 이진값으로 계산
- **표시용 수치는 불변**: SegmentInsight의 responseDistribution·
  positiveRatio·sampleCount 등 기존 필드는 지금처럼 응답 단위 그대로.
  게이트 판정에만 페르소나 단위 값을 쓴다
- SegmentInsight에 `personaCount: number` 필드 추가 (렌더 각주용)

## ② 2티어 게이트 규칙

상수 (segments.ts에서 export, 테스트로 고정):

```ts
export const GATE_Z = 1.645;       // Wilson 90% 신뢰구간
export const GATE_MIN_EFFECT = 0.1; // 최소 효과 크기 10%p
```

세그먼트별 (minN 통과분에 한해 — minN은 기존 응답 수 기준 그대로 유지):

- `diff = |segPersonaRatio - globalPersonaRatio|`
- Wilson 90% 구간 `[lo, hi]`를 (segPersonaRatio, nP, GATE_Z)로 계산
- **뚜렷한 신호**: `diff >= GATE_MIN_EFFECT` && 구간이 globalPersonaRatio를
  배제 (`globalPersonaRatio < lo || globalPersonaRatio > hi`) → 기존
  opportunity/resistance로 승격 (score 정렬 기존 유지)
- **약한 신호**: `diff >= GATE_MIN_EFFECT` && 구간이 평균 포함 →
  신규 `weakSignals: SegmentInsight[]` (score와 동일 기준 내림차순).
  caveats에 `"표본이 작아 우연일 수 있음 (페르소나 N명 기준)"` 추가
- **우연 범위**: `diff < GATE_MIN_EFFECT` → 신규 `withinNoise:
  SegmentInsight[]` (기존 atBaseline은 withinNoise로 흡수·제거)
- `nP === 0`인 세그먼트(전 응답 파싱 실패)는 withinNoise로

반환 타입 변경: `{ opportunity, resistance, weakSignals, withinNoise,
observedButHeld, globalPositiveRatio }` — `atBaseline` 필드 삭제
(소비처는 generate.ts뿐이므로 함께 갱신).

윌슨 구간 (표준 공식, segments.ts 내 비공개 함수):

```
center = (p + z²/2n) / (1 + z²/n)
half   = z·√(p(1−p)/n + z²/4n²) / (1 + z²/n)
[lo, hi] = [center − half, center + half]
```

## ③ 표기 정직화

### render.ts (src/report/render.ts)

- 기회/저항 섹션: 뚜렷한 신호만 (기존 렌더 형식 유지, personaCount 각주:
  `(n=18 · 페르소나 6명 · …)` 형태로 sampleCount 옆에 병기)
- 기회 세그먼트 0개일 때 기존 "(minN을 넘는 기회 세그먼트 없음)" 문구를
  `"(유의한 기회 세그먼트 없음 — 90개 응답 규모에서 흔한 일입니다)"`로 교체
  (저항도 동일 패턴)
- 신규 섹션 "## 참고 — 우연일 수 있는 차이": weakSignals 또는 withinNoise가
  하나라도 있으면 렌더. 내용: ① weakSignals 최대 5개, `- 라벨 (긍정 X% ·
  페르소나 N명) — 표본이 작아 우연일 수 있음` 한 줄씩 (0개면 이 목록 생략),
  ② 섹션 말미 한 줄 `- 우연 범위 내(±10%p 미만): 라벨, 라벨, …` (withinNoise
  0개면 이 줄 생략). 둘 다 0개면 섹션 자체 생략

### web/easy-summary.ts

- opportunitySegments/resistanceSegments가 모두 비면 "누가" 블록 대신
  고정 문장: `"세그먼트 간 뚜렷한 차이는 없었어요."` (easy-who 클래스 유지)
- 다음 할 일: 기회 세그먼트가 없으면 기존 일반형 문장 그대로

### web/pipeline.ts

- segmentBarsSVG 입력을 opportunity+resistance(= 뚜렷한 신호만)로 유지 —
  게이트 후 자동으로 정화됨. **0개면 차트 주입 생략** (segSvg 빈 배열 가드
  는 segmentBarsSVG가 이미 "" 반환하는지 확인, 아니면 가드 추가)

### generate.ts (src/report/generate.ts)

- rankSegments 반환 타입 변경 반영 (atBaseline → weakSignals/withinNoise)
- FounderInsightReport에 `weakSignals`·`withinNoise`를 전달할 새 필드 추가
  (src/report/types.ts — 코어 types.ts 아님, 수정 허용):
  `weakSignals: SegmentInsight[]; withinNoise: SegmentInsight[];`
- executiveSummary topOpportunity/topResistance·처방(인터뷰 타깃 등)은
  opportunitySegments를 소비하므로 자동 정화 — 코드 변화 없이 동작 확인만

## ④ 검증 예시 (테스트로 고정)

- nP=3·ratio 2/3(0.667)·global 0.6 (diff 6.7%p < 10%p) → **우연 범위**
- 사용자 사례의 실제 귀결: "혼인=사별·이혼 89%, n=9" ≈ nP=3·ratio 1.0·
  global 0.87 (diff 13%p지만 Wilson 90% lo ≈ 0.53이 0.87 포함) →
  **약한 신호** — 한 줄 요약·쉬운 요약·차트에서 사라지고 "우연일 수 있음"
  참고 목록으로만 남는다
- nP=5·ratio 1.0·global 0.87 (diff 13%p, lo ≈ 0.65 < 0.87) → **약한 신호**
- nP=15·ratio 1.0·global 0.6 (diff 40%p, lo ≈ 0.85 > 0.6) → **뚜렷한 신호**
- 동률(반복 2회 중 1:1) 페르소나 → 비긍정 처리
- 전 세그먼트 게이트 탈락 → render "유의한 기회 세그먼트 없음" 문구 +
  easy-summary "뚜렷한 차이는 없었어요" + 차트 생략

## 불변식 (유지)

`src/types.ts`·`src/aggregate` 무수정 (Persona.id 읽기만) · 표시용 응답
분포 수치 불변 · synthetic panel 과장 금지(오히려 강화) · 테스트 키 없이
그린 · 쉬운 요약 카드에 통계 용어 금지("우연", "표본" 같은 생활어는 허용,
"신뢰구간"·"%p" 금지) · og-stats "응답 분포:" 불릿 형식 불변(render의 전체
신호 줄은 건드리지 않음)

## 범위 밖 (후속 후보)

- B. LLM 관련성 게이트 (질문↔차원 관련성 1콜, basis=llm 라벨)
- GATE_MIN_EFFECT/GATE_Z의 사용자 설정화
