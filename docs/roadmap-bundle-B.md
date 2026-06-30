# 로드맵 — 묶음 B (Claude 실측: 진단 → 처방)

> 묶음 A(신뢰성 오버레이)와 B0(key-free census 파이프라인)까지는 **키 없이** 완료되어 `main`에 병합돼 있다. 묶음 B는 **실제 Claude 응답 추론**이 필요한 단계로, 전부 `ANTHROPIC_API_KEY`를 선결조건으로 한다. 아직 시작하지 않았다.

관련 설계: [product-reorientation-design](superpowers/specs/2026-06-30-product-reorientation-design.md) · [reliability-overlay-bundle-A plan](superpowers/plans/2026-06-30-reliability-overlay-bundle-A.md)

## 선결조건

- `.env`에 실제 `ANTHROPIC_API_KEY` (현재 `.env.example`은 빈 placeholder).
- 파이프라인은 B0에서 이미 완성됨 — `--source census`의 mock 자리에 `ClaudeProvider`를 붙이면 실데이터로 동작한다(`runCensusStudy`).

## 항목

### B1. 2층 응답 실측 (기능 점검)
- `runCensusStudy({ population: CensusPopulation, provider: ClaudeProvider, … })`로 합성 인구에 실제 시장조사 질문을 돌린다.
- 🔴/🟢 세그먼트 결과가 사용자에게 **유의미한지 냉정 평가**(맹탕/예스맨 아닌지).
- CLI는 `--source census`(키 없이 mock)에서 `--mock` 제거 시 그대로 Claude로 동작.

### B2. 3층 응답 신뢰도 실측 배선
- `censusShareRunner`(B0에서 provider 추상화 위에 준비됨)로 robustness(패러프레이즈·순서·속성 민감도)를 실측.
- probes(자기일관성·예스맨·평균회귀)를 study 경로에 연결.
- `ReliabilityCard.responseConsistency`의 `not-measured` placeholder를 실측값으로 교체.

### B3. 진단 → 처방: 다음 행동 생성물 (2층 LLM)
- 현재 출력은 **진단**(🔴/🟢 세그먼트 + 신뢰성 카드)에서 멈춘다. 제품의 알맹이는 **처방**이다.
- 생성물: 가장 반응할 세그먼트 · 끌릴 이유 · 거부 이유 · 병목(가격·신뢰·습관·대체재) · 만날 고객 유형 · 인터뷰 질문지 · 설문 문항 초안 · 랜딩 메시지 · 가장 불확실한 가정.
- 별도 brainstorming → spec → plan 사이클 권장.

## 불변식 (묶음 B에서도 유지)

- 숫자는 **synthetic panel response** — "구매율/시장 예측" 단정 금지.
- 1층(구성)과 2층(LLM 응답)을 출력에서 분리. 불확실성을 consensus처럼 포장 금지.
- "완전 5-way joint" 비주장. `Persona.weight`·provenance·householder bridge·suppressed(X)≠structural zero(-) 유지.
- 런타임 외부 의존성 추가 금지(`@anthropic-ai/sdk` 단일).
