import { describe, expect, test } from "vitest";
import type { Persona } from "../types.js";
import { LoggingProvider } from "./logging.js";
import { MockProvider } from "./mock.js";

const persona: Persona = {
  id: "p1",
  attrs: { 성: "여자", 연령: "30~34세" },
  weight: 100,
};

describe("LoggingProvider", () => {
  test("성공 호출을 구조화 로그로 기록한다 (model/runId/personaId/attrs/promptHash/raw/latency)", async () => {
    const inner = new MockProvider(() => "쓴다");
    const lp = new LoggingProvider(inner, { runId: "run-1", model: "mock" });
    const out = await lp.ask(persona, "쓸 의향?");
    expect(out).toBe("쓴다");
    expect(lp.logs).toHaveLength(1);
    const e = lp.logs[0];
    expect(e.runId).toBe("run-1");
    expect(e.model).toBe("mock");
    expect(e.personaId).toBe("p1");
    expect(e.attrs).toEqual({ 성: "여자", 연령: "30~34세" });
    expect(e.promptHash).toMatch(/^[0-9a-f]{12}$/); // sha256 12자
    expect(e.rawResponse).toBe("쓴다");
    expect(typeof e.latencyMs).toBe("number");
    expect(e.error).toBeUndefined();
  });

  test("같은 prompt는 같은 hash, 다른 prompt는 다른 hash", async () => {
    const lp = new LoggingProvider(new MockProvider(() => "x"), {
      runId: "r",
      model: "mock",
    });
    await lp.ask(persona, "A");
    await lp.ask(persona, "A");
    await lp.ask(persona, "B");
    expect(lp.logs[0].promptHash).toBe(lp.logs[1].promptHash);
    expect(lp.logs[0].promptHash).not.toBe(lp.logs[2].promptHash);
  });

  test("provider 실패는 error로 기록되고 re-throw된다 (raw 없음)", async () => {
    const inner = new MockProvider(() => {
      throw new Error("rate limit");
    });
    const lp = new LoggingProvider(inner, { runId: "r", model: "mock" });
    await expect(lp.ask(persona, "Q")).rejects.toThrow("rate limit");
    expect(lp.logs).toHaveLength(1);
    expect(lp.logs[0].error).toContain("rate limit");
    expect(lp.logs[0].rawResponse).toBeUndefined();
  });

  test("missingRate: parsed choice 없는 비율을 집계한다", async () => {
    const lp = new LoggingProvider(new MockProvider(() => "x"), {
      runId: "r",
      model: "mock",
    });
    await lp.ask(persona, "Q");
    await lp.ask(persona, "Q");
    // 2건 모두 성공 → error 0건
    expect(lp.errorCount()).toBe(0);
  });
});
