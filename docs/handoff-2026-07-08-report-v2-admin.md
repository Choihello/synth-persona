# synth-persona 세션 인계 — 리포트 표현 v2 + 관리자 우회 · 2026-07-08

> 이전 인계: `docs/handoff-2026-07-06-full-stack.md` (풀스택 완성·배포 포스트모템).
> 이 문서는 새 세션이 바로 이어 일할 수 있는 **현재 상태 스냅샷**이다.
> **방향이 바뀌었다**: 사업화 트랙 폐기 → **오픈소스 포트폴리오로 확정**(§4 필독).

## 0. 한 줄 요약

TS synth-persona를 **오픈소스 공개 품질로 다듬어 v0.4.0 릴리스 준비 완료 + 라이브
반영**. 데모 재포지셔닝·표본 60명·세그먼트 게이트 z-검정 강화·관리자 한도 우회·
리포트 표현 전면 개편(단위 통일·재배치·출처 계층화)까지 전부 push·배포됨.
main = origin 동기, 356 테스트 블록 키 없이 그린. **남은 큰 것 2개: npm 발행(로그인
대기), 샘플 리포트 개편본 재생성.**

## 1. 상태 확인 먼저 (이 순서로)

```
git status -sb                       # main, origin 동기(깨끗)
git log --oneline -12
npx vitest run --pool=threads        # 350+ passed (55 파일). ⚠️ 반드시 --pool=threads
npx tsc --noEmit                     # 통과
npm run lint                         # biome 0 errors (⚠️ tail -1만 보지 말 것 — 위쪽 에러 놓침)
cd app && npx next build             # 통과
```

**⚠️ 이 환경 함정 2가지 (재발 방지):**
- **vitest는 `--pool=threads` 필수**. 기본 forks 풀이 이 샌드박스에서 자식 프로세스
  spawn 실패로 죽는다(코드 문제 아님). SQLite experimental 경고 후 teardown에서
  비결정적 segfault로 요약 줄이 잘리기도 함 — 재실행하면 카운트 보임.
- **`npm run lint 2>&1 | tail -1` 쓰지 말 것**. biome 에러가 위쪽에 뜨는데 tail -1이
  "Checked N files" 푸터만 보여줘 실제로 이전 커밋 3개가 미정렬로 push된 사고 있었음.
  `npm run lint 2>&1 | grep -A6 '━━━'` 또는 전체를 봐라.

## 2. 서비스 지도

- **라이브**: https://synth-persona-app.vercel.app (Vercel, Root Directory=`app/`,
  GitHub main push → 자동 배포. `app/vercel.json` ignoreCommand로 항상 빌드)
- **라우트**: `/` 랜딩 · `/new` 폼+갤러리 · `/r/[id]` 리포트(SSR, 미존재 id → 404)
  · `/r/[id]/opengraph-image` · `/opengraph-image` · **`/api/admin?token=` (신규 — 관리자
  쿠키 세터)** · `/api/reports` (POST, 한도 검사)
- **DB**: Turso(libSQL). **env** (Vercel 대시보드): OPENAI_API_KEY, IP_SALT,
  TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, **PER_IP_DAILY=1**(3에서 변경됨),
  **DAILY_GLOBAL_CAP=50**(100에서 변경됨), GALLERY_IDS(=BAJnsFMKrF,1zt5RRsfUs),
  NARRATIVE(미설정=on), **ADMIN_TOKEN(신규 — 사용자가 설정한 비밀값. 값은 사용자만 앎)**
- **비용**: 리포트 1회 ≈ $0.04 (n=60×3 + 처방 + 관련성). 하루 캡 ≈ $2

## 3. 이번 세션에 한 일 (최근 → 과거, 전부 push·배포됨)

**A. 리포트 표현 개편 v2** (커밋 f14c712..fdb2835, SDD 5태스크 + Minor 5건)
- 스펙: `docs/superpowers/specs/2026-07-07-report-presentation-redesign.md`
- 플랜: `docs/superpowers/plans/2026-07-07-report-presentation-redesign.md`
- **파트1 단위 60명 통일**: `OverallSignalSection`에 옵셔널 `panelSize`·`panelPositive`
  추가(rankSegments가 `perPersona.size`·`globalPersonaPos` 노출, 판정 무수정).
  카드·막대(charts.ts)·전체신호(render.ts)·OG(og-stats.ts)가 60명 단위 표시.
  180은 "각 3회 응답" 맥락 — **repeats는 `round(n/panelSize)`로 유도**(하드코딩 아님,
  repeats<2면 "각 N회" 생략).
- **파트2 재배치+리프레이밍**: 관심/거부 이유를 세그먼트보다 위로, "없음"·"참고"를
  방어→필터링 톤("확실한 것만 추렸습니다"), withinNoise 나열 개수 압축. **정직성
  신호(우연일 수 있음·판단보류·다중비교 고지) 삭제 없이 위치·톤·개수만.**
- **파트3 배너 구분**: drivers/objections 중 basis:"llm"이 하나라도 있으면 "실제 응답
  이유를 종합한 AI 요약" 배너, 전부 heuristic이면 기존 AI_DRAFT_BANNER.
- **파트4 신뢰도 카드**: "## 기술 상세 — 신뢰도 4층"으로 이름 바꿔 부록(출처 직전)
  이동 + 용어 생활언어 병기 범례("matched(실측 일치)" 등).
- **파트5 출처 계층화**: "데이터 근거: 통계청 인구총조사 2024 (KOSIS DT_1IN1509·
  DT_1MR2060·DT_1JC1511) · IPF" + Nemotron 서사. census 표ID는 `data/census/kr-2024.json`
  meta.sources 실제값과 일치(리뷰 대조 완료).

**B. 관리자 한도 우회** (커밋 331cb4d): `web/admin.ts`의 `isAdminRequest`(상수시간 비교),
`/api/admin?token=<ADMIN_TOKEN>` GET이 httpOnly 쿠키(sp_admin, 30일) 심음, `/api/reports`가
쿠키·헤더(x-admin-token) 확인 시 checkLimit 스킵. **ADMIN_TOKEN 미설정 시 완전 비활성**
(셀프호스팅 안전). 사용자가 이미 Vercel에 설정·활성화 확인함.

**C. 데모 표본·품질** (더 과거, 전부 배포됨):
- 표본 n=30→60 (`web/pipeline.ts` DEFAULT_PARAMS), 카피 "가짜 60명·각 3회·총 180",
  "약 2분", "IP당 하루 1회"
- 세그먼트 게이트 **여집합 비교 + 2표본 z-검정**(`twoProportionZ`, GATE_Z=1.645):
  자기포함 편향·여집합 불확실성 해소. 외부 통계 리뷰 체크리스트 반영분
- 쉬운 요약 카드 "60명 중 M명"(실제 panelPositive)
- 니치 한계·다중비교 무보정 고지, README 게이트 서술 정정
- `.gitignore`에 `docs/request-oss-release-checklist.md` 제외(비공개 전략 문서 — §4 경계)

## 4. 방향 결정 — 오픈소스 포트폴리오 (2026-07-06 확정, 사업화 폐기)

이 저장소(TS)는 **오픈소스 포트폴리오로 확정**됐다. 별도의 비공개 프로젝트가 존재하나,
그 경로·산출물·비교 우위·상용 아키텍처 구상은 **이 공개 저장소에 적지 않는다.**

**⚠️ 절대 경계 (해자 보호):**
- 비공개 프로젝트의 **수치·데이터맵·방법론·전략 문서를 이 public 저장소에 절대 유입
  금지.** 이번 세션에 실수로 스테이징된 전략 문서를 push 전 발견해 커밋 제외+gitignore한
  사고 있었음. **공개 저장소에 커밋되는 모든 문서(스펙·플랜·인계 포함)는 작성 시점부터
  이 경계를 지킬 것 — 경계를 서술하려다 경계를 넘지 않도록, 비공개 쪽 경로·고유 산출물·
  강점·아키텍처를 적지 말 것.**
- 출처·근거는 TS가 실제 쓰는 **통계청 인구총조사 + Nemotron 둘만**. 없는 데이터
  레이어 추가는 "부풀리기"라 금지.
- **비공개 맥락은 전부 로컬 메모리 `project-synth-persona-direction`에 있다** (저장소 밖).
  전문 인계본도 저장소 밖 비공개 노트로 보관됨.

## 5. 남은 작업 (우선순위 순)

1. **npm 발행 (T10, 보류 중)** — `package.json`은 이미 발행 가능(private 제거·v0.4.0).
   순서: 사용자가 `npm login` → `npm publish` (한글 경로 실패 시 `npm pack`→영문 임시
   경로 우회) → layout footer에 npm 링크 + README npm 뱃지 커밋 → push → `git tag v0.4.0`
   + `gh release create v0.4.0`. **발행은 되돌리기 어려운 대외 공개 — 사용자 재승인 게이트.**
   npm 이름 `synth-persona` 미점유 확인됨.
2. **샘플 리포트 개편본 재생성** — 갤러리·랜딩이 가리키는 `/r/BAJnsFMKrF`는 구 n=90·구
   렌더라 개편 전 모습. 개편본(60명·새 순서·출처)으로 갱신하려면: 라이브 API POST로 새
   리포트 생성(관리자 쿠키로 한도 우회 가능, ~$0.04) → 새 nanoid id 획득 → `page.tsx`의
   하드코딩 `/r/BAJnsFMKrF` 3곳 교체(23·36·49행) → 사용자가 GALLERY_IDS env 교체 →
   Redeploy. **리스크: 새 리포트 숫자가 "10명 중 9명"처럼 예쁘게 안 나올 수 있음**
   (재무작위) → 카드 값도 새 리포트에 맞춰야. 그래서 지금까지 보류해 옴.
3. **경미 정리(선택)**: 최종 리뷰 Minor는 전부 처리됨. 남은 건 docs/handoff·plan의
   "신뢰도 카드"·"참고 —" 옛 표현인데 **역사적 기록이라 수정 금지**(과거 사실).

## 6. 불변식 (2026-07-08 기준 최신)

- `src/types.ts`·`src/report/types.ts` **기존 필드 무수정** (옵셔널 추가는 승인분:
  narrative?, panelSize?, panelPositive?) · `src/aggregate` 무수정
- 게이트 판정(2표본 z-검정·효과크기)·세그먼트 집계 **로직 무수정** (표현만 개편)
- **정직성 신호(우연일 수 있음·low·판단 보류·synthetic 고지) 삭제 금지** — 이 도구의
  차별점. 재배치·톤·압축만 허용
- 코어 런타임 의존성 @anthropic-ai/sdk 단일 · web @libsql/client 단일 · node:crypto 내장
- 테스트 키 없이 그린 · seed 재현성 · 출처는 census+Nemotron만
- Nemotron CC BY 4.0 저작자표시 · 비공개 프로젝트 정보 유입 금지(§4)

## 7. 프로세스 관례 (이 프로젝트에서 확립됨)

- **모델 정책 변경됨**: "fable 고정"은 **해제됨**(2026-07-06). SDD 기본 지침대로 작업
  복잡도에 맞춰 자율 선택(전사=저가, 통합=중상위, 최종리뷰=최상위). 메모리
  `feedback-fable-only-critical-work` 참조.
- **superpowers 플로우**: brainstorming(결정 합의) → 스펙 커밋 → writing-plans →
  subagent-driven-development. 레저: `.superpowers/sdd/progress.md` (재개 지점 — 태스크별
  완료·커밋 해시 기록. 이 세션의 전 이력 있음)
- **push·npm publish는 매번 사용자 승인 게이트** (AskUserQuestion) · 라이브 스모크로 마감
- 검증 리듬: 게이트4종 → 태스크별 리뷰(스펙+품질, 서브에이전트) → 최종 전체리뷰 →
  push → 라이브 확인. 시각 작업은 프리뷰 도구(preview_*)
- 산출물(문서 외 생성물)은 저장소 밖 `Teddy\slides\` (사용자 선호 — 메모리 참조)

## 8. 함정·교훈 (재발 방지)

- **vitest --pool=threads 필수**, **lint tail -1 금지** (§1)
- **git add -A 주의**: 비공개 전략 문서가 딸려 들어가 push 전 잡음(§4). 스테이징 전
  `git status` 확인, 공개 금지 문서는 gitignore
- **Vercel env는 코드 밖**: 한도·ADMIN_TOKEN·GALLERY_IDS는 대시보드에서만. 변경 후
  **반드시 Redeploy** 해야 적용(저장만으론 안 먹음). 사용자가 직접 함
- **리포트 id는 nanoid(10) 랜덤** — 재생성 시 id 못 지정, 하드코딩 링크·GALLERY_IDS 교체 필요
- **로컬 .env엔 TURSO 토큰 없음**(OPENAI만) → 프로덕션 DB 직접 쓰기 불가, 리포트 재생성은
  라이브 API POST로만
- **og-stats는 render md를 정규식 파싱** — render "전체 신호" 문구 바꾸면 og-stats +
  테스트 동반 수정. `응답 분포:` 줄은 유지(파서 소스)
- **차트 주입**: pipeline이 `md.replace("## 전체 신호\n"...)`·`"## 기회 세그먼트\n"`로
  주입 — 이 헤더 문자열 보존 필수(순서 바꿔도 텍스트는 유지)

## 9. 코드 지도 (개편으로 바뀐 핵심만)

- `src/report/segments.ts` — 여집합 2표본 z-검정 게이트(`twoProportionZ`·`rankSegments`),
  panelSize·panelPositive 반환
- `src/report/render.ts` — 개편된 섹션 순서·리프레이밍·배너 분기(`LLM_SUMMARY_BANNER`)·
  신뢰도 부록·출처 계층·repeats 유도(`sampleLabel`)
- `src/report/generate.ts` — overallSection에 panel 주입, census attribution을 appendix.caveats에
- `src/report/test-fixtures.ts` — 공유 `bigResult()` 픽스처(신규)
- `web/easy-summary.ts` — 카드 "N명 중 M명"(실제 panelPositive)
- `web/charts.ts` — shareBarSVG 페르소나 라벨·repeats 유도
- `web/og-stats.ts` — 앵커된 폴백 정규식
- `web/admin.ts` + `app/src/app/api/admin/route.ts` — 관리자 우회(신규)

## 10. 샘플 리포트 (라이브 레퍼런스 — 단, 구 렌더)

- /r/BAJnsFMKrF — 재택근무 (갤러리·랜딩 하드코딩 대상, **개편 전 모습** → §5-2 재생성 후보)
- /r/YY172ydchh — 보안솔루션 (게이트 강등 예)
- ⚠️ 이 저장된 리포트들은 옛 md라 개편 표현이 안 보인다 — 개편 확인은 **새 리포트 생성**으로
