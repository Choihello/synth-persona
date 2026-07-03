# Live Inference Readiness (실측 준비 + B1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** `--source census`에 실제 Claude를 붙일 수 있게 simulate 동시성·재시도, 구조화 선택 응답(tool use), CLI 안전장치를 갖춘 뒤, B1 실측(n=30)으로 "신호가 유의미한가"를 냉정 평가한다.

**Architecture:** `simulate`에 순서 보존 워커풀 + 지수 백오프 재시도를 추가(기본값은 기존 동작과 동일). `LLMProvider`에 옵셔널 `askChoice`를 추가해 ClaudeProvider가 tool use(`strict: true`, enum 강제)로 선택지를 구조화 반환 — `matchChoice` 부분문자열 취약성을 실측 경로에서 제거. CLI는 seed 검증·진행 표시·소표본 ⚪ 표시·토큰 사용량 출력을 얻는다.

**Tech Stack:** TypeScript(ESM), vitest, `@anthropic-ai/sdk`(기존 단일 런타임 의존성 — 추가 없음).

## Global Constraints

- 테스트·CI는 **키 없이** 그린 (fake client/mock만 사용, 실 API 호출 금지).
- 런타임 의존성 추가 금지 (`@anthropic-ai/sdk` 단일 유지).
- `src/types.ts`·`src/aggregate/uncertainty.ts` 수정 금지. (`src/llm/provider.ts`의 옵셔널 메서드 추가는 허용 — 기존 구현체는 변경 없이 호환.)
- 기본값 보존: `simulate` 기본 `concurrency=1`이면 기존 결과와 완전 동일(결정성 유지). 응답 배열은 항상 **persona 입력 순서**로 반환(동시성과 무관).
- 기본 모델은 `claude-haiku-4-5-20251001`(기존 코드 유지 — 비용 우선, 사용자 결정). 참고 단가(2026-06 기준): Haiku 4.5 입력 $1/M · 출력 $5/M 토큰.
- SDK는 429/5xx를 자체 재시도(기본 2회)함 — simulate 레벨 재시도는 그 위의 보조 레이어(기본 1회).
- 각 태스크 완료 시 `npm test` + `npm run lint` + `npx tsc --noEmit` 그린 후 커밋.
- 선행: Plan `2026-07-03-founder-report-p4-2-3.md` 완료 후 진행 권장 (충돌 파일은 없어 병행도 가능).

---

### Task 1: simulate 동시성 + 재시도 (순서 보존 워커풀)

**Files:**
- Modify: `src/simulate/simulate.ts`
- Test: `src/simulate/simulate.test.ts` (추가)

**Interfaces:**
- Consumes: 기존 `LLMProvider.ask`, `matchChoice`, `buildPrompt`
- Produces: `simulate(personas, question, provider, opts?: SimulateOpts)` — `SimulateOpts = { concurrency?; retries?; backoffMs?; onProgress? }`. 4번째 인자 생략 시 기존 시그니처/동작과 100% 호환. Task 2가 `withRetry` 헬퍼를 재사용, Task 4 CLI가 `SimulateOpts`를 전달.

- [x] **Step 1: 실패하는 테스트 추가**

```ts
// src/simulate/simulate.test.ts 에 추가
import type { Persona } from "../types.js";

function personas(n: number): Persona[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    attrs: { age: "20대" },
    weight: 1,
  }));
}

describe("simulate — 동시성/재시도", () => {
  const question = { prompt: "q?", choices: ["A", "B"] };

  it("동시 실행 수가 concurrency를 넘지 않는다", async () => {
    let active = 0;
    let maxActive = 0;
    const provider = {
      async ask() {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return "A";
      },
    };
    await simulate(personas(12), question, provider, { concurrency: 3 });
    expect(maxActive).toBeLessThanOrEqual(3);
    expect(maxActive).toBeGreaterThan(1); // 실제로 병렬이었는지
  });

  it("완료 순서와 무관하게 responses는 persona 입력 순서", async () => {
    const provider = {
      async ask(p: Persona) {
        // 뒤쪽 persona일수록 먼저 끝나게 역순 지연
        const idx = Number(p.id.slice(1));
        await new Promise((r) => setTimeout(r, (12 - idx) * 2));
        return "A";
      },
    };
    const { responses } = await simulate(personas(12), question, provider, {
      concurrency: 4,
    });
    expect(responses.map((r) => r.persona.id)).toEqual(
      personas(12).map((p) => p.id),
    );
  });

  it("일시 오류는 재시도로 회복한다 (backoffMs=0)", async () => {
    const failedOnce = new Set<string>();
    let calls = 0;
    const provider = {
      async ask(p: Persona) {
        calls++;
        if (!failedOnce.has(p.id)) {
          failedOnce.add(p.id);
          throw new Error("429 rate limited");
        }
        return "A";
      },
    };
    const { responses, missing } = await simulate(
      personas(5),
      question,
      provider,
      { retries: 1, backoffMs: 0 },
    );
    expect(missing).toEqual([]);
    expect(responses).toHaveLength(5);
    expect(calls).toBe(10); // 5회 실패 + 5회 성공
  });

  it("재시도 소진 시 missing으로 남는다", async () => {
    const provider = {
      async ask() {
        throw new Error("terminal error");
      },
    };
    const { responses, missing } = await simulate(
      personas(3),
      question,
      provider,
      { retries: 1, backoffMs: 0 },
    );
    expect(responses).toEqual([]);
    expect(missing).toHaveLength(3);
  });

  it("onProgress가 완료 건수를 보고한다", async () => {
    const seen: number[] = [];
    const provider = { async ask() { return "A"; } };
    await simulate(personas(4), question, provider, {
      onProgress: (done, total) => seen.push(done * 100 + total),
    });
    expect(seen).toHaveLength(4);
    expect(seen[seen.length - 1]).toBe(404); // done=4, total=4
  });
});
```

- [x] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/simulate/simulate.test.ts`
Expected: FAIL — simulate가 4번째 인자를 받지 않음 (opts 무시로 concurrency 테스트 실패)

- [x] **Step 3: 구현 — simulate.ts의 simulate 함수 교체**

```ts
// src/simulate/simulate.ts — buildPrompt/matchChoice는 그대로 두고 아래 추가/교체

export interface SimulateOpts {
  /** 동시 LLM 호출 수. 기본 1 = 기존 순차 동작과 동일(결정성 보존). */
  concurrency?: number;
  /** simulate 레벨 재시도 횟수. SDK 자체 재시도(429/5xx, 2회) 위의 보조 레이어. 기본 1. */
  retries?: number;
  /** 지수 백오프 기본 간격(ms). 테스트에서 0으로 주입. 기본 500. */
  backoffMs?: number;
  onProgress?: (done: number, total: number) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  backoffMs: number,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(backoffMs * 2 ** attempt);
    }
  }
  throw lastErr;
}

export async function simulate(
  personas: Persona[],
  question: Question,
  provider: LLMProvider,
  opts?: SimulateOpts,
): Promise<{
  responses: Response[];
  missing: { personaId: string; reason: string }[];
}> {
  const prompt = buildPrompt(question);
  const concurrency = Math.max(1, opts?.concurrency ?? 1);
  const retries = opts?.retries ?? 1;
  const backoffMs = opts?.backoffMs ?? 500;

  type Slot =
    | { ok: true; res: Response }
    | { ok: false; miss: { personaId: string; reason: string } };
  const slots: Slot[] = new Array(personas.length);
  let next = 0;
  let done = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const i = next++;
      if (i >= personas.length) return;
      const persona = personas[i];
      try {
        const answer = await withRetry(
          () => provider.ask(persona, prompt),
          retries,
          backoffMs,
        );
        const choice = question.choices
          ? matchChoice(answer, question.choices)
          : undefined;
        slots[i] = { ok: true, res: { persona, answer, choice } };
      } catch (e) {
        slots[i] = {
          ok: false,
          miss: {
            personaId: persona.id,
            reason: e instanceof Error ? e.message : String(e),
          },
        };
      }
      done++;
      opts?.onProgress?.(done, personas.length);
    }
  };

  const workers = Math.min(concurrency, Math.max(personas.length, 1));
  await Promise.all(Array.from({ length: workers }, worker));

  const responses: Response[] = [];
  const missing: { personaId: string; reason: string }[] = [];
  for (const s of slots) {
    if (s.ok) responses.push(s.res);
    else missing.push(s.miss);
  }
  return { responses, missing };
}
```

주의: 재시도 기본값이 1이 되면서 기존 "실패→missing" 테스트가 있다면 provider가 **항상** 실패하는지 확인 (한 번만 실패하는 mock이면 이제 회복됨). 기존 테스트가 깨지면 해당 mock을 항상-실패로 유지한 채 통과 확인.

- [x] **Step 4: 테스트 통과 + 회귀 확인**

Run: `npm test`
Expected: 신규 5개 포함 전체 PASS (기존 simulate/study/데모 테스트 결과 불변 — 기본 concurrency=1)

- [x] **Step 5: 전체 게이트 + 커밋**

```bash
npm run lint && npx tsc --noEmit
git add src/simulate/simulate.ts src/simulate/simulate.test.ts
git commit -m "feat(simulate): order-preserving worker pool with retry/backoff"
```

---

### Task 2: LLMProvider.askChoice — 구조화 선택 경로

**Files:**
- Modify: `src/llm/provider.ts`
- Modify: `src/simulate/simulate.ts` (askChoice 분기)
- Modify: `src/study.ts` + `src/index.ts` (SimulateOpts 스레딩·export)
- Test: `src/simulate/simulate.test.ts` (추가)

**Interfaces:**
- Consumes: Task 1의 `withRetry`, `SimulateOpts`
- Produces:
  - `ChoiceReply = { choice: string; reason?: string }`
  - `LLMProvider.askChoice?(persona, prompt, choices): Promise<ChoiceReply>` — **옵셔널**. 미구현 provider(Mock/Recorded/Logging)는 기존 `ask`+`matchChoice` 폴백으로 그대로 동작.
  - simulate: askChoice 경로에서 `Response.choice = reply.choice`(검증됨), `Response.answer = reply.reason ?? reply.choice`
  - `StudyConfig.simulate?: SimulateOpts` / `CensusStudyConfig.simulate?: SimulateOpts` — Task 4 CLI가 사용

- [x] **Step 1: 실패하는 테스트 추가**

```ts
// src/simulate/simulate.test.ts 에 추가
describe("simulate — askChoice 구조화 경로", () => {
  const question = { prompt: "q?", choices: ["쓴다", "안쓴다"] };
  const ps = personas(2);

  it("askChoice가 있으면 choice를 직접 쓰고 reason이 answer가 된다", async () => {
    const provider = {
      async ask() { return "unused"; },
      async askChoice() {
        // reason에 다른 선택지 부분문자열("쓴다")이 있어도 오염되지 않아야 함
        return { choice: "안쓴다", reason: "지금도 쓴다고 하기엔 비싸서" };
      },
    };
    const { responses } = await simulate(ps, question, provider);
    expect(responses[0].choice).toBe("안쓴다");
    expect(responses[0].answer).toBe("지금도 쓴다고 하기엔 비싸서");
  });

  it("askChoice가 choices 밖의 값을 반환하면 missing 처리", async () => {
    const provider = {
      async ask() { return "unused"; },
      async askChoice() { return { choice: "몰라요" }; },
    };
    const { responses, missing } = await simulate(ps, question, provider, {
      retries: 0,
    });
    expect(responses).toEqual([]);
    expect(missing).toHaveLength(2);
    expect(missing[0].reason).toContain("choices에 없습니다");
  });

  it("자유응답 질문(choices 없음)에서는 askChoice를 쓰지 않는다", async () => {
    let choiceCalls = 0;
    const provider = {
      async ask() { return "자유 응답"; },
      async askChoice() { choiceCalls++; return { choice: "X" }; },
    };
    const { responses } = await simulate(ps, { prompt: "q?" }, provider);
    expect(choiceCalls).toBe(0);
    expect(responses[0].answer).toBe("자유 응답");
  });
});
```

- [x] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/simulate/simulate.test.ts`
Expected: FAIL — askChoice가 무시되어 choice가 matchChoice 결과("쓴다" 오매칭 가능성)로 나옴

- [x] **Step 3: 구현**

`src/llm/provider.ts`:

```ts
import type { Persona } from "../types.js";

export interface ChoiceReply {
  choice: string;
  /** 그 선택을 한 이유 (한두 문장). B3(진단→처방)에서 free-text 근거로 활용. */
  reason?: string;
}

export interface LLMProvider {
  ask(persona: Persona, prompt: string): Promise<string>;
  /**
   * 구조화 선택 경로(옵셔널). choices 중 하나를 강제 반환해
   * matchChoice 부분문자열 매칭의 오매칭/미매칭을 제거한다.
   * 미구현 provider는 simulate가 ask+matchChoice로 폴백.
   */
  askChoice?(
    persona: Persona,
    prompt: string,
    choices: string[],
  ): Promise<ChoiceReply>;
}
```

`src/simulate/simulate.ts` — worker의 try 블록을 교체:

```ts
      try {
        if (question.choices && provider.askChoice) {
          const choices = question.choices;
          const reply = await withRetry(
            () => provider.askChoice!(persona, prompt, choices),
            retries,
            backoffMs,
          );
          if (!choices.includes(reply.choice)) {
            throw new Error(
              `구조화 응답의 choice "${reply.choice}"가 choices에 없습니다: [${choices.join(", ")}]`,
            );
          }
          slots[i] = {
            ok: true,
            res: {
              persona,
              answer: reply.reason ?? reply.choice,
              choice: reply.choice,
            },
          };
        } else {
          const answer = await withRetry(
            () => provider.ask(persona, prompt),
            retries,
            backoffMs,
          );
          const choice = question.choices
            ? matchChoice(answer, question.choices)
            : undefined;
          slots[i] = { ok: true, res: { persona, answer, choice } };
        }
      } catch (e) {
```

`src/study.ts` — 두 config에 `simulate?: SimulateOpts` 추가 후 전달:

```ts
import { type SimulateOpts, type Question, simulate } from "./simulate/simulate.js";

export interface StudyConfig {
  // ...기존 필드...
  simulate?: SimulateOpts;
}
// runStudy 내부:
  const { responses, missing } = await simulate(
    personas,
    config.question,
    config.provider,
    config.simulate,
  );
// CensusStudyConfig / runCensusStudy 동일하게.
```

`src/index.ts` export 추가:

```ts
export type { ChoiceReply } from "./llm/provider.js";
export { withRetry, type SimulateOpts } from "./simulate/simulate.js";
```

- [x] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 전체 PASS (Mock/Recorded/Logging provider는 askChoice 미구현 → 폴백 경로, 기존 결과 불변)

- [x] **Step 5: 전체 게이트 + 커밋**

```bash
npm run lint && npx tsc --noEmit
git add src/llm/provider.ts src/simulate/simulate.ts src/study.ts src/index.ts src/simulate/simulate.test.ts
git commit -m "feat(llm): optional askChoice structured-choice path in provider contract"
```

---

### Task 3: ClaudeProvider.askChoice (tool use 강제) + usage 집계

**Files:**
- Modify: `src/llm/claude.ts`
- Test: `src/llm/claude.test.ts` (추가)

**Interfaces:**
- Consumes: Task 2의 `ChoiceReply`
- Produces:
  - `ClaudeProvider.askChoice(persona, prompt, choices): Promise<ChoiceReply>` — tool use `strict: true` + `enum` + `tool_choice: {type:"tool"}` 로 선택지 강제
  - `ClaudeProvider.usage: { calls: number; inputTokens: number; outputTokens: number }` — 누적 사용량 (Task 4 CLI가 출력)

- [x] **Step 1: 실패하는 테스트 추가**

```ts
// src/llm/claude.test.ts 에 추가 (기존 fake client 패턴 활용)
describe("ClaudeProvider.askChoice", () => {
  const persona = { id: "p1", attrs: { 연령: "25~29세" }, weight: 1 };

  function fakeClient(captured: unknown[]) {
    return {
      messages: {
        create: async (args: unknown) => {
          captured.push(args);
          return {
            content: [
              {
                type: "tool_use",
                input: { choice: "안쓴다", reason: "가격이 부담돼서" },
              },
            ],
            usage: { input_tokens: 100, output_tokens: 20 },
          };
        },
      },
    };
  }

  it("tool_choice로 강제하고 enum에 choices를 넣는다", async () => {
    const captured: unknown[] = [];
    const p = new ClaudeProvider({ client: fakeClient(captured) });
    const reply = await p.askChoice(persona, "q?", ["쓴다", "안쓴다"]);
    expect(reply).toEqual({ choice: "안쓴다", reason: "가격이 부담돼서" });

    const req = captured[0] as {
      tools: Array<{ strict: boolean; input_schema: { properties: { choice: { enum: string[] } } } }>;
      tool_choice: { type: string; name: string };
    };
    expect(req.tool_choice).toEqual({ type: "tool", name: "answer" });
    expect(req.tools[0].strict).toBe(true);
    expect(req.tools[0].input_schema.properties.choice.enum).toEqual([
      "쓴다",
      "안쓴다",
    ]);
  });

  it("usage를 ask/askChoice에 걸쳐 누적한다", async () => {
    const p = new ClaudeProvider({ client: fakeClient([]) });
    await p.askChoice(persona, "q?", ["쓴다", "안쓴다"]);
    await p.askChoice(persona, "q?", ["쓴다", "안쓴다"]);
    expect(p.usage).toEqual({ calls: 2, inputTokens: 200, outputTokens: 40 });
  });

  it("tool_use 블록이 없으면 명확한 에러", async () => {
    const broken = {
      messages: {
        create: async () => ({ content: [{ type: "text", text: "그냥 텍스트" }] }),
      },
    };
    const p = new ClaudeProvider({ client: broken });
    await expect(
      p.askChoice(persona, "q?", ["쓴다", "안쓴다"]),
    ).rejects.toThrow(/tool_use/);
  });
});
```

- [x] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/llm/claude.test.ts`
Expected: FAIL — `askChoice is not a function`

- [x] **Step 3: 구현 — claude.ts 수정**

```ts
// src/llm/claude.ts — MessagesClient 확장 + askChoice/usage 추가
import type { ChoiceReply, LLMProvider } from "./provider.js";

interface MessagesClient {
  messages: {
    create: (args: unknown) => Promise<{
      content: Array<{ type: string; text?: string; input?: unknown }>;
      usage?: { input_tokens: number; output_tokens: number };
    }>;
  };
}

export interface ProviderUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export class ClaudeProvider implements LLMProvider {
  private client: MessagesClient;
  private model: string;
  /** 누적 토큰 사용량. Haiku 4.5 기준 단가: 입력 $1/M · 출력 $5/M (2026-06). */
  readonly usage: ProviderUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };

  // constructor는 기존 그대로

  private track(res: {
    usage?: { input_tokens: number; output_tokens: number };
  }): void {
    this.usage.calls++;
    this.usage.inputTokens += res.usage?.input_tokens ?? 0;
    this.usage.outputTokens += res.usage?.output_tokens ?? 0;
  }

  async ask(persona: Persona, prompt: string): Promise<string> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system: personaSystemPrompt(persona),
      messages: [{ role: "user", content: prompt }],
    });
    this.track(res);
    const text = res.content.find((c) => c.type === "text")?.text ?? "";
    return text.trim();
  }

  /**
   * tool use로 선택지를 강제한다: strict + enum + tool_choice.
   * reason도 함께 받아 Response.answer로 보존 → B3(처방 근거)에서 활용.
   */
  async askChoice(
    persona: Persona,
    prompt: string,
    choices: string[],
  ): Promise<ChoiceReply> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 256,
      system: personaSystemPrompt(persona),
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          name: "answer",
          description:
            "제시된 선택지 중 정확히 하나를 고르고, 이 속성 조합의 개인 입장에서 그 이유를 한두 문장으로 남긴다.",
          strict: true,
          input_schema: {
            type: "object",
            properties: {
              choice: { type: "string", enum: choices },
              reason: {
                type: "string",
                description: "이 선택을 한 이유 (한두 문장, 이 사람의 입장에서)",
              },
            },
            required: ["choice", "reason"],
            additionalProperties: false,
          },
        },
      ],
      tool_choice: { type: "tool", name: "answer" },
    });
    this.track(res);
    const tu = res.content.find((c) => c.type === "tool_use");
    const input = tu?.input as { choice?: string; reason?: string } | undefined;
    if (!input?.choice) {
      throw new Error(
        "구조화 응답에 tool_use 블록/choice가 없습니다 — 모델 응답 형식을 확인하세요.",
      );
    }
    return { choice: input.choice, reason: input.reason };
  }
}
```

`src/index.ts`에 `export type { ProviderUsage } from "./llm/claude.js";` 추가.

- [x] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 전체 PASS (키 없이 — fake client만 사용)

- [x] **Step 5: 전체 게이트 + 커밋**

```bash
npm run lint && npx tsc --noEmit && npm run build
git add src/llm/claude.ts src/llm/claude.test.ts src/index.ts
git commit -m "feat(llm): ClaudeProvider structured askChoice via forced tool use + usage tracking"
```

---

### Task 4: CLI 안전장치 — seed 검증·동시성·진행 표시·소표본 ⚪·사용량

**Files:**
- Modify: `cli/main.ts`
- Test: `src/cli.test.ts` (추가)
- Modify: `README.md` (CLI 옵션 표)

**Interfaces:**
- Consumes: Task 1~3의 `SimulateOpts`, `StudyConfig.simulate`, `ClaudeProvider.usage`
- Produces: `parseSeed(raw): number` export, `formatResult(result, opts?: { minN?: number })` 시그니처 확장, CLI 플래그 `--concurrency`(기본 4, 실측 경로에만 의미)

- [x] **Step 1: 실패하는 테스트 추가**

```ts
// src/cli.test.ts 에 추가
import { formatResult, parseSeed } from "../cli/main.js"; // 기존 import 경로 관례를 따를 것

describe("parseSeed", () => {
  it("정수를 파싱한다", () => {
    expect(parseSeed("7")).toBe(7);
  });
  it("숫자가 아니면 명확히 실패한다 (NaN 조용히 통과 금지)", () => {
    expect(() => parseSeed("abc")).toThrow(/--seed/);
    expect(() => parseSeed("1.5")).toThrow(/--seed/);
  });
});

describe("formatResult — 소표본 세그먼트", () => {
  it("n<minN 세그먼트는 ⚪ + n 표기로 판단 보류 처리", () => {
    const result = {
      responses: [
        { persona: { id: "p1", attrs: { 연령: "20대" }, weight: 1 }, answer: "쓴다", choice: "쓴다" },
        { persona: { id: "p2", attrs: { 연령: "20대" }, weight: 1 }, answer: "쓴다", choice: "쓴다" },
      ],
      signal: "consensus" as const,
      dispersion: 0,
      bySegment: {
        연령: { "20대": { signal: "consensus" as const, breakdown: { 쓴다: 2 } } },
      },
    };
    const out = formatResult(result, { minN: 8 });
    expect(out).toContain("⚪");
    expect(out).toContain("(n=2)");
    expect(out).toContain("판단 보류");
  });
});
```

- [x] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/cli.test.ts`
Expected: FAIL — `parseSeed` 미존재

- [x] **Step 3: 구현 — cli/main.ts 수정**

`parseSeed` 추가 (`parseN` 아래):

```ts
export function parseSeed(raw: string): number {
  const s = Number(raw);
  if (!Number.isFinite(s) || !Number.isInteger(s)) {
    throw new Error(`--seed 는 정수여야 합니다 (입력: "${raw}"). 예: --seed 7`);
  }
  return s;
}
```

`formatResult` 세그먼트 루프 교체 (시그니처에 `opts?: { minN?: number }` 추가):

```ts
export function formatResult(
  result: StudyResult,
  opts?: { minN?: number },
): string {
  const minN = opts?.minN ?? 8;
  // ...기존 코드 유지, 세그먼트 루프만 교체:
  for (const [dim, segs] of Object.entries(result.bySegment)) {
    lines.push(`\n[${dim}별]`);
    for (const [val, s] of Object.entries(segs)) {
      const n = Object.values(s.breakdown).reduce((a, b) => a + b, 0);
      const bd = Object.entries(s.breakdown)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      if (n < minN) {
        lines.push(`  ⚪ ${val} (n=${n}): ${bd} — 표본 부족, 판단 보류`);
      } else {
        lines.push(`  ${dot(s.signal)} ${val} (n=${n}): ${bd}`);
      }
    }
  }
```

`main()` 수정:

```ts
  // parseArgs options에 추가:
      concurrency: { type: "string", default: "4" },

  // seed 파싱 교체:
  const seed = values.seed ? parseSeed(values.seed) : undefined;
  const concurrency = parseN(values.concurrency ?? "4");

  // provider 생성 아래에 simulate opts 구성:
  const isLive = !values.mock;
  const simulateOpts = {
    concurrency: isLive ? concurrency : 1, // mock은 순차(결정성·기존 데모 출력 보존)
    onProgress: isLive
      ? (done: number, total: number) => {
          process.stderr.write(`\r응답 수집 중 ${done}/${total}`);
          if (done === total) process.stderr.write("\n");
        }
      : undefined,
  };

  // runCensusStudy/runStudy 호출에 simulate: simulateOpts 추가:
    result = await runCensusStudy({ population, provider, question, n, seed, simulate: simulateOpts });
    // ... runStudy도 동일

  // 출력 직후 usage 요약 (ClaudeProvider일 때만):
  console.log(formatResult(result));
  if (provider instanceof ClaudeProvider && provider.usage.calls > 0) {
    const u = provider.usage;
    console.error(
      `\n토큰 사용: 입력 ${u.inputTokens.toLocaleString()} · 출력 ${u.outputTokens.toLocaleString()} (${u.calls}회 호출) — 단가는 콘솔 요금표 확인`,
    );
  }
```

README CLI 옵션 표에 행 추가:

```markdown
| `--concurrency` | 실측(비-mock) 시 동시 LLM 호출 수 | 4 |
```

`--seed` 행의 설명을 "재현용 시드 (정수)"로 갱신.

- [x] **Step 4: 테스트 + 실제 CLI 실행 확인 (실행·관찰)**

```bash
npm test && npm run build
node dist/cli/main.js --question "A안 vs B안?" --choices "A안,B안" --n 40 --mock
node dist/cli/main.js --question "q?" --choices "A,B" --n 10 --seed abc --mock  # 에러 메시지 확인
```

Expected: mock 출력에 세그먼트 `(n=X)` 표기와 소표본 ⚪ 표시. seed abc → 친절한 에러로 종료. 기존 README 데모와 숫자 동일(순차 mock 경로 보존).

- [x] **Step 5: 전체 게이트 + 커밋**

```bash
npm run lint && npx tsc --noEmit
git add cli/main.ts src/cli.test.ts README.md
git commit -m "feat(cli): seed validation, concurrency flag, progress, small-sample hold marker, usage summary"
```

---

### Task 5: B1 실측 런북 (수동 절차 — 코드 변경 없음)

**Files:**
- Create: `docs/b1-live-notes-2026-07-XX.md` (실행 당일 날짜로, 아래 템플릿 사용)

**선결조건:** `.env`에 실제 `ANTHROPIC_API_KEY`. 예상 비용: n=30 × (입력 ~600tok + 출력 ~100tok) ≈ 입력 18K·출력 3K 토큰 → **Haiku 4.5 기준 약 $0.03** (질문 4종 반복해도 $1 미만).

- [ ] **Step 1: 빌드 + 키 확인**

```bash
npm run build
node --env-file=.env -e "console.log(process.env.ANTHROPIC_API_KEY ? 'key ok' : 'key MISSING')"
```

Expected: `key ok`

- [ ] **Step 2: 첫 실측 (n=30, census)**

```bash
node --env-file=.env dist/cli/main.js --question "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?" --choices "쓴다,안쓴다" --n 30 --seed 7 --source census --concurrency 4
```

기록: 전체 신호, 첫 선택지 비율, 세그먼트별 결과, 소요 시간, 토큰 사용량.

- [ ] **Step 3: 예스맨/순서 편향 점검 — 선택지 순서 뒤집기**

```bash
node --env-file=.env dist/cli/main.js --question "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?" --choices "안쓴다,쓴다" --n 30 --seed 7 --source census --concurrency 4
```

판정: Step 2와 "쓴다" 비율 차이가 ±15%p 이내면 순서 편향 통과. 두 실행 모두에서 **첫 선택지** 비율이 85% 이상이면 예스맨 의심 🔴.

- [ ] **Step 4: 도메인 상이한 질문 2종 반복**

```bash
node --env-file=.env dist/cli/main.js --question "구독형 전기차 배터리 교체 서비스, 월 5만원에 쓸 의향?" --choices "쓴다,안쓴다" --n 30 --seed 7 --source census --concurrency 4
node --env-file=.env dist/cli/main.js --question "동네 반찬가게 정기배달, 주 2회 3만원에 쓸 의향?" --choices "쓴다,안쓴다" --n 30 --seed 7 --source census --concurrency 4
```

판정: 세 질문의 응답 분포가 서로 달라야 함(전부 비슷하면 평균회귀/무차별 🔴). 세그먼트(연령·혼인·가구원수) 간 차이가 상식과 결이 맞는지 눈으로 평가.

- [ ] **Step 5: 결과 기록 — `docs/b1-live-notes-2026-07-XX.md` 작성**

```markdown
# B1 실측 노트 (YYYY-MM-DD)

## 환경
- 모델: claude-haiku-4-5-20251001 · n=30 · seed=7 · --source census · concurrency 4

> ⚠️ 집계 기준: askChoice(구조화) 경로에서는 선택지 비매칭·tool_use 미반환 응답이 **missing**으로 빠진다.
> 구 ask+matchChoice 경로는 이런 응답을 choice=undefined인 채 responses(n의 분모)에 남겼으므로,
> 과거 기록과 n·missing rate를 직접 비교하지 말 것. missing rate가 높으면 응답 품질 신호로 해석.

## 실행 결과
| 질문 | 신호 | 긍정 비율 | 순서 뒤집기 후 긍정 비율 | 토큰(입력/출력) | 시간 |
|---|---|---|---|---|---|
| 새벽배송 9900원 | | | | | |
| EV 배터리 5만원 | | | | | |
| 반찬 정기배달 3만원 | | | | | |

## 판정 체크리스트
- [ ] 예스맨: 첫 선택지 비율 85% 미만 (양방향)
- [ ] 순서 편향: 뒤집기 전후 차이 ±15%p 이내
- [ ] 질문 간 분포가 유의미하게 다름 (평균회귀 아님)
- [ ] 세그먼트 결이 상식과 부합 (예: 1인가구·2030에서 새벽배송 긍정 우세)
- [ ] reason(구조화 응답의 이유)이 페르소나 속성을 반영하는가 — LoggingProvider로 raw 확인 가능

## go/no-go
- 판정: (go → 묶음 B2 3층 실측 진행 / no-go → 프롬프트·모델 조정 이슈 생성)
- 근거:
```

- [ ] **Step 6: 커밋**

```bash
git add docs/b1-live-notes-*.md
git commit -m "docs: B1 live inference evaluation notes"
```

**후속 (이 플랜 범위 밖, 기록만):**
- n을 100+로 키울 때는 **Message Batches API**(50% 할인, `client.messages.batches.create`) 도입 검토 — provider에 batch 경로 추가.
- go 판정 시: B2(3층 실측 — `censusShareRunner`로 robustness/probes 배선), B3(진단→처방 LLM v2, issue #4).

---

## 완료 기준

- [ ] simulate: 동시성·재시도·순서 보존·진행 콜백 (기본값에서 기존 동작 100% 보존) ⚠️ retries 기본값 1 — 기본 경로 동작 변화, 리뷰 C1 참조
- [x] ClaudeProvider: tool use 강제 선택 + reason 보존 + usage 누적 — matchChoice는 폴백으로만
- [x] CLI: seed 검증 · `--concurrency` · 진행 표시 · 세그먼트 (n=X)/⚪ · 토큰 요약
- [ ] B1 노트 작성 + go/no-go 판정
- [x] 전 과정 `npm test`/`lint`/`tsc`/`build` 그린, 테스트는 키 없이 통과 (2026-07-04, 189 tests)
