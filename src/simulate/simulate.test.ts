import { describe, expect, it, test } from "vitest";
import { MockProvider } from "../llm/mock.js";
import type { Persona } from "../types.js";
import { buildPrompt, matchChoice, simulate } from "./simulate.js";

const twoPersonas = [
  { id: "1", attrs: { age: "20대" }, weight: 1 },
  { id: "2", attrs: { age: "40대" }, weight: 1 },
];

describe("simulate", () => {
  test("matchChoice는 답변에 포함된 선택지를 찾는다", () => {
    expect(
      matchChoice("저는 새벽배송이 더 좋아요", ["새벽배송", "저녁배송"]),
    ).toBe("새벽배송");
    expect(matchChoice("모르겠음", ["A", "B"])).toBeUndefined();
  });

  test("한 선택지가 다른 선택지의 부분문자열이어도 정확히 매칭한다", () => {
    // "안쓴다"는 "쓴다"를 부분문자열로 포함 → 가장 긴(구체적) 매치를 골라야 함
    expect(matchChoice("안쓴다", ["쓴다", "안쓴다"])).toBe("안쓴다");
    expect(matchChoice("저는 안쓴다고 봐요", ["쓴다", "안쓴다"])).toBe(
      "안쓴다",
    );
    expect(matchChoice("쓴다", ["쓴다", "안쓴다"])).toBe("쓴다");
  });

  test("각 페르소나에 대해 응답과 choice를 만든다", async () => {
    const provider = new MockProvider((p) =>
      p.attrs.age === "20대" ? "새벽배송 좋아요" : "저녁배송 좋아요",
    );
    const { responses, missing } = await simulate(
      twoPersonas,
      { prompt: "q", choices: ["새벽배송", "저녁배송"] },
      provider,
    );
    expect(missing).toHaveLength(0);
    expect(responses[0].choice).toBe("새벽배송");
    expect(responses[1].choice).toBe("저녁배송");
  });

  test("choices가 있으면 프롬프트에 선택지 전체 + '정확히 하나' 지시가 합성된다", async () => {
    let captured = "";
    const provider = new MockProvider((_p, prompt) => {
      captured = prompt;
      return "쓴다";
    });
    await simulate(
      [{ id: "1", attrs: {}, weight: 1 }],
      { prompt: "월 9900원에 쓸 의향?", choices: ["쓴다", "안쓴다"] },
      provider,
    );
    expect(captured).toContain("월 9900원에 쓸 의향?");
    expect(captured).toContain("쓴다");
    expect(captured).toContain("안쓴다");
    expect(captured).toMatch(/정확히 하나/);
  });

  test("choices가 없으면 프롬프트가 변형되지 않는다(자유응답)", async () => {
    let captured = "";
    const provider = new MockProvider((_p, prompt) => {
      captured = prompt;
      return "자유응답";
    });
    await simulate(
      [{ id: "1", attrs: {}, weight: 1 }],
      { prompt: "어떻게 생각해?" },
      provider,
    );
    expect(captured).toBe("어떻게 생각해?");
  });

  test("buildPrompt: choices 없으면 원본 그대로", () => {
    expect(buildPrompt({ prompt: "Q" })).toBe("Q");
    expect(buildPrompt({ prompt: "Q", choices: [] })).toBe("Q");
  });

  test("개별 응답 실패는 missing에 기록되고 중단되지 않는다", async () => {
    const provider = new MockProvider((p) => {
      if (p.id === "1") throw new Error("rate limit");
      return "저녁배송";
    });
    const { responses, missing } = await simulate(
      twoPersonas,
      { prompt: "q", choices: ["새벽배송", "저녁배송"] },
      provider,
    );
    expect(responses).toHaveLength(1);
    expect(missing[0]).toMatchObject({
      personaId: "1",
      reason: expect.stringContaining("rate limit"),
    });
  });
});

describe("matchChoice 자연어/다지선다 robustness", () => {
  const two = ["쓸 의향이 있다", "쓸 의향이 없다"];
  const three = ["써보고 싶다", "잘 모르겠다", "쓰지 않을 것 같다"];

  test("자연어 문장에 선택지가 그대로 들어가면 2지선다 매칭", () => {
    expect(matchChoice("네, 저는 쓸 의향이 있다고 생각해요", two)).toBe(
      "쓸 의향이 있다",
    );
    expect(matchChoice("솔직히 쓸 의향이 없다 쪽이에요", two)).toBe(
      "쓸 의향이 없다",
    );
  });

  test("부분문자열 공유 선택지에서 더 구체적인(긴) 것을 고른다", () => {
    // '쓸 의향이 있다'/'쓸 의향이 없다'는 '쓸 의향이' 공유 → 긴 매치 우선
    expect(matchChoice("쓸 의향이 없다", two)).toBe("쓸 의향이 없다");
  });

  test("3지선다 매칭", () => {
    expect(matchChoice("한번 써보고 싶다", three)).toBe("써보고 싶다");
    expect(matchChoice("음 잘 모르겠다", three)).toBe("잘 모르겠다");
    expect(matchChoice("아마 쓰지 않을 것 같다", three)).toBe(
      "쓰지 않을 것 같다",
    );
  });

  test("선택지 문구를 그대로 포함하지 않으면 미매칭(undefined → missing 처리)", () => {
    // 어미가 달라지면(있다 vs 있습니다) 부분문자열로 안 잡힘 → missing으로 집계됨
    expect(matchChoice("쓸 의향이 있습니다", two)).toBeUndefined();
    expect(matchChoice("잘 모르겠어요", three)).toBeUndefined();
  });
});

describe("simulate — askChoice 구조화 경로", () => {
  const question = { prompt: "q?", choices: ["쓴다", "안쓴다"] };
  const ps = personas(2);

  it("askChoice가 있으면 choice를 직접 쓰고 reason이 answer가 된다", async () => {
    const provider = {
      async ask() {
        return "unused";
      },
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
      async ask() {
        return "unused";
      },
      async askChoice() {
        return { choice: "몰라요" };
      },
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
      async ask() {
        return "자유 응답";
      },
      async askChoice() {
        choiceCalls++;
        return { choice: "X" };
      },
    };
    const { responses } = await simulate(ps, { prompt: "q?" }, provider);
    expect(choiceCalls).toBe(0);
    expect(responses[0].answer).toBe("자유 응답");
  });
});

function personas(n: number): Persona[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    attrs: { age: "20대" },
    weight: 1,
  }));
}

describe("simulate — 동시성/재시도", () => {
  const question = { prompt: "q?", choices: ["A", "B"] };

  test("동시 실행 수가 concurrency를 넘지 않는다", async () => {
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

  test("완료 순서와 무관하게 responses는 persona 입력 순서", async () => {
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

  test("counterbalance: 페르소나 절반은 선택지 역순으로 받는다 (askChoice 경로)", async () => {
    const seenOrders: string[][] = [];
    const provider = {
      async ask() {
        return "A";
      },
      async askChoice(_p: Persona, _prompt: string, choices: string[]) {
        seenOrders.push(choices);
        return { choice: "A" };
      },
    };
    const { responses, missing } = await simulate(
      personas(4),
      question,
      provider,
      { counterbalance: true },
    );
    expect(missing).toEqual([]);
    expect(responses).toHaveLength(4);
    const forward = seenOrders.filter((c) => c[0] === "A").length;
    const reversed = seenOrders.filter((c) => c[0] === "B").length;
    expect(forward).toBe(2);
    expect(reversed).toBe(2);
    // 선택지 의미는 순서와 무관 — choice 값은 그대로
    expect(responses.every((r) => r.choice === "A")).toBe(true);
  });

  test("counterbalance: ask 폴백 경로도 프롬프트의 선택지 나열 순서가 절반 뒤집힌다", async () => {
    const prompts: string[] = [];
    const provider = {
      async ask(_p: Persona, prompt: string) {
        prompts.push(prompt);
        return "A";
      },
    };
    await simulate(personas(4), question, provider, { counterbalance: true });
    const reversedCount = prompts.filter(
      (p) => p.indexOf("- B") < p.indexOf("- A"),
    ).length;
    expect(reversedCount).toBe(2);
  });

  test("counterbalance 미지정이면 전원 정방향 (기본 동작 보존)", async () => {
    const seenOrders: string[][] = [];
    const provider = {
      async ask() {
        return "A";
      },
      async askChoice(_p: Persona, _prompt: string, choices: string[]) {
        seenOrders.push(choices);
        return { choice: "A" };
      },
    };
    await simulate(personas(4), question, provider);
    expect(seenOrders.every((c) => c[0] === "A")).toBe(true);
  });

  test("클래스 기반 provider의 askChoice도 this를 잃지 않는다 (unbound 호출 금지)", async () => {
    class ClassProvider {
      inner = { value: "A" };
      async ask(): Promise<string> {
        return this.inner.value;
      }
      async askChoice(): Promise<{ choice: string }> {
        // 실제 프로바이더(Claude/OpenAI)처럼 this의 필드에 접근한다
        return { choice: this.inner.value };
      }
    }
    const { responses, missing } = await simulate(
      personas(2),
      question,
      new ClassProvider(),
    );
    expect(missing).toEqual([]);
    expect(responses.map((r) => r.choice)).toEqual(["A", "A"]);
  });

  test("opts 없는 기본 경로는 실패해도 재시도 없이 페르소나당 1회만 호출한다", async () => {
    let calls = 0;
    const provider = {
      async ask() {
        calls++;
        throw new Error("boom");
      },
    };
    const { responses, missing } = await simulate(
      personas(2),
      question,
      provider,
    );
    expect(calls).toBe(2); // 기존 순차 루프와 동일 — 기본값에서 재호출 없음
    expect(responses).toEqual([]);
    expect(missing).toHaveLength(2);
  });

  test("일시 오류는 재시도로 회복한다 (backoffMs=0)", async () => {
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

  test("재시도 소진 시 missing으로 남는다", async () => {
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

  test("onProgress가 완료 건수를 보고한다", async () => {
    const seen: number[] = [];
    const provider = {
      async ask() {
        return "A";
      },
    };
    await simulate(personas(4), question, provider, {
      onProgress: (done, total) => seen.push(done * 100 + total),
    });
    expect(seen).toHaveLength(4);
    expect(seen[seen.length - 1]).toBe(404); // done=4, total=4
  });
});
