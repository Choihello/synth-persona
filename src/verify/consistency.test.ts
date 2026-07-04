import { describe, expect, test } from "vitest";
import type { Persona } from "../types.js";
import { measureResponseConsistency } from "./consistency.js";

/** 고정 인구: id 짝수는 A, 홀수는 B를 답하는 결정적 성향. */
const personas: Persona[] = Array.from({ length: 10 }, (_, i) => ({
  id: `p${i}`,
  attrs: { 연령: i % 2 === 0 ? "20대" : "60대" },
  weight: 1,
}));

const population = {
  name: "fixed",
  async population() {
    return personas;
  },
};

function deterministicProvider() {
  let calls = 0;
  return {
    calls: () => calls,
    async ask(p: Persona): Promise<string> {
      calls++;
      return Number(p.id.slice(1)) % 2 === 0 ? "A" : "B";
    },
  };
}

describe("measureResponseConsistency", () => {
  test("결정적 provider는 자기일관성 1.0, 순서 편향 없음, 붕괴 없음", async () => {
    const provider = deterministicProvider();
    const m = await measureResponseConsistency({
      population,
      provider,
      question: "A vs B?",
      paraphrases: ["A랑 B 중에?", "B 아니면 A?"],
      choices: ["A", "B"],
      n: 10,
      seed: 7,
      repeats: 3,
    });
    expect(m.selfConsistency).toBe(1);
    expect(m.orderBiased).toBe(false);
    expect(m.paraphraseStable).toBe(true);
    expect(m.collapsed).toBe(false);
    // 호출 수 = n × (repeats + 순서뒤집기 1 + 패러프레이즈 2) = 10 × 6
    expect(m.detail.calls).toBe(60);
    expect(provider.calls()).toBe(60);
  });

  test("예스맨 provider(무조건 첫 선택지)는 positivitySkew가 높다", async () => {
    const provider = {
      async ask() {
        return "A";
      },
    };
    const m = await measureResponseConsistency({
      population,
      provider,
      question: "A vs B?",
      paraphrases: [],
      choices: ["A", "B"],
      n: 10,
      seed: 7,
      repeats: 2,
    });
    expect(m.positivitySkew).toBe(1); // 전원 첫 선택지
    expect(m.collapsed).toBe(true); // 분포 붕괴(무차별)
  });

  test("랜덤에 가까운 불안정 provider는 자기일관성이 낮다", async () => {
    let i = 0;
    const provider = {
      async ask() {
        i++;
        return i % 2 === 0 ? "A" : "B"; // 같은 페르소나에도 매번 다른 답
      },
    };
    const m = await measureResponseConsistency({
      population,
      provider,
      question: "A vs B?",
      paraphrases: [],
      choices: ["A", "B"],
      n: 9, // 홀수 표본 → 반복 실행마다 페르소나별 패리티가 뒤집혀 답이 흔들린다
      seed: 7,
      repeats: 4,
    });
    expect(m.selfConsistency).toBeLessThan(0.8);
  });
});
