# 리포트 표현 계층 개편 v2 — 설계 (2026-07-07)

## 0. 배경

라이브 리포트를 실사용하며 나온 표현 계층 피드백 4묶음(검토 ①~③)을 반영한다.
공통 진단: **리포트가 "가치"보다 "한계"를 먼저·과하게 보여줘 신뢰와 가독성을
떨어뜨린다.** 통계·게이트 로직은 이미 정확하므로 이번 개편은 **표현 계층만**
손댄다.

**대원칙 (불변):**
- `src/report/segments.ts`·`confidence.ts`의 게이트·집계 **판정 로직 무수정**
- 정직성 신호(우연일 수 있음·low·판단 보류·synthetic 고지)는 **삭제 금지** —
  재배치·압축·리프레이밍만 허용 (이게 이 도구의 차별점)
- 없는 데이터·근거를 지어내지 않는다 (부풀리기 금지)
- 테스트는 API 키 없이 그린 · 코어 의존성 단일 유지

## 1. 파트 1 — 표본 단위 60명 통일 (검토①)

**문제**: 같은 리포트에서 쉬운 카드는 "60명 중 6명"(페르소나 60), 전체 신호·막대는
"쓴다 19명"(응답 180)으로 나와 혼동. 게다가 막대의 "(19명)"은 응답 수를 "명"으로
오표기(19+161=180명인데 실제 사람은 60명).

**결정: 사람이 세는 곳은 전부 페르소나(60) 단위. 180은 "각 3회 응답" 방법론
맥락으로만.**

### 1-1. 데이터 노출
- `OverallSignalSection`(types.ts)에 **옵셔널 필드 2개 추가** (기존 필드 무수정):
  - `panelSize?: number` — 고유 페르소나 수 (데모: 60)
  - `panelPositive?: number` — 과반투표 긍정 페르소나 수 (실제값, 근사 아님)
- `rankSegments`(segments.ts) 반환에 `panelSize`(= `perPersona.size`),
  `panelPositive`(= `globalPersonaPos`) 추가 (판정 로직 무수정, 이미 계산된 값 노출).
- `generate.ts`의 `overallSection`이 이 값을 받아 `OverallSignalSection`에 채운다.
  값이 없으면(구 데이터·CLI) 필드 미설정 → 소비처는 폴백.

### 1-2. 표시
- **쉬운 카드**(easy-summary.ts): denominator·분자를 `panelSize`·`panelPositive`
  실제값으로. 둘 다 있으면 "`panelSize`명 중 `panelPositive`명", 없으면 기존
  `panelSize`(파라미터)×비율 폴백. "가상 응답 N개 기준"의 N은 응답 수(180) 유지.
- **막대**(charts.ts `shareBarSVG`): 라벨을 페르소나 수로 —
  "쓴다 10% (6명) / 안쓴다 90% (54명)", 제목 "표본 60명 · 각 3회 응답(총 180)".
  → 시그니처에 panelSize/panelPositive(또는 페르소나 분포) 전달 필요.
- **전체 신호 텍스트**(render.ts): "쓴다 6명(10%) / 안쓴다 54명(90%) · 표본 60명 ·
  각 3회 응답(총 180) · seed=…". 응답 단위 분포(안쓴다=161)는 부가로 유지 가능하나
  "명"이 아니라 "응답"으로 라벨.
- **og-stats.ts**: render 문구가 바뀌므로 파서(`응답 분포:`·`n=` 매칭) 갱신.
  OG 이미지 통계 표기가 60명 기준과 일관되도록.

### 1-3. 주의
- `panelPositive`(과반투표)와 `round(응답비율×60)`은 ±1 다를 수 있음 — 실제값 사용이
  목적이므로 `panelPositive` 우선.
- 응답 분포(180)를 완전히 숨기지 않는다 — "각 3회 응답(총 180)" 맥락으로 남겨
  방법론 투명성 유지.

## 2. 파트 2 — 순서 재배치 + 리프레이밍 (검토②-1,2)

**문제**: "기회 없음·저항 없음·우연일 수 있음"이 상단을 채우고, 정작 쓸모 있는
"관심/거부 이유"가 그 아래 묻힘. 신뢰가 무너지고 알맹이가 안 보임.

### 2-1. 섹션 순서 (render.ts)
현재: 한줄요약 → 전체신호 → 기회 → 저항+판단보류 → 참고 → **관심/거부이유** →
위험한가정 → 신뢰도카드 → 처방들…

**신규**: 한줄요약 → 전체신호 → **관심/거부 이유(★상향)** → 기회/저항 세그먼트 →
참고(압축) → 위험한 가정 → 처방들 → **(부록)신뢰도 카드** → 출처

### 2-2. 리프레이밍 (문구만, 신호 유지)
- **"없음" 세그먼트**: "(유의한 기회 세그먼트 없음 — 이 규모의 가상 패널에서 흔한
  일입니다)" → **"이 규모(60명)에선 세그먼트별 차이가 통계적으로 뚜렷하지 않았어요
  — 전체 방향(위)이 핵심 신호입니다. 세그먼트로 쪼개 보려면 표본을 키우세요."**
  (저항 세그먼트도 동일 톤)
- **"참고 — 순위에 올리지 않은 차이"**: 제목·리드를 방어→필터링 프레임으로.
  예: "## 확실한 것만 추렸습니다 — 아래는 표본 대비 작아 판단 보류".
  "우연 범위 내(±10%p 미만): [20개 나열]" → **개수로 압축**: "그 외 N개 차이는
  우연 범위(표본 대비 작아 판단 보류)". weakSignals 캐비앳("표본이 작아 우연일 수
  있음")은 유지하되 최대 표시 개수 유지(현행 slice(0,5)).

## 3. 파트 3 — 배너 구분 (검토②-3)

**문제**: `AI_DRAFT_BANNER`("heuristic으로 생성된 추정 초안")가 5개 섹션에 획일
적용. drivers/objections는 실제 응답 이유 N건 기반(basis:"llm")인데 heuristic으로
폄하됨.

**결정**: 섹션의 실제 basis에 따라 배너를 나눈다.
- **관심/거부 이유**: drivers/objections의 `basis`가 "llm"이면 →
  "> 💡 **실제 응답 이유를 종합한 AI 요약** — 아래는 패널의 실제 응답 이유를
  묶은 것입니다. 참고로 쓰고, 실제 고객으로 검증하세요." (basis "heuristic"이면
  기존 배너 유지)
- **순수 초안 섹션**(추천 인터뷰·질문·설문·랜딩·7일): 기존 `AI_DRAFT_BANNER` 유지.
- render가 `keyDrivers`/`keyObjections`의 `basis`(DriverInsight.basis 존재 확인)를
  참조해 관심/거부 배너를 분기. drivers·objections가 섞이면 llm 우선(하나라도 llm이면
  실측 배너), 전부 heuristic이면 heuristic 배너.

## 4. 파트 4 — 신뢰도 카드 평이화 + 부록 (검토②-4)

**문제**: 4층 표(matched/conditioned/inferred/unknown/fidelity)가 본문 한복판에
전문용어 벽으로. 온통 low/unknown이라 오히려 신뢰를 깎음. 소유자도 이해 못 함.

**결정: 4층 표를 맨 아래 부록으로 강등 + 용어 생활 언어 병기.**
- 본문에는 신뢰 요약을 남기지 않는다(쉬운 요약 카드의 "진짜 사람이 아니라 AI가…"가
  이미 그 역할 — 중복 제거). 위험한 가정 섹션도 유지되므로 본문 신뢰 맥락은 충분.
- 4층 표는 "## 기술 상세 — 신뢰도 4층" 제목으로 **출처 직전(부록 영역)**에 배치.
- 층별 용어 생활 언어 병기: 예 "matched(실측 일치)", "inferred(연령 경유 추정)",
  "unknown(측정 안 됨)", "fidelity(원본 분포 재현도)". 표 구조·수치는 유지.

## 5. 파트 5 — 출처 계층화 (검토③)

**문제**: 출처가 Nemotron(서사 곁가지)만 표기. 핵심 통계 근거인 통계청 인구총조사가
빠져 전문성이 저평가됨.

**결정: "데이터 근거 / 서사"로 계층화. 실제 번들 census 메타의 실표만 인용.**
- census attribution 문자열을 pipeline(또는 generate)에서 `appendix.caveats`에
  주입, render 출처 섹션이 표시:
  ```
  ## 출처

  데이터 근거
  - 인구 분포: 통계청 인구총조사 2024 (KOSIS) — 성·연령·지역(DT_1IN1509),
    혼인(DT_1MR2060), 가구원수(DT_1JC1511). IPF 반복비례적합으로 결합분포 합성.
  - 페르소나 배경 서사: NVIDIA Nemotron-Personas-Korea (CC BY 4.0)
  ```
- 표 ID·연도는 `data/census/kr-2024.json`의 `meta.sources`·`meta.year`와 일치해야
  한다(하드코딩 시 그 값과 대조). 미래 스냅샷 교체 시 재확인.
- ⚠️ 경계: TS가 실제 쓰는 **census(인구총조사) + Nemotron 둘만**. 소득·지출·디지털
  등 없는 레이어 추가 금지.

## 6. 파일·유닛

| 파일 | 변경 |
|---|---|
| `src/report/types.ts` | OverallSignalSection에 옵셔널 `panelSize`·`panelPositive` |
| `src/report/segments.ts` | rankSegments 반환에 panelSize·panelPositive (판정 무수정) |
| `src/report/generate.ts` | overallSection에 값 전달·주입, census attribution 주입 |
| `web/easy-summary.ts` | 실제 panelPositive/panelSize 사용 |
| `web/charts.ts` | shareBarSVG 페르소나 단위 라벨 |
| `web/og-stats.ts` | 파서 새 문구 대응 |
| `src/report/render.ts` | 순서·리프레이밍·배너 분기·신뢰도카드 부록·출처 계층 |
| `web/pipeline.ts` | census attribution 주입(선택 — generate에서 하면 불필요) |

## 7. 테스트 전략

- **파트1**: segments.test(반환 panelSize·panelPositive 값), easy-summary.test
  (실제값 사용·폴백), charts.test(페르소나 라벨), og-stats.test(새 문구 파싱),
  render.test(전체신호 60명 표기). TDD.
- **파트2**: render.test — 섹션 순서(관심이유가 기회세그먼트보다 앞), 리프레이밍
  문구 존재, 우연범위 개수 압축.
- **파트3**: render.test — llm basis면 실측 배너·heuristic 배너 미출현, 반대도.
- **파트4**: render.test — 신뢰도 표가 출처 직전(부록), 본문 중복 신뢰요약 제거.
- **파트5**: render.test·generate.test — 출처에 census 실표 ID·Nemotron 병존.
- 전체 게이트: vitest(키 없이)·tsc·biome·app next build. 라이브 스모크(신규 리포트
  1건 생성해 60명 표기·순서·출처 육안 — 관리자 쿠키로 한도 우회 가능).

## 8. 스코프·순서

한 스펙, 플랜에서 **파트1(데이터 구조 먼저) → 파트5(출처, 독립) → 파트2·3·4
(render 표현, 함께)** 순으로 태스크 분할. 파트1이 데이터 계약을 바꾸므로 선행.
파트2~4는 모두 render.ts라 한 태스크로 묶을 수 있으나 리뷰 단위로 분할 가능.

## 9. 불변식 재확인

- types.ts는 **옵셔널 추가만**(기존 필드 무수정) — 사용자 승인분
- 게이트 판정(z-검정·효과크기)·세그먼트 집계 무수정
- 정직성 신호 삭제 없음(재배치·압축·리프레이밍만)
- synthetic 고지·Nemotron CC BY·census 저작권 표기 유지
- 파이썬 프로젝트 정보 유입 없음
