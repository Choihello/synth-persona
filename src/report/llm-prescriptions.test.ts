import { describe, expect, test } from "vitest";
import type { Response } from "../types.js";
import { sampleReasons } from "./llm-prescriptions.js";

function r(choice: string, answer: string, id = Math.random().toString()) {
  return {
    persona: { id, attrs: { 연령: "30대" }, weight: 1 },
    answer,
    choice,
  } as Response;
}

describe("sampleReasons", () => {
  test("긍정/부정으로 분리하고 reason 미수집(answer==choice)은 제외한다", () => {
    const responses = [
      r("쓴다", "바빠서 새벽배송이 편해요"),
      r("쓴다", "쓴다"), // 폴백 경로 — reason 없음
      r("안쓴다", "가격이 부담돼요"),
      r("안쓴다", "직접 장 보는 게 좋아요"),
    ];
    const { positive, negative } = sampleReasons(responses, "쓴다");
    expect(positive).toEqual(["바빠서 새벽배송이 편해요"]);
    expect(negative).toHaveLength(2);
  });

  test("중복 제거 + side당 상한 + 200자 절단", () => {
    const responses = [
      ...Array.from({ length: 30 }, (_, i) => r("쓴다", `이유 ${i % 5}`)), // 5종만
      r("안쓴다", "가".repeat(300)),
    ];
    const { positive, negative } = sampleReasons(responses, "쓴다", {
      maxPerSide: 3,
    });
    expect(positive).toHaveLength(3);
    expect(new Set(positive).size).toBe(3); // 중복 없음
    expect(negative[0]).toHaveLength(200);
  });

  test("같은 seed는 같은 표본 (결정적)", () => {
    const responses = Array.from({ length: 50 }, (_, i) =>
      r(i % 2 ? "쓴다" : "안쓴다", `이유-${i}`),
    );
    const a = sampleReasons(responses, "쓴다", { maxPerSide: 5, seed: 7 });
    const b = sampleReasons(responses, "쓴다", { maxPerSide: 5, seed: 7 });
    expect(a).toEqual(b);
  });
});
