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
