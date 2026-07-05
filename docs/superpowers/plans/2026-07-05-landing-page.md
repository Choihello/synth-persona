# 랜딩 페이지 + /new 분리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/`를 신문 1면 스타일 정적 랜딩으로 교체하고 서비스 폼을 `/new`로 이동한다.

**Architecture:** 랜딩은 로직 없는 정적 서버 컴포넌트(`app/src/app/page.tsx` 교체), 기존 홈은 `app/src/app/new/page.tsx`로 그대로 이동. 스타일은 `globals.css`의 `.landing-*` 블록 — 기존 CSS 변수 토큰만 사용해 다크 모드 자동 대응.

**Tech Stack:** Next.js 15 App Router, CSS(토큰 기반), 로직·테스트 변화 없음 (게이트: build + 시각검증).

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-05-landing-page-design.md`
- 코어(src/)·web/ 무수정. app/ 안에서만 작업
- CSS는 기존 CSS 변수 토큰만 사용, 신규 색 리터럴 금지 (기존 파일에 이미 있는 `rgba(31, 29, 26, …)` 그림자 패턴은 허용). 다크 모드 미디어쿼리는 globals.css **파일 끝** 유지
- 헤드라인·서브카피·면책 문구는 스펙의 문자열 그대로 (한 글자도 변형 금지)
- 샘플 리포트 링크는 `/r/BAJnsFMKrF`
- synthetic panel 과장 금지: 예시 카드에 `예시 리포트` 라벨, 면책 섹션 필수
- 커밋 메시지 끝 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- push는 사용자 승인 후에만 (Task 4)

---

### Task 1: 서비스 페이지를 /new로 이동 + 내부 링크 조정

**Files:**
- Create: `app/src/app/new/page.tsx` (기존 `app/src/app/page.tsx` 내용 이동)
- Modify: `app/src/app/r/[id]/page.tsx` (backlink 3곳 `/` → `/new`)
- (이 태스크에서는 `app/src/app/page.tsx`를 아직 건드리지 않는다 — Task 2에서 교체)

**Interfaces:**
- Consumes: 기존 `ReportForm`(`app/src/app/report-form.tsx`), `getStore`/`unescapeHtml`(`app/src/lib/`), `ReportRow` 타입(`web/store.js`)
- Produces: 라우트 `/new` — Task 2의 랜딩 CTA가 `href="/new"`로 링크

- [ ] **Step 1: /new 페이지 생성**

`app/src/app/new/page.tsx`를 새로 만들고 현재 `app/src/app/page.tsx`의 내용을 그대로 붙여넣되, **import 상대 경로만** 한 단계 깊어진 위치에 맞게 조정한다:

```tsx
import Link from "next/link";
import type { ReportRow } from "../../../../web/store.js";
import { getStore } from "../../lib/backend.js";
import { unescapeHtml } from "../../lib/html.js";
import ReportForm from "../report-form.js";
```

나머지 본문(`export const revalidate = 3600;`, `loadGallery`, `Home` 컴포넌트 전체)은 무수정 복사. 컴포넌트 이름은 `Home` 그대로 둬도 무방하나 명확성을 위해 `NewReportPage`로 바꾼다 (default export 함수명만 변경).

- [ ] **Step 2: r/[id] backlink 조정**

`app/src/app/r/[id]/page.tsx`에서 `href="/"` 3곳(리포트 없음 "← 새 리포트 만들기", 실패 "← 다시 시도", 완료 뷰 "← 새 리포트 만들기")을 모두 `href="/new"`로 변경.

- [ ] **Step 3: 빌드로 검증 (아직 / 는 옛 홈 그대로 — 공존 확인)**

Run: `cd app && npx next build`
Expected: 통과, 라우트 목록에 `○ /new` 추가 (기존 `/`도 유지)

- [ ] **Step 4: 기존 테스트 확인**

Run: `npx vitest run` (repo 루트)
Expected: 279 passed (변화 없음)

- [ ] **Step 5: Commit**

```bash
git add app/src/app/new/page.tsx "app/src/app/r/[id]/page.tsx"
git commit -m "feat(app): move report form to /new (landing will take /)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 랜딩 페이지 구현 (/ 교체 + .landing-* 스타일)

**Files:**
- Modify: `app/src/app/page.tsx` (전체 교체)
- Modify: `app/src/app/globals.css` (`.landing-*` 블록 추가 — "쉬운 요약 카드" 섹션 뒤, 다크 모드 미디어쿼리 **앞**에 삽입 + 다크 블록에 오버라이드 2줄)

**Interfaces:**
- Consumes: 라우트 `/new` (Task 1), 기존 토큰(--surface, --surface-raised, --ink, --ink-secondary, --ink-muted, --hairline, --accent, --amber), 차트 팔레트 리터럴(#2a78d6/#e34948 — 크림 카드 위에서만)
- Produces: 정적 랜딩 `/`

- [ ] **Step 1: page.tsx 전체 교체**

`app/src/app/page.tsx`를 아래 내용으로 교체 (frontend-design 스킬 원칙: 방향 = 리서치 에디토리얼/신문 1면, AI슬롭 배제 — 그라데이션·글래스·과잉 라운드 금지):

```tsx
import Link from "next/link";

/** 랜딩 — 신문 1면. 정적 마크업만, DB 접근 없음 (항상 즉시 뜨고 깨지지 않는다). */
export default function Landing() {
  return (
    <main className="landing">
      <section className="landing-hero">
        <p className="landing-kicker">창업자를 위한 0차 시장검증</p>
        <h1 className="landing-headline">
          진짜 고객을 만나기 전,
          <br />
          <span className="landing-underline">가짜 90명</span>에게 먼저
          물어보세요
        </h1>
        <p className="landing-sub">
          통계청 인구 분포를 흉내 낸 합성 패널 — 실제 여론이 아니라서, 오히려
          솔직하게 쓸 수 있습니다
        </p>
        <div className="landing-cta-row">
          <Link className="landing-cta" href="/new">
            리포트 만들기 — 약 1분
          </Link>
          <Link className="landing-sample-link" href="/r/BAJnsFMKrF">
            샘플 리포트 보기 →
          </Link>
        </div>
      </section>

      <section className="landing-cards" aria-label="예시 리포트 미리보기">
        <Link href="/r/BAJnsFMKrF" className="landing-report-card">
          <span className="landing-card-label">예시 리포트</span>
          <p className="landing-card-kicker">한눈에 보기</p>
          <p className="landing-card-verdict">반응이 뚜렷하게 긍정적이에요</p>
          <p className="landing-card-num">
            10명 중 9명<span>이 “있다”</span>
          </p>
          <span className="landing-bar" aria-hidden="true">
            <i style={{ width: "87%" }} />
            <em />
          </span>
          <span className="landing-card-basis">가상 응답 90개 기준</span>
        </Link>
        <Link href="/r/BAJnsFMKrF" className="landing-report-card">
          <span className="landing-card-label">예시 리포트</span>
          <p className="landing-card-kicker">기회 세그먼트</p>
          <p className="landing-card-verdict">
            수도권 거주자의 반응이 가장 좋았어요
          </p>
          <p className="landing-card-num">
            10명 중 9명<span>이 긍정</span>
          </p>
          <span className="landing-bar" aria-hidden="true">
            <i style={{ width: "89%" }} />
            <em />
          </span>
          <span className="landing-card-basis">가상 응답 90개 기준</span>
        </Link>
      </section>

      <section className="landing-how">
        <h2>작동 방식</h2>
        <ol>
          <li>
            <span className="landing-step-num">1</span>
            <h3>질문을 입력합니다</h3>
            <p>선택지 2~4개, 200자 이내 — 첫 번째 선택지가 긍정 방향입니다.</p>
          </li>
          <li>
            <span className="landing-step-num">2</span>
            <h3>합성 패널 90명이 응답합니다</h3>
            <p>통계청 인구총조사 분포로 구성된 가상 패널이 약 1분간 응답합니다.</p>
          </li>
          <li>
            <span className="landing-step-num">3</span>
            <h3>리포트와 공유 링크를 받습니다</h3>
            <p>쉬운 요약, 세그먼트 분석, 다음 행동 처방이 담긴 리포트가 생성됩니다.</p>
          </li>
        </ol>
      </section>

      <section className="landing-honest">
        <h2>이 서비스가 하지 않는 것</h2>
        <ul>
          <li>
            <strong>실제 여론조사가 아닙니다</strong> — AI가 인구 구성을 흉내
            내 답한 결과입니다.
          </li>
          <li>
            <strong>고객 인터뷰를 대체하지 않습니다</strong> — 인터뷰 전에
            가설을 좁히는 용도입니다.
          </li>
          <li>
            <strong>수치는 방향 신호입니다</strong> — 실제 시장 반응·구매율이
            아닙니다.
          </li>
        </ul>
      </section>

      <section className="landing-bottom">
        <Link className="landing-cta" href="/new">
          리포트 만들기 — 약 1분
        </Link>
        <p className="landing-bottom-note">무료 · IP당 하루 3회</p>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: globals.css에 .landing-* 블록 추가**

`/* ── 다크 모드 ─────────────────────────────── */` 주석 **바로 위**에 삽입:

```css
/* ── 랜딩 (신문 1면) ────────────────────────── */
.landing-hero {
  text-align: center;
  padding: 48px 0 40px;
}

.landing-kicker {
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.18em;
  color: var(--ink-muted);
  margin: 0 0 18px;
}

.landing-headline {
  font-size: clamp(34px, 6.4vw, 54px);
  line-height: 1.22;
  letter-spacing: -0.02em;
  margin: 0 0 18px;
}

.landing-underline {
  border-bottom: 3px solid var(--accent);
  padding-bottom: 2px;
}

.landing-sub {
  font-size: 17px;
  color: var(--ink-secondary);
  max-width: 30em;
  margin: 0 auto 26px;
}

.landing-cta-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  flex-wrap: wrap;
}

.landing-cta {
  display: inline-block;
  padding: 13px 26px;
  font-size: 15.5px;
  font-weight: 600;
  color: #fff;
  background: var(--ink);
  border-radius: 8px;
  text-decoration: none;
}

.landing-cta:hover {
  background: #000;
}

.landing-sample-link {
  font-size: 14.5px;
  color: var(--ink-secondary);
}

.landing-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin: 8px 0 8px;
}

.landing-report-card {
  display: block;
  background: var(--surface-raised);
  border: 1px solid var(--hairline);
  border-radius: 10px;
  padding: 20px 22px;
  text-decoration: none;
  color: var(--ink);
  box-shadow: 0 1px 2px rgba(31, 29, 26, 0.04);
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.landing-report-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(31, 29, 26, 0.08);
}

.landing-card-label {
  display: inline-block;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--ink-muted);
  border: 1px solid var(--hairline);
  border-radius: 4px;
  padding: 1px 7px;
  margin-bottom: 12px;
}

.landing-card-kicker {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--ink-muted);
  margin: 0 0 4px;
}

.landing-card-verdict {
  font-family: var(--font-serif), serif;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.35;
  margin: 0;
}

.landing-card-num {
  font-family: var(--font-serif), serif;
  font-size: 26px;
  font-weight: 700;
  margin: 8px 0 0;
  font-variant-numeric: tabular-nums;
}

.landing-card-num span {
  font-family: var(--font-sans), sans-serif;
  font-size: 14px;
  font-weight: 400;
  color: var(--ink-secondary);
  margin-left: 4px;
}

.landing-bar {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  margin-top: 12px;
  background: #faf6ef; /* 차트 팔레트는 크림 위 검증분 — 카드가 다크여도 크림 유지 */
  padding: 0;
}

.landing-bar i {
  background: #2a78d6;
  border-radius: 4px 0 0 4px;
  margin-right: 2px;
}

.landing-bar em {
  background: #e34948;
  flex: 1;
  border-radius: 0 4px 4px 0;
}

.landing-card-basis {
  display: block;
  font-size: 12px;
  color: var(--ink-muted);
  margin-top: 8px;
}

.landing-how {
  margin-top: 48px;
}

.landing-how h2,
.landing-honest h2 {
  font-size: 21px;
  margin: 0 0 18px;
  padding-top: 20px;
  border-top: 1px solid var(--hairline);
}

.landing-how ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 24px;
}

.landing-step-num {
  font-family: var(--font-serif), serif;
  font-size: 34px;
  font-weight: 700;
  color: var(--ink-muted);
  line-height: 1;
  display: block;
  margin-bottom: 8px;
}

.landing-how h3 {
  font-size: 16px;
  margin: 0 0 6px;
}

.landing-how li p {
  font-size: 14px;
  color: var(--ink-secondary);
  margin: 0;
}

.landing-honest {
  margin-top: 48px;
}

.landing-honest ul {
  list-style: none;
  margin: 0;
  padding: 16px 20px;
  border-left: 3px solid var(--amber);
  background: rgba(185, 133, 0, 0.06);
}

.landing-honest li {
  font-size: 14.5px;
  color: var(--ink-secondary);
  margin: 6px 0;
}

.landing-honest strong {
  color: var(--ink);
}

.landing-bottom {
  text-align: center;
  margin-top: 56px;
  padding-top: 32px;
  border-top: 1px solid var(--hairline);
}

.landing-bottom-note {
  font-size: 13px;
  color: var(--ink-muted);
  margin: 10px 0 0;
}

@media (max-width: 640px) {
  .landing-cards,
  .landing-how ol {
    grid-template-columns: 1fr;
  }

  .landing-hero {
    padding: 28px 0 32px;
  }
}
```

그리고 **기존 다크 모드 블록**(`@media (prefers-color-scheme: dark)`) 안에, `button[type="submit"]` 오버라이드 옆에 추가:

```css
  .landing-cta {
    color: var(--surface);
  }

  .landing-cta:hover {
    background: #fff;
  }

  .landing-honest ul {
    background: rgba(212, 160, 23, 0.09);
  }
```

- [ ] **Step 3: 빌드 + 정적 확인**

Run: `cd app && npx next build`
Expected: 통과. 라우트 목록에서 `/`가 `○ (Static)` — revalidate 없는 순수 정적.

- [ ] **Step 4: 로컬 렌더 확인**

```powershell
cd app; npx next start -p 3215   # 백그라운드
# 확인:
# curl http://localhost:3215/     → "가짜 90명" 포함, href="/new" 2회, /r/BAJnsFMKrF 3회
# curl http://localhost:3215/new  → 폼(textarea) + "샘플 리포트" 갤러리 마크업
```

- [ ] **Step 5: biome + Commit**

```bash
npx biome check --write app/src/app/page.tsx
git add app/src/app/page.tsx app/src/app/globals.css
git commit -m "feat(app): newspaper-front landing at / (hero, sample cards, how-it-works, honesty)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 시각검증 + 가이드라인 검수 + 폴리시

**Files:**
- Modify(필요 시): `app/src/app/page.tsx`, `app/src/app/globals.css` (검수에서 나온 수정만)

**Interfaces:**
- Consumes: Task 2의 랜딩. 프리뷰 도구(mcp__Claude_Preview__*, launch.json "app" — repo 루트에서 `npx next start app -p 3211`)

- [ ] **Step 1: 프리뷰 시각검증 3종**

1. **라이트 데스크톱**: preview_start("app") → 스크린샷. 확인: 헤드라인 세리프 대형 중앙, "가짜 90명" 파란 밑줄, 카드 2장 나란히, 3단계 3열, amber 면책, 하단 CTA
2. **다크**: preview_resize(colorScheme dark) → `.landing-report-card` bg = rgb(34,30,25), `.landing-cta` color = rgb(25,22,19), `.landing-bar` bg = rgb(250,246,239)(크림 유지) computed style 확인
3. **모바일 375px**: preview_resize(width 375, height 812) → 헤드라인 34px대로 축소, 카드·3단계 1열 스택, 가로 오버플로우 없음(`document.documentElement.scrollWidth <= clientWidth`)

- [ ] **Step 2: web-design-guidelines 검수**

`~/.claude/skills/web-design-guidelines/references/guidelines.md`의 규칙으로 `app/src/app/page.tsx` + `.landing-*` CSS를 점검 (`file:line` 형식 발견 사항). 특히: 링크 구분성, 터치 타깃 크기, 대비, reduced-motion(transition만 사용하므로 통과 예상), 시맨틱 헤딩 순서(h1→h2→h3).

- [ ] **Step 3: impeccable-design-polish 패스 (Audit → Polish → Harden)**

발견된 Critical/Important급 문제만 직접 수정 (cosmetic churn 금지). 수정했으면 빌드 재확인.

- [ ] **Step 4: Commit (수정이 있었던 경우만)**

```bash
git add app/src/app/page.tsx app/src/app/globals.css
git commit -m "polish(app): landing guideline fixes from design review pass

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 전체 게이트 + push(사용자 승인) + 라이브 확인 + 문서

- [ ] **Step 1: Full verification**

```powershell
npx tsc --noEmit          # 통과
npm run lint              # 0 errors
npx vitest run            # 279 passed
cd app; npx next build    # 통과, / = Static
```

- [ ] **Step 2: push (사용자 승인 게이트)**

커밋 목록 요약해 승인 요청 → `git push`. app/만 변경이라 Vercel 스킵 함정 없음.

- [ ] **Step 3: 라이브 확인**

- `https://synth-persona-app.vercel.app/` → 랜딩 렌더 ("가짜 90명" 포함)
- `/new` → 폼 정상 (POST는 불필요 — 로직 무변경)
- `/r/BAJnsFMKrF` → backlink가 `/new`로
- 브라우저 실화면 스크린샷 1회

- [ ] **Step 4: 핸드오프 문서 갱신 + 커밋**

`docs/handoff-2026-07-05-v1-live.md` "이번 세션 구현" 아래 추가:

```markdown
### 랜딩 페이지 (/ ↔ /new 분리)
- /는 신문 1면 정적 랜딩("가짜 90명" 헤드라인 + 예시 카드 + 3단계 + 정직 면책), 폼·갤러리는 /new로 이동
- 스펙: docs/superpowers/specs/2026-07-05-landing-page-design.md
- 디자인 스킬 3종 설치됨(~/.claude/skills): frontend-design, web-design-guidelines, impeccable-design-polish (출처: nexu-io/open-design, 검토 후 선별 설치)
```

```bash
git add docs/handoff-2026-07-05-v1-live.md
git commit -m "docs: note landing page + design skills in handoff

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
