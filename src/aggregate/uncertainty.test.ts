import { describe, expect, test } from "vitest";
import type { Response } from "../types.js";
import { aggregate, normalizedEntropy } from "./uncertainty.js";

const r = (age: string, choice: string): Response => ({ persona: { id: Math.random().toString(), attrs: { age } }, answer: choice, choice });

describe("aggregate", () => {
  test("normalizedEntropy: 만장일치=0, 반반=1", () => {
    expect(normalizedEntropy([10, 0])).toBeCloseTo(0, 6);
    expect(normalizedEntropy([5, 5])).toBeCloseTo(1, 6);
  });

  test("합의된 응답은 consensus(🟢)", () => {
    const res = [r("20대", "A"), r("40대", "A"), r("20대", "A")];
    const out = aggregate(res, { splitThreshold: 0.5 });
    expect(out.signal).toBe("consensus");
  });

  test("갈린 응답은 split(🔴)", () => {
    const res = [r("20대", "A"), r("40대", "B"), r("20대", "A"), r("40대", "B")];
    const out = aggregate(res, { splitThreshold: 0.5 });
    expect(out.signal).toBe("split");
  });

  test("세그먼트(age)별 교차 신호를 만든다", () => {
    const res = [r("20대", "A"), r("20대", "A"), r("40대", "B"), r("40대", "B")];
    const out = aggregate(res, { splitThreshold: 0.5 });
    expect(out.bySegment.age["20대"].signal).toBe("consensus");
    expect(out.bySegment.age["40대"].signal).toBe("consensus");
    // 전체로는 갈리지만 각 세그먼트 안에서는 합의 → "세그먼트가 답을 가른다"
    expect(out.signal).toBe("split");
  });

  test("missing은 결과에 보존된다", () => {
    const out = aggregate([r("20대", "A")], { missing: [{ personaId: "9", reason: "err" }] });
    expect(out.missing?.[0].personaId).toBe("9");
  });
});
