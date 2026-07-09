# synth-persona 세션 인계 — 패널 스크리너 코어(플랜 1/2 완료) · 2026-07-09

> 직전 인계: `docs/handoff-2026-07-08c-out-of-scope-detection.md` (범위 밖 질문 탐지).
> 그 세션이 §7에 남긴 후보 중 "판단 보류 반복" 문제를 이번에 스크리너로 착수했다.

## 0. 한 줄 요약

합성 패널을 **연령 범위 + 지역**으로 좁히는 코어 로직을 넣고, 리포트가 한정 사실을
정직하게 말하게 했다(모집단 고지·순환논증 경고·고정 축 제외 명시). **이것은 플랜 1/2다** —
DB `ALTER TABLE`·API·폼·OG는 **아직 배선 안 됨(플랜 2)**. main = origin 동기, 426 테스트
키 없이 그린. **스크리너는 아직 사용자가 못 쓴다(폼 없음).**

## 1. 상태 확인 먼저 (이 순서로)

```
git status -sb                       # main, origin 동기(dc63c44)
npx tsc --noEmit                     # 통과
npm run lint                         # biome 0 errors (⚠️ tail -1 금지)
cd app && npx next build             # 통과
```

**테스트 카운트는 터미널 요약을 믿지 마라.** teardown segfault가 요약 줄을 자른다.
JSON 리포터로 센다:

```bash
npx vitest run --pool=threads --reporter=json --outputFile=/tmp/vitest.json >/dev/null 2>&1
node -e "const r=require('/tmp/vitest.json');console.log(r.numTotalTests,r.numPassedTests,r.numFailedTests,r.success)"
# 426 426 0 true
```

**⚠️ 환경 함정 3가지:**
- **vitest `--pool=threads` 필수** (기본 forks 풀이 이 샌드박스에서 죽는다).
- **`npm run lint 2>&1 | tail -1` 금지** (에러가 위쪽에 뜨는데 푸터만 보인다).
- **teardown segfault** — 실패로 오인 말 것. JSON 리포터가 확실하다.

## 2. 이번 세션에 한 일 (플랜 1/2)

- 스펙: `docs/superpowers/specs/2026-07-08-panel-screener-design.md` (플랜 1+2 전체)
- 플랜 1: `docs/superpowers/plans/2026-07-08-panel-screener-core.md`
- 커밋: `f39f00e`(스펙) `e41e5f2`(플랜) `c12356a..dc63c44`(6태스크 + fix 2파)

**문제.** 리포트가 `판단 보류 (표본 부족)`로 특정 연령대를 반복 제외했다. 원인은 질문의
추상성이 아니라 **60명을 15개 연령구간 × 성 × 지역 × 혼인 × 가구원수에 인구 가중으로
흩뿌리기 때문**이다. `minN=8`은 **응답 단위**(repeats=3)라 페르소나 3명 미만 버킷이
잘리고, 꼬리 연령구간(15~19세·85세이상)이 구조적으로 걸린다.

**해법.** 표집 **직전**에 페르소나를 거른다(`src/study.ts` `runCensusStudy`).
`sampleForSimulation`이 총 가중치를 인자에서 재계산하므로(`src/population/source.ts:12`)
**인구 가중치 재정규화가 공짜다 — 새 수학이 없다.**

**핵심 절대 경계 — 없는 축을 제공하지 않는다.**
```
축 5개:  성(2) · 연령(15) · 지역(수도권/비수도권) · 혼인 · 가구원수
없음:    직업 · 소득 · 자녀 · 도심 여부 · 학력 · 산업
```
리포트가 매번 `아직 믿으면 안 되는 것: 소득·직업·자녀 축 없음`이라 쓰는 이유다.
자유 텍스트 스크리너는 "직장인만 골랐다"는 착각을 만든다 — §4 부풀리기 금지.
**이번 범위는 연령 범위 + 지역뿐.**

## 3. 새로 생긴 코드 (플랜 2가 소비할 인터페이스)

`src/population/screen.ts` (신규, 순수 함수):
```ts
export interface PanelScreener { 연령?: string[]; 지역?: "수도권" | "비수도권" }
export function screenPersonas(all: Persona[], s?: PanelScreener): Persona[]
export function screenerLabel(s?: PanelScreener): string   // "20~39세 · 수도권" | "전체 인구"
export function ageRangeLabel(labels: string[]): string     // ["20~24세",…"35~39세"] → "20~39세"
export function constantDims(personas: Persona[]): string[] // 값이 하나뿐인 축
```

- `src/study.ts` — `CensusStudyConfig.screener?: PanelScreener` (`:85`), 표집 직전 필터(`:99`).
  스크리너 없으면 `screenPersonas`가 **동일 참조**를 돌려줘 호출이 종전과 문자 그대로 같다.
- `src/report/types.ts` — 옵셔널 2개 추가: `FounderReportOptions.panelLabel?` ·
  `ReportAppendix.skippedDims?`. `rankSegments` 반환에 `skippedDims: string[]`.
- `src/report/segments.ts` — 값이 하나뿐인 축은 버킷을 안 만들고 `skippedDims`로 노출.
- `src/report/render.ts` — 상단 모집단 고지 · `SCREENER_CIRCULAR_WARNING` · 전체 신호
  `· 대상:` 접미 · `_비교에서 제외된 축: …_` · **검정한 축만 나열**(아래 §4 C1).
- `web/easy-summary.ts` — 카드에 모집단 명시 · no-effect일 때 제외 축 반영.

## 4. 최종 리뷰가 잡은 Critical — 검정하지 않은 축의 결과를 주장하던 오류

`no-effect` 배너·세그먼트 문구가 **다섯 축을 하드코딩**해 "검정할 수 있었던 인구 축
(연령·성·지역·가구원수·혼인) 어디에서도 차이 없음"이라 단언했다. 그런데 이 브랜치는
**고정된 축을 검정하지 않기로** 바꿨다. 같은 문서가 "지역은 대조군이 없어 비교 안 함"과
"지역에서 차이 없음"을 동시에 말했다.

**2026-07-08의 `29b42f0`(미검정 세그먼트를 no-effect로 오분류)과 같은 종.** 플랜이
`observedButHeld → underpowered` 버전만 막고 `no-effect` 버전을 놓쳤다.
⚠️ **스크리너 없이도 도달 가능** — 작은 표본에서 축이 자연히 상수가 되면 그만이다.

수정(`dc63c44`): `CENSUS_AXES` + `testedAxesLabel(skippedDims)`로 **검정한 축만 나열**,
제외 축은 별도 문장으로 명시. `web/easy-summary.ts`도 "검정한 인구 축에서는 갈리지
않았어요"로 분기.

## 5. Task 3에서 마주친 원칙 충돌 — "조용한 소실 금지"

Task 3 구현자가 **BLOCKED로 옳게 멈췄다.** `generate.test.ts:103`에 이름 붙은 기존
원칙 `"…(조용한 소실 금지)"`가 있고, "값이 하나뿐인 축은 버킷을 안 만든다"와 정면 충돌했다.
관측된 축이 리포트에서 흔적 없이 사라지면 안 된다.

선택지 3개 중 사용자가 **C**를 골랐다: 버킷은 안 만들되(가짜 비교 금지) 렌더가 제외
사실을 밝힌다. **B(`observedButHeld`에 보존)는 함정** — `scopeVerdict`가
`observedButHeld.length>0`을 보고 `underpowered`를 반환해 "표본을 키우세요"라는 거짓을
낳는다. 축을 고정한 건 표본 크기와 무관하다(600명을 뽑아도 지역은 한 값).

## 6. 불변식 (2026-07-09 기준)

- 게이트 판정(2표본 z-검정·효과크기)·`src/aggregate`·`src/report/scope.ts` **무수정**
- **새 수학 없음** — `sampleForSimulation` 가중 로직 무수정
- **정직성 신호 삭제 금지** · **조용한 소실 금지**(관측 축은 흔적을 남긴다)
- **`## 전체 신호\n`·`## 기회 세그먼트\n` 헤더 보존**(pipeline 차트 주입) ·
  **`- 표본 …` / `· 응답 분포:` 불릿 형식 보존**(og-stats 파서 소스. `· 대상:`은 **뒤에** 접미)
- **스크리너 미지정 시 렌더 바이트 동일** — 이번 세션 내내 데모 20084 bytes로 검증
- 타입 변경은 옵셔널 추가만(panelLabel? · skippedDims?)
- 없는 축 제공 금지 · 출처는 census+Nemotron 둘만

## 7. 다음 작업 — 플랜 2 (웹 노출 + 마이그레이션)

스펙 §4(OG)·§6(DB)·§7(validate)가 플랜 2다. **아직 스펙만 있고 플랜 문서는 없다.**
`writing-plans`로 플랜 2를 짜는 것부터 시작. 대상 파일:
- `web/validate.ts` — 스크리너 검증(census 라벨만, ageMin≤ageMax, 없는 축 필드 거부)
- `web/store.ts` · `web/store-turso.ts` — `screener` 컬럼 + **가산적 마이그레이션**
- `app/src/app/api/reports/route.ts` — 스크리너 저장 · `web/pipeline.ts` — study·카드로 전달
- `app/src/app/r/[id]/opengraph-image.tsx` — 부제 · `app/src/app/new/page.tsx` — 폼 컨트롤

### 🔴 플랜 2 지뢰 둘 (최종 리뷰 발견 — 반드시 반영)

1. **`screenerLabel()`은 스크리너 없을 때 `"전체 인구"`를 반환한다.** pipeline이
   `panelLabel: screenerLabel(screener)`를 **무조건** 넘기면 `이 리포트는 **전체 인구**
   인구만 대상으로 합니다`가 찍혀 **바이트 동일이 깨진다.** 스크리너가 있을 때만 넘길 것.
2. **`src/study.ts:101`이 빈 모집단에 bare `Error`를 던진다**(`스크리너 조건에 맞는
   인구가 없습니다 — 조건을 넓히세요`). `web/pipeline.ts`가 안 잡으면 과도하게 좁힌
   스크리너에 **500이 난다.** API 계층이 400으로 잡아야 한다.

### ⚠️ 배포 주의 (스펙 말미)

- **마이그레이션은 프로덕션 Turso 테이블에 `ALTER TABLE`을 친다.** 첫 요청 시 실행.
  가산적·nullable이라 롤백 없이 안전하지만, **SQLite엔 `ADD COLUMN IF NOT EXISTS`가
  없으니 중복 컬럼 에러를 삼켜야 한다**(재실행 안전성). 배포 후 기존 리포트
  (`/r/2khi1bDwJ4` 등)가 정상 렌더되는지 반드시 확인.
- 플랜 1을 순수 함수와 분리한 이유가 이것 — 되돌리기 어려운 마이그레이션을 별도
  승인·별도 배포 확인에 태우기 위함.

## 8. 다른 이월 작업

- `src/population/screen.ts`의 4함수가 아직 **프로덕션 호출자 없음**(플랜 2가 소비).
  `src/index.ts` 배럴에도 미export — 오픈소스 소비자가 쓰려면 검토.
- **npm 발행**(여전히 보류, `npm login` 선행, 발행 직전 재승인 게이트).
- **⚠️ `ADMIN_TOKEN` 교체** — 2026-07-08 세션에서 대화에 평문 노출됨. 아직 유효.

## 9. 프로세스 관례

- superpowers: brainstorming → 스펙 커밋 → writing-plans → subagent-driven-development.
  레저 `.superpowers/sdd/progress.md`(태스크별 완료·커밋·Minor triage)
- **push는 매번 사용자 승인 게이트.** "승인"이 스펙 리뷰 게이트 직후면 **스펙 승인으로만**
  읽는다 — push는 따로 묻는다
- 모델: 복잡도별 자율(전사=저가, 통합·리뷰=중상위, 최종 전체리뷰=최상위)
- ⚠️ **서브에이전트 테스트 카운트 보고를 믿지 말 것** — 이번에도 오보(418 → 실측 421).
  컨트롤러가 JSON 리포터로 직접 확인
- ⚠️ **바이트 동일 회귀는 코드 변경 전에 기준선을 떠라** — 이번에 컨트롤러가 Task 1 전에
  `report:demo`를 캡처해뒀다(나중엔 못 뜬다)
- ⚠️ **실물 렌더를 눈으로 보라** — 이 프로젝트의 결함 다수가 테스트 그린 상태에서 실물에만 보였다

## 10. 샘플 리포트 (라이브)

- `/r/2khi1bDwJ4` — 장보기(온라인 배송 vs 마트). 랜딩·갤러리 샘플. `segmented`
- `/r/Dr1edtksE6` — 통화 AI 녹음. `unanimous`(범위 밖 배너 실물 확인용)
- `/r/RZrj0gVdVU` — 주 4일제 급여삭감. `segmented` + C3 케이스(한 방향만 빔)
- ⚠️ 개편은 **저장된 md에 소급 안 됨**(`web/store.ts:50` md TEXT). 신규 생성으로만 확인
