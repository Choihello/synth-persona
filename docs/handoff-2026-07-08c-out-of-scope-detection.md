# synth-persona 세션 인계 — 범위 밖 질문 탐지 · 2026-07-08 (3차)

> 직전 인계: `docs/handoff-2026-07-08b-trust-action-bridge.md`.
> 그 문서 §4가 "미해결 큰 주제"로 남긴 **저분산 문제**를 이번 세션에 규명·해결했다.

## 0. 한 줄 요약

"합성 패널 저분산"은 버그가 아니었다. **각 페르소나는 개별적으로 거의 결정적이고,
다양성은 오직 속성에서 나온다.** 질문의 답이 census 축과 무관하면 전원이 똑같이 답하고,
그때 100%/0%는 "시장의 합의"가 아니라 **"이 도구가 아무 정보도 갖고 있지 않다"**는 뜻이다.
리포트는 그걸 `🟢 consensus(합의)`라 불렀다. 이제 안 그런다. 390 테스트 그린, 배포 완료.

## 1. 상태 확인 먼저 (이 순서로)

```
git status -sb                       # main, origin 동기
npx tsc --noEmit                     # 통과
npm run lint                         # biome 0 errors (⚠️ tail -1 금지)
cd app && npx next build             # 통과
```

**테스트 카운트는 터미널 요약을 믿지 마라.** teardown segfault가 요약 줄을 자른다
(통과했는데도 잘린다). JSON 리포터를 쓴다:

```bash
npx vitest run --pool=threads --reporter=json --outputFile=/tmp/vitest.json >/dev/null 2>&1
node -e "const r=require('/tmp/vitest.json');console.log(r.numTotalTests,r.numPassedTests,r.numFailedTests,r.success)"
# 390 390 0 true
```

**⚠️ 환경 함정 3가지:**
- **vitest `--pool=threads` 필수.** 기본 forks 풀이 이 샌드박스에서 죽는다.
- **`npm run lint 2>&1 | tail -1` 금지.** 에러가 위쪽에 뜨는데 푸터만 보인다.
- **teardown segfault** — 실패로 오인하지 말 것. 위 JSON 리포터를 쓰면 확실하다.

## 2. 저분산의 정체 (프로브 실측 24회 호출)

`src/llm/openai.ts:41-47`은 `temperature`·`seed`를 **전송하지 않는다**(OpenAI 기본 1.0).
샘플러는 정상이다. 실제 `askChoice` 경로 프로브:

```
극단 (25~29 1인 수도권)   장보기: 온라인 6/6   ← 개별 페르소나는 거의 결정적
경계 (40~44 3인 수도권)   장보기: 온라인 5/6   ← 경계선은 흔들린다
경계 (35~39 2인 비수도권) 장보기: 온라인 1/6
```

첫 토큰 확률(logprobs):

| 질문 | young(25~29·1인·수도권) | old(60~64·2인·비수도권) |
|---|---|---|
| 통화 AI 자동 녹음 | 끈다 **99.83%** | 끈다 **99.87%** |
| 장보기 온라인/마트 | 온라인 배송 **100%** | 마트 방문 **99.99%** |

프롬프트 유도 가설은 기각됐다 — 페르소나 시스템 프롬프트를 빼면 확신이 오히려
**떨어진다**(끈다 99.85% → 93.43%).

**결론:** 답이 인구 축(연령·성·지역·가구원수·혼인)에 의존하지 않는 질문이면 만장일치가 난다.
인구 분포가 답에 기여한 바가 0이므로 전체 비율은 **언어모델의 사전 판단**이다.
`예/아니오` + 명백한 손익 질문이 그렇다. **A냐 B냐 선호형**이라야 갈린다.

## 3. 이번 세션에 한 일

- 스펙: `docs/superpowers/specs/2026-07-08-out-of-scope-question-detection-design.md`
- 플랜: `docs/superpowers/plans/2026-07-08-out-of-scope-question-detection.md`
- 커밋: `226d0cc..29b42f0` (SDD 6태스크 + fix 3파)

**`src/report/scope.ts`(신규) — 판정 하나.** 마크다운 렌더(`render.ts`)와 웹 카드
(`web/easy-summary.ts`)가 **같은 함수를 소비**한다. 본문과 카드가 갈라질 수 없다.

```
승격 > 0             → segmented
lowRelevance > 0     → segmented      (게이트 통과 후 관련성으로 강등 — 차이는 있었다)
단일 버킷             → unanimous      (표본을 키워도 안 갈린다)
weak > 0 || held > 0 → underpowered   (표본이 실제 원인)
그 외                → no-effect
```

렌더 변경: 범위 밖 배너 · `할 수 있는 것` 보정 · 세그먼트 0개 문구 삼분 ·
`🟢 consensus(합의)` → `⚪ 응답 전부 동일`(**표시만**, `signal` 필드 무수정) ·
`unanimous` 헤드라인/`이번 주 행동` 보정. 카드: `unanimous`·`no-effect`면 시장 판정문 금지.

## 4. 유닛 테스트가 못 잡고 실물이 잡은 것 (재발 방지 — 이번에도 세 번)

**`npm run build && npm run report:demo`로 눈으로 보라.** 아래는 전부 테스트 그린 상태에서
실물 렌더에만 보였다.

1. **배너가 "합의가 아니다"라 한 바로 다음 줄에서 헤드라인이 "합의된 반응"이라고 말했다.**
   `generate.ts:182`가 `result.signal === "consensus"`면 그 문장을 찍는다. 우리가 라벨에서
   지운 그 단어다. → render에서 `unanimous`면 헤드라인을 갈아끼운다.
2. **`이번 주 행동: 표본이 큰 세그먼트부터 인터뷰 설계`**(`generate.ts:208` 폴백) — 전원이
   같게 답하는 질문에서 표본은 아무것도 바꾸지 않는다. → 보정 접미(원문 보존).
3. **최종 리뷰(opus)가 Critical 2건으로 브랜치를 반려했다. 옳았다.** §5 참조.

## 5. 최종 리뷰가 잡은 Critical — 이 브랜치가 참을 거짓으로 바꿨었다

**C1.** `src/report/segments.ts`는 `minN` 미만 버킷을 **효과 크기를 계산하기도 전에**
early `continue`로 `observedButHeld`에 보낸다. 그래서 **100%p로 갈린 세그먼트도 `weakSignals`에
절대 들어오지 못한다.** 초기 `scopeVerdict`는 `weakSignals`만 봐서 이를 `no-effect`로 분류하고
"인구 축 어디에서도 10%p 이상 차이 없음"이라 선언하면서, 바로 아래 `판단 보류` 목록에
그 세그먼트들을 인쇄했다.

```
재현: 20대 5명 100% 긍정 · 60대 5명 0% 긍정 (둘 다 minN 미만)
  "인구 축에서 갈리지 않았습니다"   → 인쇄됨 (거짓)
  "판단 보류 (표본 부족)"          → 같은 문서에 인쇄됨
  "표본을 키우세요"                → 사라짐 (참이었는데)
```

**옛 문구가 거기선 옳았다.** 정직성을 고치려던 변경이 정직성을 퇴행시켰다.
→ `observedButHeld`도 `underpowered`의 근거로 본다.

**C2.** 관련성 게이트로 강등된 `lowRelevance`도 승격 0 → `no-effect` 오분류. 게이트(10%p + z)를
통과한 차이인데 "차이 없음"이라 말했다. → `lowRelevance > 0`이면 `segmented`.

**C3 (리뷰어도 못 봄, 컨트롤러가 재현).** `NO_SEGMENT_NO_EFFECT`는 **전 축**에 대한 주장인데
**방향별 섹션**(기회/저항) 안에서 인쇄된다. 한쪽 방향만 비면 거짓말이다. `scope`만 보는
셀렉터로는 안 고쳐진다. → `noSegmentLine(scope)` + `NO_SEGMENT_DIRECTIONAL`.

**I1.** `no-effect` 배너가 "다른 요인에 달려 있습니다"라 단언했다. **10%p는 의사결정 임계이지
진실의 경계가 아니다.** → "가능성이 큽니다"로 헤지, `어디에서도` → `검정할 수 있었던 인구 축
어디에서도`로 한정.

## 6. 불변식 (변동 없음)

- `src/types.ts`·`src/report/types.ts` **기존 필드 무수정** · `src/aggregate` 무수정
- 게이트 판정(2표본 z-검정)·세그먼트 집계 **로직 무수정** · `overallSignal.signal` **무수정**
  (`unanimous` 라벨은 **표시만** 바꾼다)
- **정직성 신호 삭제 금지.** 이번에 제거한 유일한 문장은 거짓인
  `전체 방향(위)이 핵심 신호입니다`이고, `NO_SEGMENT_UNDERPOWERED` 안에는 **그대로 남아 있다**
  (그 갈래에선 참이므로)
- **`## 전체 신호\n`·`## 기회 세그먼트\n` 헤더 문자열 보존** (`web/pipeline.ts:125` 차트 주입)
- **`- ${signalLabel} · 응답 분포: ${dist}` 불릿 형식 보존** (`web/og-stats.ts` 파서 소스)
- **없는 근거를 지어내지 않는다** — `no-effect`를 단언하지 않는다
- 출처는 **통계청 인구총조사 + Nemotron 둘만** · 비공개 프로젝트 정보 유입 금지

## 7. 남은 작업

1. **npm 발행 (여전히 보류)** — `npm login` 선행, **발행 직전 사용자 재승인 게이트.**
   npm 이름 `synth-persona` 미점유 확인됨.
2. **`scopeVerdict`가 `src/index.ts` 배럴에 미export** — 내부용이라 무해하나, 오픈소스
   소비자가 쓰려면 추가 검토.
3. **랜딩 카드 하드코딩** — `app/src/app/page.tsx`가 샘플 링크 3곳과 카드 값 6개를 문자열로
   박아둔다. 샘플 교체 시마다 손으로 맞춰야 한다. **분모가 카드마다 다르다**(카드1 페르소나
   기준 / 카드2 응답 기준). 리포트에서 파생시키는 구조 개선은 미착수.
4. **defer된 Minor** — `.superpowers/sdd/progress.md` 참조. 빈 `distribution` → `unanimous`
   (무응답을 별도 등급으로 볼 여지) 등.

## 8. 프로세스 관례

- superpowers: brainstorming → 스펙 커밋 → writing-plans → subagent-driven-development.
  레저 `.superpowers/sdd/progress.md`
- **push·npm publish는 매번 사용자 승인 게이트.** "승인"이 스펙 리뷰 게이트 직후에 나오면
  **스펙 승인으로만** 읽는다 — push는 따로 묻는다
- 모델: 복잡도별 자율 (전사=저가, 통합·리뷰=중상위, 최종 전체리뷰=최상위)
- ⚠️ **서브에이전트의 테스트 카운트 보고를 믿지 말 것.** 오보 사례 있음(288/47 → 실측 351/55).
  컨트롤러가 JSON 리포터로 직접 확인한다
- ⚠️ **실물 렌더를 눈으로 보라.** 이번 세션의 결함 5건 중 3건이 테스트 그린 상태에서
  실물에만 보였다

## 9. 샘플 리포트

- `/r/2khi1bDwJ4` — 장보기(온라인 배송 vs 마트 방문). **현재 랜딩·갤러리가 가리키는 샘플.**
  `segmented`: 기회 수도권(34.3%·high)·30~34세, 저항 비수도권(6.2%·high)
- `/r/vggYyU-UrG` — 통화 AI 녹음. 100% 거부(180/180 동일). **개편 전 md**
- `/r/emllQ_SRgS` — 주 4일제 급여 삭감. 95% 거부, weakSignal 3개. **개편 전 md**

⚠️ **개편은 저장된 md에 소급되지 않는다.** 렌더는 생성 시 한 번 돌고 `md TEXT`로 굳는다
(`web/store.ts:50`). 확인은 **새 리포트 생성**으로만 가능하다.
