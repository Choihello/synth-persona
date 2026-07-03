import { describe, expect, test } from "vitest";
import { ClaudeProvider, personaSystemPrompt } from "./claude.js";

describe("ClaudeProvider", () => {
  test("페르소나 시스템 프롬프트에 속성이 들어간다", () => {
    const s = personaSystemPrompt({
      id: "1",
      attrs: { age: "40대", region: "수도권" },
      weight: 1,
    });
    expect(s).toContain("40대");
    expect(s).toContain("수도권");
  });

  test("census 페르소나: 5속성 + provenance + bridge + synthetic panel 제한 포함", () => {
    const s = personaSystemPrompt({
      id: "p1",
      attrs: {
        성: "여자",
        연령: "30~34세",
        지역: "수도권",
        혼인: "미혼",
        가구원수: "가구원수 1명",
      },
      weight: 100,
      provenance: {
        성: "matched",
        연령: "matched",
        지역: "matched",
        혼인: "conditioned",
        가구원수: "conditioned",
      },
      flags: ["bridge:householder_age_as_proxy"],
    });
    // 5속성 값
    for (const v of ["여자", "30~34세", "수도권", "미혼", "가구원수 1명"])
      expect(s).toContain(v);
    // provenance 노출
    expect(s).toContain("matched");
    expect(s).toContain("conditioned");
    // bridge flag
    expect(s).toContain("householder_age_as_proxy");
    // synthetic panel respondent 제한 (실제 개인 아님)
    expect(s).toMatch(/가상 패널|synthetic panel/);
    expect(s).toContain("실제 개인이 아니");
  });

  test("주입된 클라이언트로 응답 텍스트를 반환한다", async () => {
    const fakeClient = {
      messages: {
        create: async () => ({
          content: [{ type: "text", text: "  살래요  " }],
        }),
      },
    };
    const p = new ClaudeProvider({
      client: fakeClient as never,
      model: "test-model",
    });
    const out = await p.ask(
      { id: "1", attrs: { age: "40대" }, weight: 1 },
      "이거 살래요?",
    );
    expect(out).toBe("살래요");
  });
});

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

  test("tool_choice로 강제하고 enum에 choices를 넣는다", async () => {
    const captured: unknown[] = [];
    const p = new ClaudeProvider({ client: fakeClient(captured) as never });
    const reply = await p.askChoice(persona, "q?", ["쓴다", "안쓴다"]);
    expect(reply).toEqual({ choice: "안쓴다", reason: "가격이 부담돼서" });

    const req = captured[0] as {
      tools: Array<{
        strict: boolean;
        input_schema: { properties: { choice: { enum: string[] } } };
      }>;
      tool_choice: { type: string; name: string };
    };
    expect(req.tool_choice).toEqual({ type: "tool", name: "answer" });
    expect(req.tools[0].strict).toBe(true);
    expect(req.tools[0].input_schema.properties.choice.enum).toEqual([
      "쓴다",
      "안쓴다",
    ]);
  });

  test("usage를 ask/askChoice에 걸쳐 누적한다", async () => {
    const p = new ClaudeProvider({ client: fakeClient([]) as never });
    await p.askChoice(persona, "q?", ["쓴다", "안쓴다"]);
    await p.askChoice(persona, "q?", ["쓴다", "안쓴다"]);
    expect(p.usage).toEqual({ calls: 2, inputTokens: 200, outputTokens: 40 });
  });

  test("tool_use 블록이 없으면 명확한 에러", async () => {
    const broken = {
      messages: {
        create: async () => ({
          content: [{ type: "text", text: "그냥 텍스트" }],
        }),
      },
    };
    const p = new ClaudeProvider({ client: broken as never });
    await expect(
      p.askChoice(persona, "q?", ["쓴다", "안쓴다"]),
    ).rejects.toThrow(/tool_use/);
  });
});
