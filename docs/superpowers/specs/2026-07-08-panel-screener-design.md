# 패널 스크리너 (설계) · 2026-07-08

## 문제

리포트가 `판단 보류 (표본 부족)`로 특정 연령대를 반복해서 제외한다. 실제 라이브 리포트
(`RZrj0gVdVU`):

```
### 판단 보류 (표본 부족)
- 연령=15~19세 (n=6) — 표본 부족으로 랭킹 제외
- 혼인=해당없음 (n=6) — 표본 부족으로 랭킹 제외
- 연령=30~34세 (n=6) — 표본 부족으로 랭킹 제외
- 연령=85세이상 (n=3) — 표본 부족으로 랭킹 제외
```

원인은 질문의 추상성이 아니다. **60명을 15개 연령구간 × 성 × 지역 × 혼인 × 가구원수에
인구 가중으로 흩뿌리기 때문**이다. `minN = 8`은 **응답 단위**이므로(`repeats = 3`)
페르소나 3명 미만인 버킷이 잘린다. 꼬리 연령구간(`15~19세`·`85세이상`)이 구조적으로 걸린다.

창업자가 `20~39세 수도권`만 검증하고 싶어도 지금은 방법이 없다. 표본의 상당수가
관심 밖 집단에 쓰인다.

## 목적

**타깃 집단 내 반응을 본다.** 부수 효과로 버킷당 표본이 커져 판단 보류가 줄고 검정력이
오른다. `20~39세`로 좁히면 연령 구간이 4개 남고 60명이 구간당 ~15명 → 45응답으로
`minN = 8`을 크게 넘는다.

## 절대 경계 — 없는 축은 제공하지 않는다

이 도구가 가진 축은 다섯 개가 전부다.

```
core (IPF 결합분포):  성(2) · 연령(15) · 지역(수도권/비수도권)
conditional:          혼인 · 가구원수
없음:                 직업 · 소득 · 자녀 · 도심 여부 · 학력 · 산업
```

리포트가 매번 `아직 믿으면 안 되는 것: 소득·직업·자녀 축 없음`이라 쓰는 이유다.
**자유 텍스트 스크리너는 "직장인만 골랐다"는 착각을 만든다.** 없는 축으로 거른 척하는 것은
`docs/handoff-2026-07-08-report-v2-admin.md` §4가 "부풀리기"라 금지한 행위다.
스크리너는 **구조화 입력**이며, 이번 범위는 **연령 범위 + 지역**뿐이다.

## 설계

### 1. `src/population/screen.ts` (신규, 순수 함수)

```ts
export interface PanelScreener {
  연령?: string[];              // 허용 라벨 목록 ("20~24세" … "35~39세")
  지역?: "수도권" | "비수도권";
}
export function screenPersonas(all: Persona[], s?: PanelScreener): Persona[];
export function screenerLabel(s?: PanelScreener): string;   // "20~39세 · 수도권" | "전체 인구"
export function constantDims(sample: Persona[]): string[];  // 값이 하나뿐인 축
```

범위 → 라벨 목록 변환은 **검증 계층**의 일이다. 코어는 라벨 집합만 알면 되고 축의 순서를
알 필요가 없다. `screener` 미지정이면 `screenPersonas`는 입력을 그대로 반환한다.

### 2. 필터 지점 — `src/study.ts:93-94`

현행:

```ts
const all = await config.population.population();          // :93
let sample = sampleForSimulation(all, config.n, config.seed ?? 1);  // :94
```

개편:

```ts
const all = await config.population.population();
const screened = screenPersonas(all, config.screener);
if (screened.length === 0) throw new Error("스크리너 조건에 맞는 인구가 없습니다.");
let sample = sampleForSimulation(screened, config.n, config.seed ?? 1);
```

**새 수학이 없다.** `sampleForSimulation`은 총 가중치를 인자에서 재계산하므로
(`src/population/source.ts:12` — `personas.reduce((s,p)=>s+p.weight,0)`) 인구 가중치
재정규화가 공짜다. `CensusStudyConfig`에 `screener?: PanelScreener` 옵셔널 추가.

### 3. 고정된 축은 세그먼트에서 제외

`지역=수도권`으로 고정하면 그 축의 버킷은 하나뿐이다. `src/report/segments.ts:193`이
`restN = perPersona.size - nP` → `0` → `restRatio = segRatio` → `diff = 0`이 되어
`withinNoise`에 실린다. **비교 대상이 없는데 "차이가 작다"고 말하는 것**이다.

`segments.ts:97`의 버킷 구성 루프에서 값이 하나뿐인 축을 건너뛴다.
**게이트 수학(`twoProportionZ` · `GATE_MIN_EFFECT` · `GATE_Z`)은 건드리지 않는다.**

### 4. 모집단 표기 — 본문 · 카드 · OG

스크리너를 걸면 리포트가 말하는 모집단이 "한국 인구"에서 "20~39세 수도권 인구"로 바뀐다.
그 사실을 싣지 않으면 이 도구가 방금 없앤 것과 같은 종류의 거짓말이 된다.

- **상단 고지**: `이 리포트는 20~39세 · 수도권 인구만 대상으로 합니다.`
- **`## 전체 신호`**: `- 표본 60명 · 각 3회 응답(총 180) · 대상: 20~39세 · 수도권 · 누락률 0.0%`
- **쉬운 요약 카드**: `20~39세 수도권 60명 중 11명`
- **출처**: census 근거 문구에 스크리너 명시
- **OG 이미지**: `row.screener`를 읽어 부제로 표시

⚠️ **og-stats 회귀 위험 — 실행으로 검증했다.** `web/og-stats.ts`의
`/^- 표본 \d+명 · 각 \d+회 응답\(총 (\d+)\)/m`는 앵커가 줄 앞부분이므로 `· 대상: …`을
**뒤에** 붙이면 `총 180` 캡처가 그대로 유지된다. 확인 결과 접미 유무 모두 `180`을 반환한다.
그래도 회귀 테스트로 못박는다.

### 5. 순환논증 경고 (스크리너가 있을 때만)

```
> ⚠️ 이 패널은 20~39세 · 수도권으로 한정됐습니다. "이 집단이 내 타깃"이라는 가정은
> 이 리포트가 검증하지 않습니다 — 타깃 자체를 확인하려면 스크리너 없이 한 번 더 돌리세요.
```

이 도구의 값어치 중 하나는 **누가 반응하는지 알려주는 것**이다. 타깃을 미리 박고
"20대가 좋아한다"고 결론내면 순환논증이다.

### 6. DB — 가산적 마이그레이션

`app/src/app/r/[id]/opengraph-image.tsx`는 `row.question`과 `extractOgStats(row.md)`만
읽는다. 패널 라벨을 OG에 실으려면 md를 또 정규식으로 파싱하거나 컬럼을 늘려야 한다.
**컬럼을 택한다** — md 파싱 결합을 늘리지 않고 오히려 줄인다(인계 §8이 경고한 결합).

```
web/store.ts        SCHEMA에 screener TEXT 추가 (신규 테이블용)
web/store.ts        MIGRATIONS = ["ALTER TABLE reports ADD COLUMN screener TEXT"]
web/store-turso.ts  생성자에서 SCHEMA → INDEX → MIGRATIONS 순 실행
```

SQLite에는 `ADD COLUMN IF NOT EXISTS`가 없다. **중복 컬럼 에러는 삼켜야 한다**
(재실행 안전성). `ReportRow.screener?: string`(JSON 직렬화). `create()`가 저장한다.
**기존 리포트는 `null`** → 라벨 없이 지금과 동일하게 렌더된다.

### 7. 입력 검증 — `web/validate.ts`

```ts
screener?: { ageMin?: string; ageMax?: string; region?: "수도권" | "비수도권" }
```

- `ageMin`·`ageMax`는 **census 라벨**이어야 한다(`"20~24세"`). 자유 텍스트·숫자 금지.
- `ageMin`의 인덱스 ≤ `ageMax`의 인덱스. 아니면 400.
- 셋 다 없으면 스크리너 없음 = 현재 동작.
- **직업·소득·자녀 필드는 받지 않는다.**

서버가 라벨 범위를 실제 목록으로 펼쳐 `PanelScreener.연령`에 넣는다.

## 예상되는 부작용 (버그 아님)

스크리너를 좁힐수록 속성 변이가 줄어 `unanimous`·`no-effect` 판정이 **늘어난다.**
2026-07-08에 만든 `scopeVerdict`가 옳게 작동하는 것이다 — 답이 남은 축들과 무관하면
리포트는 "범위 밖"이라 말해야 하고, 그게 사실이다.

`지역`을 고정하면 그 축은 세그먼트로 쓸 수 없다. 이것은 스크리너의 **대가**이며 설계상
의도된 것이다. `연령`은 **범위**로 거르므로 구간이 여럿 남아 세그먼트 발견이 살아 있다.

## 범위 밖 (YAGNI)

- **성·혼인·가구원수 스크리너** — 이번엔 연령·지역만. 단일 값으로 고정하면 축이 죽으므로
  확장은 그 대가를 확인한 뒤에.
- **층화 표집**(전 인구 유지 + 버킷별 최소 인원 + 인구 가중 복원) — 목적이 다르다.
  사용자 목적은 "타깃 집단만 보기"이지 "전 인구를 보되 보류를 줄이기"가 아니다.
- **전 인구 시뮬 후 리포트만 필터** — 같은 비용으로 타깃 페르소나가 ~20명만 남아
  검정력이 오히려 나빠진다. 문제를 거꾸로 악화시킨다.
- **`n` 사용자 조절** — 비용 고정 정책(`web/pipeline.ts` 주석) 유지.

## 불변식

- 게이트 판정(2표본 z-검정 · 효과 크기) **무수정** · `src/aggregate` 무수정
- 정직성 신호 삭제 금지 · `## 전체 신호\n` · `## 기회 세그먼트\n` 헤더 문자열 보존
- `- ${signalLabel} · 응답 분포: ${dist}` 불릿 형식 보존 (og-stats 파서 소스)
- **없는 축을 제공하지 않는다** — 직업·소득·자녀·도심 여부는 스크리너에 없다
- **스크리너 미지정이 기본이며, 그때 동작은 현재와 완전히 동일해야 한다**
- 출처는 통계청 인구총조사 + Nemotron 둘만 · 비공개 프로젝트 정보 유입 금지
- 비용 회당 ≈ $0.04 유지 (`n = 60`, `repeats = 3`)

## 변경 파일

- `src/population/screen.ts` · `screen.test.ts` — 신규
- `src/study.ts` — `CensusStudyConfig.screener` + 필터
- `src/report/segments.ts` — 상수 축 버킷 제외
- `src/report/generate.ts` · `render.ts` — `panelLabel` 고지 · 전체 신호 접미 · 순환논증 경고 · 출처
- `web/pipeline.ts` — 스크리너를 study와 카드로 전달
- `web/easy-summary.ts` — 카드에 모집단 명시
- `web/validate.ts` — 스크리너 검증
- `web/store.ts` · `web/store-turso.ts` — `screener` 컬럼 + 마이그레이션
- `app/src/app/api/reports/route.ts` — 스크리너 저장
- `app/src/app/r/[id]/opengraph-image.tsx` — 부제
- `app/src/app/new/page.tsx` — 폼 컨트롤

## 검증 (TDD)

1. `screenPersonas` — 연령 범위 · 지역 · 둘 다 · 미지정(입력 그대로) · 빈 결과
2. `screenerLabel` — `"20~39세 · 수도권"` / `"전체 인구"`
3. `constantDims` — 고정 축만 반환
4. `runCensusStudy`가 필터를 태운다 (표본이 조건 밖 페르소나를 포함하지 않는다)
5. **회귀**: 스크리너 미지정이면 렌더 md가 변경 전과 **바이트 동일**
6. **회귀**: `extractOgStats`가 `· 대상: …` 접미가 붙은 `표본` 줄에서 `n`을 그대로 뽑는다
7. **회귀**: 고정 축이 세그먼트 · `확실한 것만 추렸습니다` · `판단 보류` 어디에도 안 나온다
8. 마이그레이션 재실행 안전 (중복 컬럼 에러를 삼킨다)
9. 검증 계층: 잘못된 라벨 · `ageMin > ageMax` · 없는 축 필드 → 400
10. 스크리너가 있으면 순환논증 경고가, 없으면 나오지 않는다

게이트 4종: `npx vitest run --pool=threads` (⚠️ 필수) / `npx tsc --noEmit` /
`npm run lint`(전체 출력) / `cd app && npx next build`.

⚠️ **vitest 요약 줄은 teardown segfault로 잘린다.** 카운트는 JSON 리포터로 센다:
`npx vitest run --pool=threads --reporter=json --outputFile=X`

⚠️ **실물 렌더를 눈으로 볼 것.** `npm run build && npm run report:demo`.
2026-07-08 세션에서 결함 5건 중 3건이 테스트 그린 상태에서 실물에만 보였다.

## 배포 주의

- **마이그레이션은 프로덕션 Turso 테이블에 `ALTER TABLE`을 친다.** 첫 요청 시 실행된다.
  가산적·nullable이라 롤백 없이 안전하지만, 배포 후 기존 리포트(`/r/2khi1bDwJ4` 등)가
  정상 렌더되는지 반드시 확인한다.
- 스크리너 없는 신규 리포트가 기존과 동일하게 나오는지 라이브에서 확인한다.
