# Changelog

## v0.2.0 (2026-07-04)

제품 루프(질문 → 실측 → 실데이터 근거 리포트) 완주 릴리스.

### 파이프라인
- 통계청 인구총조사 합성 인구(`--source census`, 키 불필요) + KOSIS 라이브 소스(라이브러리)
- simulate 워커풀: 동시성·순서 보존·재시도(라이브 opt-in)·counterbalance(라이브 기본 on)·진행 표시
- 프로바이더: OpenAI(기본, 내장 fetch)·Claude — askChoice(구조화 선택+이유)·generateJson(구조화 생성)·usage 집계 공통 계약
- `repeats` 풀링으로 run간 분산 완화

### 신뢰성 (묶음 A+B)
- 4층 신뢰성 카드: 구성(통계청 재집계 MAE/TVD)·속성 provenance·응답 일관성(**B2 실측**: 자기일관성·예스맨·순서·패러프레이즈·붕괴)·시장판단(항상 low)
- 실측 노트: B1(go, n=300 재확인) · B2(마지막 선택지 편향 계측 → counterbalance 도입) · B3

### 창업자 리포트 (Plan 4 + B3)
- 진단: 기회/저항/보류/동률 세그먼트 랭킹 (로그 가중, minN 보류)
- 처방: heuristic v1 + **LLM v2(B3)** — 실측 reason 층화 샘플 근거, 병목 태그, 전 항목 provenance/basis 라벨 + AI 초안 배너
- `report:demo`(키 불필요) · `report:live`(end-to-end) · `b2:live`(신뢰도 계측)

### 정직성 불변식
synthetic panel 라벨 상시 · 불확실성 미포장 · 코어 타입 무수정 오버레이 · 테스트 238개 전부 키 없이 그린

## v0.1.0 (2026-06-30)

key-free 공개 MVP — 합성 인구 파이프라인(묶음 A + B0), 신뢰성 오버레이, mock 데모.
