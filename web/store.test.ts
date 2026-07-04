import { describe, expect, test } from "vitest";
import { checkLimit } from "./limits.js";
import { ReportStore } from "./store.js";

describe("ReportStore", () => {
  test("리포트 생성 → 조회 → 완료 기록", () => {
    const s = new ReportStore(":memory:");
    s.create({
      id: "abc",
      question: "q?",
      choices: ["A", "B"],
      ipHash: "h1",
      createdAt: "2026-07-04T10:00:00Z",
    });
    expect(s.get("abc")?.status).toBe("queued");
    s.markDone("abc", "# 리포트");
    const r = s.get("abc");
    expect(r?.status).toBe("done");
    expect(r?.md).toBe("# 리포트");
    expect(r?.choices).toEqual(["A", "B"]);
  });

  test("실패 기록은 사유를 보존한다", () => {
    const s = new ReportStore(":memory:");
    s.create({
      id: "x",
      question: "q?",
      choices: ["A", "B"],
      ipHash: "h1",
      createdAt: "2026-07-04T10:00:00Z",
    });
    s.markFailed("x", "첫 실패 사유: 401");
    expect(s.get("x")?.status).toBe("failed");
    expect(s.get("x")?.error).toContain("401");
  });

  test("일별 카운트: ip별·전역, 날짜 경계로 분리", () => {
    const s = new ReportStore(":memory:");
    const mk = (id: string, ip: string, at: string) =>
      s.create({
        id,
        question: "q",
        choices: ["A", "B"],
        ipHash: ip,
        createdAt: at,
      });
    mk("1", "h1", "2026-07-04T01:00:00Z");
    mk("2", "h1", "2026-07-04T23:00:00Z");
    mk("3", "h2", "2026-07-04T12:00:00Z");
    mk("4", "h1", "2026-07-05T00:10:00Z"); // 다음 날
    expect(s.countByIpOnDate("h1", "2026-07-04")).toBe(2);
    expect(s.countOnDate("2026-07-04")).toBe(3);
    expect(s.countByIpOnDate("h1", "2026-07-05")).toBe(1);
  });
});

describe("checkLimit", () => {
  function storeWith(perIp: number, global: number) {
    const s = new ReportStore(":memory:");
    for (let i = 0; i < global; i++) {
      s.create({
        id: `g${i}`,
        question: "q",
        choices: ["A", "B"],
        ipHash: i < perIp ? "me" : `other${i}`,
        createdAt: "2026-07-04T05:00:00Z",
      });
    }
    return s;
  }

  test("한도 안이면 ok", () => {
    const s = storeWith(2, 10);
    expect(
      checkLimit(s, "me", new Date("2026-07-04T06:00:00Z"), {
        perIpDaily: 3,
        globalDaily: 100,
      }),
    ).toEqual({ ok: true });
  });

  test("IP당 일 한도 초과", () => {
    const s = storeWith(3, 10);
    const r = checkLimit(s, "me", new Date("2026-07-04T06:00:00Z"), {
      perIpDaily: 3,
      globalDaily: 100,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("오늘");
  });

  test("전역 일 한도 초과", () => {
    const s = storeWith(0, 100);
    const r = checkLimit(s, "newbie", new Date("2026-07-04T06:00:00Z"), {
      perIpDaily: 3,
      globalDaily: 100,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("체험");
  });
});
