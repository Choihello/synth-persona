import { describe, expect, test } from "vitest";
import { MockProvider } from "../llm/mock.js";
import { matchChoice, simulate } from "./simulate.js";

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
