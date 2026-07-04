# 쉬운 요약 카드 ("한눈에 보기") 설계 — 2026-07-05

## 목적

통계를 모르는 독자도 리포트를 열자마자 결과를 직관적으로 이해하게 한다.
기존 13섹션 전문 리포트는 **한 글자도 바꾸지 않고**, 그 위에 생활 언어로 된
요약 카드 하나를 얹는다. 웹 리포트 전용 — CLI 출력은 불변.

## 결정 사항 (브레인스토밍 합의)

- **배치**: 공유 페이지 리포트 최상단 — 제목·상단 disclaimer 바로 아래,
  "## 한 줄 요약" 위. 탭/별도 페이지 아님.
- **생성 방식**: 결정적 템플릿 (LLM 호출 없음, 비용 0, 항상 일관, 테스트 가능)
- **구성 블록** (4개 전부): 판정+큰 숫자 · 누가 좋아했나/망설였나 ·
  다음 행동 · 얼마나 믿을 수 있나
- **접근안 A**: 구조화 리포트 객체(FounderInsightReport)에서 직접 생성,
  웹 pipeline이 md에 주입 (차트 주입과 동일 패턴). md 재파싱 금지.

## 모듈

### `web/easy-summary.ts` (신규 — charts.ts와 같은 웹 프레젠테이션 계층)

```ts
export function easySummaryHTML(
  report: FounderInsightReport,
  positiveChoice: string,
): string; // <section class="easy-summary">…</section> (marked HTML 통과)
```

순수 함수. `src/report/types.js`에서 type-only import. 외부 의존성 없음.

### 판정 매핑 (결정적)

r = distribution[positiveChoice] / total, signal = overallSignal.signal:

| 조건 | 판정 문장 |
|---|---|
| consensus & r ≥ 0.8 | 반응이 뚜렷하게 긍정적이에요 |
| consensus & r ≥ 0.6 | 긍정에 가까운 반응이에요 |
| split 또는 0.4 ≤ r < 0.6 | 반응이 갈렸어요 |
| 0.2 ≤ r < 0.4 | 부정에 가까운 반응이에요 |
| r < 0.2 | 반응이 뚜렷하게 부정적이에요 |

split이면 비율과 무관하게 "반응이 갈렸어요" (split 우선).
total = 0이면 카드 전체를 생성하지 않고 빈 문자열 반환.

### 4블록 문장 규칙

1. **판정 + 큰 숫자**: 판정 문장 헤드라인 + "10명 중 **X명**이 '{positiveChoice}'"
   (X = round(r×10)) + 작은 글씨 "가상 응답 {n}개 기준".
2. **누가 좋아했나/망설였나**: opportunitySegments[0]·resistanceSegments[0]의
   segmentLabel을 생활 언어로 변환해 "특히 {A}의 반응이 가장 좋았어요.
   반대로 {B}는 망설였어요." 한쪽이 없으면 해당 절 생략, 둘 다 없으면 블록 생략.
3. **다음 행동**: 기회 세그먼트가 있으면 "다음 할 일: {A} 실제 고객
   5~8명에게 직접 물어보고, 이 반응이 진짜인지 확인해 보세요."
   없으면 "다음 할 일: 잠재 고객 5~8명에게 직접 물어보며 확인해 보세요."
4. **얼마나 믿을 수 있나**: 고정 문장 "진짜 사람이 아니라 AI가 인구 구성을
   흉내 내 답한 결과예요 — 방향을 잡는 참고로만 쓰세요." +
   confidenceCard.responseConsistency.label 분기: high → "그래도 응답끼리는
   꽤 일관적이었어요.", low → "응답이 흔들려서 더 조심해서 봐야 해요.",
   그 외(medium/unknown) → 추가 문장 없음.

### 세그먼트 라벨 생활 언어 변환

`humanizeSegmentLabel("연령=45~49세") → "45~49세"` 형태의 결정적 변환:
- `차원=값` 형태에서 값을 취하고 차원별 후처리 사전 적용:
  - 연령 → 값 그대로 ("45~49세")
  - 지역 → "{값} 거주자" ("수도권 거주자")
  - 성 → "여자"→"여성", "남자"→"남성", 그 외 값 그대로
  - 가구원수 → "가구원수 N명" → "N인 가구"
  - 혼인 → 값 그대로 ("사별·이혼")
- 사전에 없는 차원·`=` 없는 라벨은 원문 그대로 (안전 폴백)

### 금지·안전 규칙

- 통계 용어 금지: n=, seed, %, 신뢰도 high/medium/low, consensus/split,
  긍정률 등 표기 사용 안 함 (생활 언어만)
- **"응답 분포:" 문자열 사용 금지** — og-stats 파서와 충돌 방지
- 모든 동적 텍스트(선택지·라벨)는 HTML 이스케이프 (charts.ts esc와 동일 수준)
- synthetic panel 과장 금지 불변식: 블록 4의 면책 문장은 항상 포함

## 주입 (`web/pipeline.ts`)

```ts
const easy = easySummaryHTML(report, positiveChoice);
if (easy) md = md.replace("## 한 줄 요약", `${easy}\n\n## 한 줄 요약`);
```

렌더된 md의 "## 한 줄 요약" 첫 등장 직전에 삽입. 제목(h1)과 상단
disclaimer는 카드 위에 유지 (문서 정체성·안전 라벨 우선).

## 스타일 (`app/src/app/globals.css`)

`.easy-summary` — 에디토리얼 카드:
- `--surface-raised` 배경 + `--hairline` 보더 + 라운드 (기존 .card 문법)
- 판정 헤드라인: 세리프(--font-serif), ~24px
- 큰 숫자: 세리프 ~44px, "10명 중"은 --ink-secondary 작은 글씨
- 블록 사이 hairline 구분, 면책 블록은 --ink-muted 13px
- **기존 토큰만 사용** → 다크 모드 자동 대응, 신규 색 없음 (dataviz 검증 불필요)

## 테스트

`web/easy-summary.test.ts` (신규):
- 판정 경계값: r = 0.8(뚜렷 긍정), 0.6(긍정 가까움), 0.5(갈림), 0.35(부정 가까움), 0.1(뚜렷 부정)
- split + r=0.85 → "반응이 갈렸어요" (split 우선)
- 큰 숫자 반올림 (87% → 9명)
- humanizeSegmentLabel: 사전 항목별 + 미지 차원 폴백 + `=` 없는 라벨
- 세그먼트 없음 → 블록 2 생략·블록 3 일반형
- consistency high/low/medium 분기
- 선택지에 `<script>` 포함 시 이스케이프
- "응답 분포:" 문자열 미포함 (og-stats 보호)
- total=0 → 빈 문자열

`web/pipeline.test.ts`: 주입 위치(제목 뒤·"## 한 줄 요약" 앞) 검증 1건 추가.

## 영향 범위

- 기존 13섹션 렌더(render.ts)·CLI·코어 무수정
- og-stats 영향 없음 (금지 규칙)
- 배포: web/·app/ 모두 변경되므로 Vercel 스킵 함정 해당 없음
