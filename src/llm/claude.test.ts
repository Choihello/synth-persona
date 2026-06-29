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
