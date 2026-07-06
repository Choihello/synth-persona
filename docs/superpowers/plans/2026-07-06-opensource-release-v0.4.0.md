# 오픈소스 릴리스 v0.4.0 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TS synth-persona를 오픈소스 공개 품질로 다듬어 v0.4.0으로 릴리스한다 — 데모 재포지셔닝 · README 보강 · 결함 청산 · npm 발행.

**Architecture:** 코어(src/)·웹 공유(web/)·앱(app/)의 3층 구조는 무수정. 데모의 카피 층(app 라우트·layout)과 문서 층(README·CONTRIBUTING·CHANGELOG)을 손보고, 결함 4건(허위 한 줄 요약·404·metadataBase·gitignore)을 고친 뒤 npm에 공개한다.

**Tech Stack:** TypeScript, Next.js 15 App Router, vitest, biome, npm.

**Spec:** `docs/superpowers/specs/2026-07-06-opensource-polish-design.md`

## Global Constraints

- `src/types.ts` 기존 필드 무수정 · `src/aggregate` 무수정
- 코어 런타임 의존성 @anthropic-ai/sdk 단일 · web은 @libsql/client 단일 (새 런타임 의존성 금지)
- 테스트는 API 키 없이 그린 · seed 재현성 유지
- synthetic panel 과장 금지 · Nemotron CC BY 4.0 저작자표시 유지
- 저장소 URL: `https://github.com/Choihello/synth-persona` · 라이브: `https://synth-persona-app.vercel.app`
- **이 세션 환경 주의**: vitest는 `npx vitest run --pool=threads`로 실행 (기본 forks 풀이 샌드박스에서 spawn 실패). CI/사용자 환경에선 기본 실행이 그린임
- push·npm publish는 각각 **사용자 승인 후에만** (AskUserQuestion)
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: 한 줄 요약의 허위 세그먼트 신호 수정 (src/report/generate.ts)

split인데 기회 세그먼트가 0개면 headline이 "일부 세그먼트에서 상대적으로 긍정 신호가 강합니다"라고 **근거 없는 주장**을 한다 (쉬운 요약 카드의 "세그먼트 간 뚜렷한 차이는 없었어요"와 모순 — 라이브 /r/sHfI4Oa45m에서 실증). topOpportunity 부재 시 문구를 정직하게 바꾼다.

**Files:**
- Modify: `src/report/generate.ts:167-170`
- Test: `src/report/generate.test.ts` (기존 파일에 테스트 추가)

**Interfaces:**
- Produces: `executiveSummary.headline` 문자열 계약 — split+기회세그먼트 0개일 때 "긍정 신호가 강합니다" 미포함. 다른 코드가 headline 문자열을 파싱하지 않음(렌더만 함) → 후속 태스크 영향 없음

- [ ] **Step 1: 기존 generate.test.ts의 테스트 헬퍼 파악**

`src/report/generate.test.ts`를 열어 기존 테스트가 `buildFounderReport`(또는 동명 함수)를 어떤 fixture로 호출하는지 확인한다. 기존 fixture 헬퍼를 재사용해 "split + 기회 세그먼트 없음" 상황을 만든다 (rankSegments가 빈 opportunity를 반환하도록 세그먼트 차이가 없는 균등 응답 fixture).

- [ ] **Step 2: 실패하는 테스트 작성**

```ts
// src/report/generate.test.ts 에 추가 (기존 describe 블록 안, 기존 fixture 헬퍼 재사용)
it("split인데 기회 세그먼트가 없으면 headline이 세그먼트 신호를 주장하지 않는다", () => {
  // 기존 헬퍼로 split 신호 + 세그먼트 간 차이 없는 결과 생성
  const report = buildReportWithNoSegmentDifference(); // 기존 fixture 패턴 따름
  expect(report.executiveSummary.topOpportunity).toBeUndefined();
  expect(report.executiveSummary.headline).not.toContain("긍정 신호가 강합니다");
  expect(report.executiveSummary.headline).toContain("뚜렷한 세그먼트 차이");
});
```

(fixture 생성이 기존 헬퍼로 안 되면 이 테스트 파일의 기존 패턴대로 최소 StudyResult mock을 구성한다. 핵심 단언 2개: `not.toContain("긍정 신호가 강합니다")`, `toContain("뚜렷한 세그먼트 차이")`.)

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/report/generate.test.ts --pool=threads`
Expected: 새 테스트 FAIL (headline이 "일부 세그먼트에서 상대적으로 긍정 신호가 강합니다"를 포함)

- [ ] **Step 4: 최소 구현**

```ts
// src/report/generate.ts:167-170 교체
const headline =
  result.signal === "split"
    ? topOpportunity
      ? `전체 반응은 갈렸지만, ${topOpportunity}에서 상대적으로 긍정 신호가 강합니다. 어느 방향을 더 확인해야 하는지 아래를 보세요.`
      : "전체 반응은 갈렸고, 순위에 올릴 만큼 뚜렷한 세그먼트 차이는 없었습니다. 세그먼트별 상세는 아래 참고 섹션을 보세요."
    : `전체적으로 비교적 합의된 반응입니다${topOpportunity ? ` (${topOpportunity} 특히)` : ""}. 다만 실제 조사로 검증이 필요합니다.`;
```

- [ ] **Step 5: 통과 확인 + 전체 회귀**

Run: `npx vitest run --pool=threads`
Expected: 전부 PASS (기존 어떤 테스트가 옛 문구를 단언하면 그 테스트의 fixture가 topOpportunity를 가지는지 확인 — 가진다면 그 경로는 문구 불변이라 영향 없음)

- [ ] **Step 6: Commit**

```bash
git add src/report/generate.ts src/report/generate.test.ts
git commit -m "fix(report): split+기회세그먼트 0개일 때 headline이 근거 없는 세그먼트 신호를 주장하지 않도록"
```

---

### Task 2: .gitignore 보강 — .env 변형 파일 예방

**Files:**
- Modify: `.gitignore:3`

**Interfaces:** 없음 (repo 위생)

- [ ] **Step 1: 규칙 교체**

`.gitignore`의 `.env` 줄을 다음으로 교체:

```gitignore
.env*
!.env.example
```

- [ ] **Step 2: 검증**

```bash
git check-ignore -v .env && echo OK-env
touch .env.local && git check-ignore -v .env.local && echo OK-local && rm .env.local
git check-ignore .env.example || echo OK-example-tracked
git status -sb   # .env.example가 삭제/변경으로 잡히지 않아야 함
```

Expected: OK-env, OK-local, OK-example-tracked 모두 출력, status 깨끗(추가된 .gitignore 변경만).

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: .env* 전체 무시(.env.example 제외) — env 변형 파일 커밋 사고 예방"
```

---

### Task 3: 미존재 리포트 ID → 진짜 HTTP 404

**Files:**
- Modify: `app/src/app/r/[id]/page.tsx:29-46` (및 상단 import)
- Create: `app/src/app/r/[id]/not-found.tsx`

**Interfaces:**
- Consumes: `next/navigation`의 `notFound()`
- Produces: 미존재 ID 요청 시 HTTP 404 + 기존과 같은 안내 UI

- [ ] **Step 1: not-found.tsx 생성**

```tsx
// app/src/app/r/[id]/not-found.tsx
import Link from "next/link";

export default function ReportNotFound() {
  return (
    <main>
      <h1>리포트를 찾을 수 없습니다</h1>
      <p className="backlink">
        <Link href="/new">← 새 리포트 만들기</Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: page.tsx에서 notFound() 호출**

`app/src/app/r/[id]/page.tsx` 상단에 import 추가:

```tsx
import { notFound } from "next/navigation";
```

`if (!row)` 블록(29~46행 부근)을 다음으로 교체:

```tsx
if (!row) notFound();
```

(기존 인라인 JSX 반환은 not-found.tsx로 이동했으므로 삭제. `row.status === "failed"` 이하 분기는 무수정.)

- [ ] **Step 3: 빌드 검증**

Run: `cd app && npx next build`
Expected: 통과. `/r/[id]` 라우트 ƒ(Dynamic) 유지.

- [ ] **Step 4: Commit**

```bash
git add app/src/app/r/[id]/page.tsx app/src/app/r/[id]/not-found.tsx
git commit -m "fix(app): 미존재 리포트 ID에 HTTP 404 반환 (notFound + not-found.tsx)"
```

(실제 404 상태코드는 Task 9 배포 후 `curl -w %{http_code}`로 라이브 확인.)

---

### Task 4: metadataBase 명시 — 빌드 경고 제거

**Files:**
- Modify: `app/src/app/layout.tsx:19-23`

- [ ] **Step 1: metadata에 metadataBase 추가**

```tsx
export const metadata: Metadata = {
  metadataBase: new URL("https://synth-persona-app.vercel.app"),
  title: "synth-persona — 0차 시장검증",
  description:
    "질문 하나로 통계청 합성 패널 90명의 반응을 받아보는 0차 시장검증 리포트",
};
```

(title·description은 Task 6에서 재포지셔닝 문구로 다시 손봄 — 이 태스크는 metadataBase만.)

- [ ] **Step 2: 경고 소멸 확인**

Run: `cd app && npx next build 2>&1 | grep -c "metadataBase"`
Expected: `0`

- [ ] **Step 3: Commit**

```bash
git add app/src/app/layout.tsx
git commit -m "fix(app): metadataBase 명시 — OG 절대 URL 로컬 빌드 경고 제거"
```

---

### Task 5: 한도 메시지의 오픈소스 CTA화 (web/limits.ts, TDD)

한도는 운영자 키의 비용 하드캡이므로 유지하되, 소진 안내를 "내일 다시"에서 "자기 키로 직접 실행(GitHub)"으로 바꾼다.

**Files:**
- Create: `web/limits.test.ts`
- Modify: `web/limits.ts:20-33`

**Interfaces:**
- Produces: `checkLimit` 반환 계약 불변 (`{ok:false, reason:string}`) — reason 문구만 변경. reason은 UI에 그대로 노출되므로 완결된 한국어 문장 + 저장소 URL 포함

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// web/limits.test.ts (신규)
import { describe, expect, it } from "vitest";
import { checkLimit } from "./limits.js";
import type { ReportStore } from "./store.js";

function fakeStore(counts: { global: number; ip: number }): ReportStore {
  return {
    countOnDate: async () => counts.global,
    countByIpOnDate: async () => counts.ip,
    // 나머지 메서드는 이 테스트에서 호출되지 않음
    create: async () => {},
    get: async () => undefined,
    setStatus: async () => {},
    setProgress: async () => {},
    markDone: async () => {},
    markFailed: async () => {},
  };
}

const policy = { perIpDaily: 3, globalDaily: 100 };
const now = new Date("2026-07-06T12:00:00Z");

describe("checkLimit 한도 메시지", () => {
  it("한도 내면 ok", async () => {
    const r = await checkLimit(fakeStore({ global: 0, ip: 0 }), "h", now, policy);
    expect(r.ok).toBe(true);
  });

  it("IP 한도 소진 시 오픈소스 전환 CTA를 안내한다", async () => {
    const r = await checkLimit(fakeStore({ global: 0, ip: 3 }), "h", now, policy);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("github.com/Choihello/synth-persona");
      expect(r.reason).toContain("직접 실행");
    }
  });

  it("전역 한도 소진 시에도 CTA를 안내한다", async () => {
    const r = await checkLimit(fakeStore({ global: 100, ip: 0 }), "h", now, policy);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("github.com/Choihello/synth-persona");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run web/limits.test.ts --pool=threads`
Expected: CTA 단언 2개 FAIL ("내일 다시 시도" 문구엔 URL 없음)

- [ ] **Step 3: 구현**

```ts
// web/limits.ts — 두 reason 문구 교체
const REPO = "https://github.com/Choihello/synth-persona";

// 전역 한도:
reason: `오늘의 데모 체험분이 모두 소진됐습니다. 이 도구는 오픈소스라 자기 API 키로 직접 실행하면 제한이 없습니다 — ${REPO}`,

// IP 한도:
reason: `오늘 이 네트워크의 데모 횟수(${policy.perIpDaily}회)를 다 썼습니다. 자기 API 키로 직접 실행하면 제한이 없습니다 — ${REPO}`,
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run web/ --pool=threads`
Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add web/limits.ts web/limits.test.ts
git commit -m "feat(web): 한도 소진 메시지를 오픈소스 전환 CTA로 (자기 키 직접 실행 안내)"
```

---

### Task 6: 데모 재포지셔닝 — 랜딩·레이아웃·/new 카피

**Files:**
- Modify: `app/src/app/page.tsx` (kicker·CTA행·bottom-note)
- Modify: `app/src/app/layout.tsx` (masthead tag·metadata 문구·footer)
- Modify: `app/src/app/new/page.tsx` (데모 고지 한 줄)

**Interfaces:** 카피만 변경 — 컴포넌트 구조·className 불변 (globals.css 무수정로 통과해야 함. 새 링크는 기존 클래스 재사용)

- [ ] **Step 1: page.tsx 히어로·하단 교체**

kicker (8행):

```tsx
<p className="landing-kicker">오픈소스 합성 패널 엔진 · 라이브 데모</p>
```

CTA 행 (19~26행) — GitHub 링크 추가:

```tsx
<div className="landing-cta-row">
  <Link className="landing-cta" href="/new">
    리포트 만들기 — 약 1분
  </Link>
  <Link className="landing-sample-link" href="/r/BAJnsFMKrF">
    샘플 리포트 보기 →
  </Link>
  <a
    className="landing-sample-link"
    href="https://github.com/Choihello/synth-persona"
  >
    GitHub에서 코드 보기 →
  </a>
</div>
```

bottom-note (108행):

```tsx
<p className="landing-bottom-note">
  오픈소스 데모 · IP당 하루 3회 — 무제한은{" "}
  <a href="https://github.com/Choihello/synth-persona">자기 키로 직접 실행</a>
</p>
```

- [ ] **Step 2: layout.tsx 문구 교체**

metadata (Task 4에서 metadataBase 추가된 상태 위에):

```tsx
export const metadata: Metadata = {
  metadataBase: new URL("https://synth-persona-app.vercel.app"),
  title: "synth-persona — 오픈소스 합성 패널 엔진",
  description:
    "통계청 분포 기반 합성 패널 90명에게 질문을 던지는 오픈소스 엔진의 라이브 데모 — 세그먼트 유의성 게이트·쉬운 요약 리포트",
};
```

masthead tag (34행):

```tsx
<span className="tag">오픈소스 합성 패널 · 라이브 데모</span>
```

footer (37~46행) — MIT 표기 추가:

```tsx
<footer className="colophon">
  통계청 인구총조사 분포 기반 합성 패널 · 결과는 실제 시장 반응이 아닌
  탐색 신호입니다 · 오픈소스 (MIT) ·{" "}
  <a href="https://github.com/Choihello/synth-persona">GitHub</a> · 서사:{" "}
  <a href="https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea">
    Nemotron-Personas-Korea
  </a>{" "}
  (CC BY 4.0)
</footer>
```

- [ ] **Step 3: new/page.tsx 데모 고지**

disclaimer div(43~47행) 바로 아래에 추가:

```tsx
<p className="lede" style={{ fontSize: "0.85em" }}>
  이 페이지는 오픈소스 프로젝트{" "}
  <a href="https://github.com/Choihello/synth-persona">synth-persona</a>의
  라이브 데모입니다 — 자기 API 키로 직접 실행하면 횟수 제한이 없습니다.
</p>
```

- [ ] **Step 4: 빌드 + 프리뷰 검증**

Run: `cd app && npx next build`
Expected: 통과

프리뷰 도구로 확인 (로컬 dev 또는 빌드 서버): 랜딩 라이트/다크/모바일(375px)에서 kicker·GitHub 링크·bottom-note가 깨지지 않고, 새 `<a>`가 기존 landing-sample-link 스타일로 렌더되는지. `preview_inspect`로 링크 색·줄바꿈 확인.

- [ ] **Step 5: Commit**

```bash
git add app/src/app/page.tsx app/src/app/layout.tsx app/src/app/new/page.tsx
git commit -m "feat(app): 데모를 오픈소스 엔진 쇼케이스로 재포지셔닝 — GitHub CTA·MIT 표기·한도 문구 전환"
```

---

### Task 7: README 보강 — 영문 서문·웹 섹션·로드맵·스크린샷

**Files:**
- Modify: `README.md` (3곳: 배지 아래 서문, "## 웹 서비스 (web/)" 섹션, "## 로드맵")
- Create: `docs/screenshots/report-light.png`, `docs/screenshots/report-dark.png`

**Interfaces:** 없음 (문서)

- [ ] **Step 1: 라이브 리포트 스크린샷 촬영 (playwright CLI, 라이브 사이트 대상 — 로컬 env 불필요)**

```bash
npx playwright install chromium   # 최초 1회 (~120MB)
npx playwright screenshot --viewport-size=1280,900 --wait-for-timeout=4000 \
  "https://synth-persona-app.vercel.app/r/BAJnsFMKrF" docs/screenshots/report-light.png
npx playwright screenshot --viewport-size=1280,900 --wait-for-timeout=4000 --color-scheme=dark \
  "https://synth-persona-app.vercel.app/r/BAJnsFMKrF" docs/screenshots/report-dark.png
```

Expected: PNG 2장 생성. 각 파일을 Read로 열어 쉬운 요약 카드가 잘 보이는지 눈으로 확인. (playwright 설치 실패 시 대안: claude-in-chrome으로 라이브 페이지 캡처.)

- [ ] **Step 2: 영문 서문 삽입 (배지 줄과 demo.svg 사이)**

```markdown
## For English readers

**What** — an open-source synthetic-panel engine for Korea: it builds a
statistically grounded virtual population from official census
distributions (KOSIS 2024, IPF-fitted joints), asks each persona your
market question via an LLM, and aggregates the answers into a
founder-friendly report with a two-tier significance gate (Wilson 90% CI
+ minimum effect size) so noise never gets ranked as signal.

**Why** — real surveys take weeks and cost thousands; early ideas only
need a *directional* read. The tool is honest about what it is: every
number is labeled a synthetic panel response, disagreement (🔴) is
surfaced as "spend your real research budget here", not hidden.

**Quickstart** (no API key needed — deterministic mock provider):

```console
npm install && npm run build
node dist/cli/main.js --question "Would you subscribe?" \
  --choices "yes,no" --n 60 --seed 7 --mock --source census
```

**Live demo** — https://synth-persona-app.vercel.app (capped hosted
showcase; run it with your own key for unlimited use). Docs below are in
Korean; the code, tests and CLI are English-friendly.
```

- [ ] **Step 3: "## 웹 서비스 (web/)" 섹션 갱신**

기존 섹션(181행 부근)을 열어 현재 내용을 확인하고, 다음 요소가 없으면 추가:

```markdown
## 웹 서비스 — 라이브 데모

**https://synth-persona-app.vercel.app** (Vercel + Turso, 운영비 하드캡
때문에 IP당 하루 3회 — 자기 키로 돌리면 무제한)

<p align="center">
  <img src="docs/screenshots/report-light.png" alt="리포트 — 쉬운 요약 카드와 세그먼트 게이트" width="680">
</p>
<p align="center">
  <img src="docs/screenshots/report-dark.png" alt="다크 모드 리포트" width="680">
</p>

질문 → 합성 패널 90명 응답 → 리포트 공유 링크. 리포트에는 쉬운 요약
카드(통계 용어 없는 생활 언어) · Wilson 2티어 유의성 게이트(우연 범위
차이는 순위에서 강등) · LLM 관련성 게이트 · Nemotron 서사 페르소나 ·
동적 OG 이미지가 들어간다.
```

(기존 섹션에 로컬 실행법 등 유효한 내용이 있으면 보존하고 위 요소만 병합.)

- [ ] **Step 4: 로드맵 갱신**

`- [ ] 웹 UI` 줄을 다음으로 교체:

```markdown
- [x] **웹 서비스 (v0.2~0.3)** — Next.js 15 App Router + Vercel + Turso 라이브 데모: 폼 → 진행 폴링 → 공유 리포트. 쉬운 요약 카드 · Wilson 2티어 통계 게이트(GATE_Z=1.645, 최소 효과 10%p) · LLM 관련성 게이트(실패 시 조용한 폴백) · Nemotron-Personas-Korea 서사 결정적 매칭(FNV-1a) · 동적 OG · 다크 모드 · IP 해시 레이트리밋
- [ ] (탐색) 게이트 임계·표본 크기 가이드 문서화
```

- [ ] **Step 5: 검증 + Commit**

README를 처음부터 끝까지 읽어 재포지셔닝 톤과 어긋나는 문장이 없는지 확인.

```bash
npm run lint   # biome가 md는 안 보지만 저장소 전체 무결성 확인
git add README.md docs/screenshots/
git commit -m "docs: 영문 서문·라이브 데모 스크린샷·로드맵 최신화 — 오픈소스 릴리스 준비"
```

---

### Task 8: CONTRIBUTING · CHANGELOG · package.json v0.4.0

**Files:**
- Create: `CONTRIBUTING.md`
- Modify: `CHANGELOG.md` (상단에 v0.4.0 항목)
- Modify: `package.json:3-4` (version 0.4.0, private 제거)

**Interfaces:**
- Produces: `package.json`이 publish 가능 상태 (`private` 필드 없음, version `0.4.0`) — Task 10이 소비

- [ ] **Step 1: CONTRIBUTING.md 작성**

```markdown
# Contributing

## 개발 셋업

```console
# Node 24+
npm install
npm run build        # tsup — dist/ 생성 (CLI·eval 스크립트가 dist를 실행)
```

## 게이트 4종 — PR 전 전부 그린이어야 합니다

```console
npx vitest run       # 전부 API 키 없이 돕니다 (결정적 mock·seed 고정)
npx tsc --noEmit
npm run lint         # biome
cd app && npx next build
```

## 불변식

- 테스트는 **API 키 없이** 그린이어야 합니다 — 키가 필요한 검증은 `eval/`의
  live 스크립트로 분리합니다
- 코어(`src/`) 런타임 의존성은 @anthropic-ai/sdk 단일, `web/`은
  @libsql/client 단일 — 새 런타임 의존성은 이슈에서 먼저 논의해 주세요
- `src/types.ts` 기존 필드는 수정하지 않습니다 (optional 추가는 논의 후)
- synthetic panel 결과를 실제 시장 반응처럼 표현하는 카피는 받지 않습니다
- Nemotron-Personas-Korea (CC BY 4.0) 저작자표시를 유지합니다

## 커밋

conventional commits (`feat:`, `fix:`, `docs:`, `chore:`)를 따릅니다.
```

- [ ] **Step 2: CHANGELOG.md 상단에 v0.4.0 추가**

기존 형식을 확인하고 맞춰서:

```markdown
## 0.4.0 — 2026-07-06

- **오픈소스 공개 릴리스** — npm 첫 발행, 데모를 "오픈소스 엔진의 라이브
  데모"로 재포지셔닝 (한도 안내가 자기 키 실행 CTA로)
- fix: split+기회 세그먼트 0개일 때 한 줄 요약이 근거 없는 세그먼트 신호를
  주장하던 것 수정
- fix: 미존재 리포트 ID가 200을 반환하던 것 → HTTP 404
- fix: metadataBase 명시 (로컬 빌드 OG 경고 제거)
- docs: 영문 서문·라이브 스크린샷·CONTRIBUTING 추가
- chore: `.env*` gitignore 보강
```

- [ ] **Step 3: package.json — 발행 가능 상태로**

```jsonc
// 변경 2곳:
"version": "0.4.0",
// "private": true 줄 삭제
```

- [ ] **Step 4: 패키지 구성 검증**

```bash
npm run build && npm pack --dry-run 2>&1 | tail -20
```

Expected: files 화이트리스트(dist, data/census, data/nemotron, LICENSE, README.md)대로 구성. **총 크기(unpacked size)를 기록**하고, 5MB를 크게 넘으면 사용자에게 보고 (Nemotron 풀 985KB 포함 예상 ~2-4MB 정상 범위).

- [ ] **Step 5: 게이트 + Commit**

```bash
npx vitest run --pool=threads && npx tsc --noEmit && npm run lint
git add CONTRIBUTING.md CHANGELOG.md package.json
git commit -m "chore(release): v0.4.0 — private 봉인 해제·CONTRIBUTING·CHANGELOG"
```

---

### Task 9: 전체 게이트 · 최종 리뷰 · push 승인 · 라이브 스모크

**Files:** 없음 (검증·배포)

- [ ] **Step 1: 게이트 4종 전체 실행**

```bash
npx vitest run --pool=threads   # 324+ passed (기존 321 + Task 1·5 신규)
npx tsc --noEmit
npm run lint
cd app && npx next build && cd ..
```

Expected: 전부 그린. 하나라도 실패하면 해당 태스크로 돌아가 수정.

- [ ] **Step 2: 최종 코드 리뷰**

superpowers:requesting-code-review 스킬로 main 대비 변경 전체를 리뷰 (서브에이전트 Opus 4.8). 지적 사항은 superpowers:receiving-code-review로 검증 후 반영.

- [ ] **Step 3: push 승인 게이트**

AskUserQuestion으로 push 승인 요청 (커밋 목록 요약 포함). **승인 없이 push 금지.**

- [ ] **Step 4: push + 배포 확인**

```bash
git push origin main
```

Vercel 자동 배포 완료 대기 (~2분) 후 라이브 스모크:

```bash
S=https://synth-persona-app.vercel.app
curl -s -o /dev/null -w '%{http_code}\n' $S/r/zzzzzzzzzz     # 404 여야 함 (Task 3)
curl -s $S/ | grep -c "오픈소스 합성 패널 엔진"                # ≥1 (Task 6)
curl -s $S/ | grep -c "github.com/Choihello/synth-persona"   # ≥2 (CTA+footer)
curl -sI $S/opengraph-image | grep "200"                     # OG 정상
curl -s $S/r/BAJnsFMKrF | grep -c "한눈에 보기"               # 기존 리포트 무손상
```

Expected: 전부 기대값. 실패 시 원인 파악 후 수정 (배포 전 상태로 롤백하지 말고 fix-forward).

---

### Task 10: npm 발행 (재승인 게이트) · footer npm 링크 · Release v0.4.0

**Files:**
- Modify: `app/src/app/layout.tsx` (footer에 npm 링크 — 발행 확인 후)

**Interfaces:**
- Consumes: Task 8의 publish 가능 package.json, Task 9의 push 완료 상태

- [ ] **Step 1: 발행 사전 점검**

```bash
npm whoami          # 로그인 안 돼 있으면 사용자에게 npm login 요청
npm view synth-persona 2>&1 | head -2   # 여전히 404(미점유)인지 재확인
npm run build && npm pack --dry-run | tail -5
```

- [ ] **Step 2: 발행 재승인 게이트**

AskUserQuestion: 패키지명·버전·크기·포함 파일 요약을 제시하고 발행 최종 승인 요청. **되돌리기 어려운 대외 공개 — 승인 없이 publish 금지.**

- [ ] **Step 3: 발행**

```bash
npm publish
```

**한글 경로에서 실패 시 (ByteString/경로 오류)**: 우회 —

```bash
npm pack   # synth-persona-0.4.0.tgz 생성
mkdir -p /c/npub && cp synth-persona-0.4.0.tgz /c/npub/ && cd /c/npub
npm publish synth-persona-0.4.0.tgz
cd - && rm synth-persona-0.4.0.tgz && rm -rf /c/npub
```

발행 후 확인: `npm view synth-persona version` → `0.4.0`

- [ ] **Step 4: footer npm 링크 추가 + README 뱃지**

layout.tsx footer의 GitHub 링크 뒤에 추가:

```tsx
·{" "}
<a href="https://www.npmjs.com/package/synth-persona">npm</a>
```

README 배지 줄에 추가:

```markdown
[![npm](https://img.shields.io/npm/v/synth-persona)](https://www.npmjs.com/package/synth-persona)
```

```bash
cd app && npx next build && cd ..   # 빌드 확인
git add app/src/app/layout.tsx README.md
git commit -m "docs: npm 발행 링크·뱃지 추가"
```

- [ ] **Step 5: push(승인 게이트 재사용 — Step 2 승인에 포함돼 있으면 바로) + Release 태그**

```bash
git push origin main
git tag v0.4.0 && git push origin v0.4.0
gh release create v0.4.0 --title "v0.4.0 — open-source release" \
  --notes "첫 npm 발행. 데모 재포지셔닝·404 수정·영문 서문·CONTRIBUTING. CHANGELOG 참조."
```

- [ ] **Step 6: 마감 라이브 스모크**

```bash
S=https://synth-persona-app.vercel.app
curl -s $S/ | grep -c "npmjs.com/package/synth-persona"   # ≥1
npm view synth-persona version                            # 0.4.0
```

Expected: 전부 기대값 → 릴리스 완료 보고.

---

## Self-Review 기록

- **스펙 커버리지**: §1(Task 6+5) · §2(Task 7) · §3(Task 1·2·3·4) · §4(Task 8·10) · §5(Task 8·9·10) · §6 순서 일치 · §7 불변식은 Global Constraints로 · §8 검증 전략은 각 태스크 Step에 분산 — 누락 없음
- **플레이스홀더**: Task 1 Step 2의 fixture는 기존 테스트 패턴 참조를 명시 (파일을 열어 확인하는 단계가 Step 1) — 허용 범위
- **타입 일관성**: checkLimit·ReportStore·notFound 시그니처는 현행 코드에서 직접 확인함
