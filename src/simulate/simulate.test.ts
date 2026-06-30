import { describe, expect, test } from "vitest";
import { MockProvider } from "../llm/mock.js";
import { buildPrompt, matchChoice, simulate } from "./simulate.js";

const personas = [
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
      personas,
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
      personas,
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
