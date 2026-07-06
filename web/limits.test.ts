import { describe, expect, it } from "vitest";
import { checkLimit } from "./limits.js";
import type { ReportStore } from "./store.js";

function fakeStore(counts: { global: number; ip: number }): ReportStore {
  return {
    countOnDate: async () => counts.global,
    countByIpOnDate: async () => counts.ip,
    // 나머지 메서드는 이 테스트에서 호출되지 않음
    create: async () => {},
    get: async () => undefined,
    setStatus: async () => {},
    setProgress: async () => {},
    markDone: async () => {},
    markFailed: async () => {},
  };
}

const policy = { perIpDaily: 3, globalDaily: 100 };
const now = new Date("2026-07-06T12:00:00Z");

describe("checkLimit 한도 메시지", () => {
  it("한도 내면 ok", async () => {
    const r = await checkLimit(fakeStore({ global: 0, ip: 0 }), "h", now, policy);
    expect(r.ok).toBe(true);
  });

  it("IP 한도 소진 시 오픈소스 전환 CTA를 안내한다", async () => {
    const r = await checkLimit(fakeStore({ global: 0, ip: 3 }), "h", now, policy);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("github.com/Choihello/synth-persona");
      expect(r.reason).toContain("직접 실행");
    }
  });

  it("전역 한도 소진 시에도 CTA를 안내한다", async () => {
    const r = await checkLimit(fakeStore({ global: 100, ip: 0 }), "h", now, policy);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("github.com/Choihello/synth-persona");
  });
});
