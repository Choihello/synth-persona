# synth-persona 세션 인계 — 풀스택 완성 + 사업화 전환 · 2026-07-06

> 이전 인계: `docs/handoff-2026-07-05-v1-live.md` (상세 이력·배포 포스트모템은 그쪽 참조).
> 이 문서는 새 세션이 바로 일할 수 있는 **현재 상태 스냅샷**이다.

## 0. 한 줄 요약

웹 서비스가 **완전 가동 중**: 랜딩("가짜 90명") → /new 폼 → 리포트(쉬운 요약 카드
+ 통계·관련성 2중 유의성 게이트 + Nemotron 서사 페르소나 + OG 이미지 + 다크 모드
+ 갤러리). 백로그 청산 완료. **방향은 사업화로 확정** (npm 오픈소스 공개 스킵,
Claude 교차 실측 보류). main = origin, 테스트 321개 키 없이 그린.

## 1. 상태 확인 먼저 (이 순서로)

```
git status -sb            # main, 깨끗해야 함 (origin 동기화)
git log --oneline -5
npx vitest run            # 321 passed (55 파일, 전부 키 없이)
npx tsc --noEmit          # 통과
npm run lint              # biome 0 errors
cd app && npx next build  # 통과 (/ ○ Static, /new ○ ISR 1h)
```

## 2. 서비스 지도

- **라이브**: https://synth-persona-app.vercel.app (Vercel, Root Directory=`app/`,
  GitHub main push → 자동 배포. `app/vercel.json`의 `ignoreCommand: exit 1`로
  **항상 빌드** — src/·web/만 바뀐 커밋도 배포됨)
- **라우트**: `/` 랜딩(정적) · `/new` 폼+갤러리(ISR 1h) · `/r/[id]` 리포트(SSR)
  · `/r/[id]/opengraph-image` 동적 OG · `/opengraph-image` 사이트 OG
- **DB**: Turso(libSQL). **env**: OPENAI_API_KEY, IP_SALT, TURSO_DATABASE_URL,
  TURSO_AUTH_TOKEN, PER_IP_DAILY=3, DAILY_GLOBAL_CAP=100, GALLERY_IDS(=BAJnsFMKrF,
  1zt5RRsfUs), NARRATIVE(미설정=on, off로 차단)
- **비용**: 리포트 1회 ≈ $0.02 (gpt-4o-mini, n=30×3 + 처방 1콜 + 관련성 1콜)

## 3. 코드 지도 (핵심 모듈)

**코어 (`src/`, 런타임 의존성 @anthropic-ai/sdk 단일)**
- `report/segments.ts` — 페르소나 단위 Wilson 90% + 효과 ≥10%p **2티어 통계
  게이트** (GATE_Z·GATE_MIN_EFFECT·wilsonInterval export)
- `report/relevance.ts` — **LLM 관련성 게이트** (질문↔차원 1콜, 실패 시 null
  조용한 폴백, `<<< >>>` 인젝션 델리미터, RELEVANCE_SCHEMA는 strict 전필드 required)
- `report/generate.ts` — 게이트 소비, lowRelevance/weakSignals/withinNoise 티어,
  appendix 저작자표시
- `report/render.ts` — "## 참고 — 순위에 올리지 않은 차이" 섹션, 페르소나 각주
- `personas/narrative.ts` — **Nemotron 서사 결정적 매칭** (연령대×성×권역×혼인
  + 가구 호환 필터, FNV-1a). `src/types.ts`의 `narrative?`는 승인된 optional
- `study.ts` — runCensusStudy(narrativePool 옵션)

**웹 공유 (`web/`, 의존성 @libsql/client 단일)**
- `pipeline.ts` — 실측→처방→관련성→렌더→쉬운요약·차트 주입. NARRATIVE 기본 ON
- `easy-summary.ts` — 쉬운 요약 카드(생활 언어, 통계 용어 금지)
- `og-stats.ts`(불릿만 매칭 — SVG aria-label 회피) · `charts.ts` · `store*.ts` · `limits.ts`

**데이터**
- `data/census/kr-2024.json` — KOSIS 스냅샷 (IPF 골격, fidelity MAE 0.0000)
- `data/nemotron/kr-pool.json` — 서사 풀 3,022개(985KB, 167/168 스트라텀, CC BY
  4.0). 재생성: `npm run build && node dist/scripts/build-nemotron-pool.js`

**검증 하네스 (`eval/`)**: narrative-audit(키 없음, 모순 감사) ·
narrative-ab(실키 A/B) · report-demo 등

## 4. 방향 결정 — 사업화 (2026-07-06)

- npm 오픈소스 공개 **스킵** (패키징은 `private: true`로 봉인돼 저장소에 준비됨
  — 재개 시 한 줄 제거). Claude 교차 실측 보류
- **⚠️ 출시 전 필수 리마인드 (사용자 명시 요청)**: 사업화 공개·결제 도입 전에
  **Vercel Hobby → Pro 전환**을 반드시 먼저 상기시킬 것 (Hobby는 비상업 전용 약관)
- 검토 대기: GitHub 저장소 public+MIT → 비공개 전환/라이선스 재고 (권한 변경은
  사용자 직접 — GitHub Settings → Danger Zone)

## 5. 다음 후보 (사업화 트랙)

- 가격 모델·결제(Stripe 등)·계정 체계 설계 — 브레인스토밍부터
- 저장소 비공개 전환 (사용자 액션)
- 잔여 기술 부채(경미): refineHhFromNarrative 정규식은 풀 재생성 시 재감사 ·
  Nemotron 풀 정적 import는 기본 ON 체제에서 의도된 설계(주석 있음)

## 6. 불변식 (2026-07-06 기준 최신)

- `src/types.ts` **기존 필드 무수정** (optional 추가는 사용자 승인 시만 — 현재
  승인분: `narrative?`) · `src/aggregate` 무수정
- 표본 추출·가중치·세그먼트·리포트 수치에 서사 미유입 (프롬프트 전용)
- synthetic panel 과장 금지 · 처방 basis 라벨 · 차트 팔레트는 검증분만(다크에서도
  크림 카드 위) · 쉬운 요약 카드 통계 용어 금지
- 테스트 키 없이 그린 · seed 재현성 · 코어 런타임 의존성 단일
- 저작자표시: Nemotron CC BY 4.0 (appendix·콜로폰·README)

## 7. 함정·교훈 (재발 방지)

- **Vercel CLI는 한글 경로에서 사용 불가** (ByteString 오류) — 배포는 GitHub 연동만
- **Vercel은 Root Directory 안에서만 npm install** — app/이 쓰는 의존성은 전부
  `app/package.json`에 직접 선언 (devDeps typescript·@types/node 포함)
- ~~Vercel이 app/ 밖 커밋 배포 스킵~~ → `app/vercel.json` ignoreCommand로 해결됨
- **OpenAI strict structured outputs: 스키마의 모든 properties가 required 필수**
  — 아니면 400 거부인데 조용한 폴백이 삼켜 무증상. relevance.test.ts의 재귀
  strict-compat 테스트 패턴을 새 generateJson 스키마마다 복사할 것
- .gitignore 비앵커 패턴 주의 (`reports/`가 api/reports/를 삼켰던 사고)
- 서브에이전트가 "수집 대기" 상태로 턴을 끝내면: 프로세스 생존 확인 → 종료 대기
  → SendMessage로 재개 (이 패턴으로 세션한도·일시정지 전부 무손실 복구됨)

## 8. 프로세스 관례 (이 프로젝트에서 확립됨)

- **superpowers 플로우**: brainstorming(결정 합의) → 스펙 커밋 → writing-plans →
  subagent-driven-development. 레저: `.superpowers/sdd/progress.md` (재개 지점 기록)
- **모델 정책 (사용자 지시)**: 신중 작업은 메인 컨트롤러 fable 고정, 서브에이전트
  Opus 4.8. 메모리 `feedback-fable-only-critical-work` 참조
- **push는 매번 사용자 승인 게이트** (AskUserQuestion) · 라이브 스모크로 검증 마감
- 검증 리듬: 게이트(tsc·lint·vitest·build) → 태스크별 리뷰 → 최종 전체 리뷰 →
  push → 라이브 확인. 시각 작업은 프리뷰 도구(라이트/다크/모바일 computed style)
- 산출물(문서 외 생성물)은 저장소 밖 `Teddy\slides\` (사용자 선호 — 메모리 참조)

## 9. 샘플 리포트 (라이브 검증용 레퍼런스)

- /r/BAJnsFMKrF — 재택근무 (쉬운 요약 카드 첫 검증)
- /r/YY172ydchh — 보안솔루션 (통계 게이트: 혼인·성별 우연 범위 강등 확인)
- /r/sHfI4Oa45m — 반찬 구독 (서사 레이어 + 저작자표시 확인)
