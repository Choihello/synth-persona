import { describe, expect, test } from "vitest";
import { MockProvider } from "../src/llm/mock.js";
import { runB2 } from "./b2-live.js";

describe("runB2 (키 없는 mock 경로)", () => {
  test("결정적 mock으로 전체 오케스트레이션이 돌고 판정을 출력한다", async () => {
    const provider = new MockProvider((p) =>
      (p.attrs.연령 ?? "").startsWith("2") ? "쓴다" : "안쓴다",
    );
    const out = await runB2({ provider, n: 10, repeats: 2, concurrency: 1 });
    expect(out).toContain("자기일관성 | 1.000"); // 결정적 → 완전 일관
    expect(out).toContain("순서 편향 | 🟢 없음");
    expect(out).toMatch(/판정: (medium|low)/);
    // 실행 수 = 반복2 + 순서1 + 패러프레이즈2 = 5회 × n=10
    expect(out).toContain("= 50콜");
  });
});
