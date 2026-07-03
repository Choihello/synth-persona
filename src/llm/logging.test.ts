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

  test("inner가 askChoice를 구현하면 포워딩하고 구조화 응답을 로그에 남긴다", async () => {
    const inner = {
      async ask() {
        return "쓴다";
      },
      async askChoice() {
        return { choice: "쓴다", reason: "필요해서" };
      },
      usage: { calls: 1, inputTokens: 10, outputTokens: 2 },
    };
    const lp = new LoggingProvider(inner, { runId: "run-1", model: "mock" });
    expect(lp.askChoice).toBeDefined();
    const reply = await lp.askChoice?.(persona, "쓸 의향?", ["쓴다", "안쓴다"]);
    expect(reply).toEqual({ choice: "쓴다", reason: "필요해서" });
    expect(lp.logs).toHaveLength(1);
    expect(lp.logs[0].rawResponse).toContain("쓴다");
    // usage는 inner에 위임 — 래핑해도 토큰 집계가 사라지지 않는다
    expect(lp.usage).toEqual({ calls: 1, inputTokens: 10, outputTokens: 2 });
  });

  test("inner에 askChoice가 없으면 래퍼도 노출하지 않는다 (simulate 폴백 판정 보존)", () => {
    const lp = new LoggingProvider(new MockProvider(() => "쓴다"), {
      runId: "run-1",
      model: "mock",
    });
    expect(lp.askChoice).toBeUndefined();
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
