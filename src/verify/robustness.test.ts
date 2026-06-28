import { describe, expect, test } from "vitest";
import {
  type ShareRunner,
  attributeSensitivity,
  orderBias,
  paraphraseStability,
} from "./robustness.js";

describe("robustness", () => {
  test("paraphraseStability: 모든 패러프레이즈 top 동일 → stable", async () => {
    const runner: ShareRunner = async () => ({ A: 0.7, B: 0.3 });
    const r = await paraphraseStability(
      runner,
      ["q1", "q1 다르게", "q1 또"],
      ["A", "B"],
    );
    expect(r.stable).toBe(true);
    expect(r.tops).toEqual(["A", "A", "A"]);
  });
  test("paraphraseStability: top 흔들리면 unstable", async () => {
    let call = 0;
    const runner: ShareRunner = async () =>
      call++ === 0 ? { A: 0.7, B: 0.3 } : { A: 0.3, B: 0.7 };
    const r = await paraphraseStability(runner, ["q", "q2"], ["A", "B"]);
    expect(r.stable).toBe(false);
  });
  test("orderBias: 순서 무관 runner → biased=false", async () => {
    const runner: ShareRunner = async () => ({ A: 0.7, B: 0.3 });
    const r = await orderBias(runner, "q", ["A", "B"]);
    expect(r.biased).toBe(false);
  });
  test("orderBias: 항상 첫 선택지를 고르는 runner → biased=true", async () => {
    const runner: ShareRunner = async (_p, choices) => ({ [choices[0]]: 1 });
    const r = await orderBias(runner, "q", ["A", "B"]);
    expect(r.forwardTop).toBe("A");
    expect(r.reversedTop).toBe("B");
    expect(r.biased).toBe(true);
  });
  test("attributeSensitivity: top 바뀌면 changed=true", async () => {
    const withRunner: ShareRunner = async () => ({ A: 0.8, B: 0.2 });
    const withoutRunner: ShareRunner = async () => ({ A: 0.2, B: 0.8 });
    const r = await attributeSensitivity(withRunner, withoutRunner, "q", [
      "A",
      "B",
    ]);
    expect(r.changed).toBe(true);
  });
});
