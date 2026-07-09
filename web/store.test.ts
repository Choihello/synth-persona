import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { checkLimit } from "./limits.js";
import { SqliteStore } from "./store.js";

describe("SqliteStore (ReportStore 구현)", () => {
  test("리포트 생성 → 조회 → 완료 기록", async () => {
    const s = new SqliteStore(":memory:");
    await s.create({
      id: "abc",
      question: "q?",
      choices: ["A", "B"],
      ipHash: "h1",
      createdAt: "2026-07-04T10:00:00Z",
    });
    expect((await s.get("abc"))?.status).toBe("queued");
    await s.markDone("abc", "# 리포트");
    const r = await s.get("abc");
    expect(r?.status).toBe("done");
    expect(r?.md).toBe("# 리포트");
    expect(r?.choices).toEqual(["A", "B"]);
  });

  test("실패 기록은 사유를 보존한다", async () => {
    const s = new SqliteStore(":memory:");
    await s.create({
      id: "x",
      question: "q?",
      choices: ["A", "B"],
      ipHash: "h1",
      createdAt: "2026-07-04T10:00:00Z",
    });
    await s.markFailed("x", "첫 실패 사유: 401");
    const r = await s.get("x");
    expect(r?.status).toBe("failed");
    expect(r?.error).toContain("401");
  });

  test("일별 카운트: ip별·전역, 날짜 경계로 분리", async () => {
    const s = new SqliteStore(":memory:");
    const mk = (id: string, ip: string, at: string) =>
      s.create({
        id,
        question: "q",
        choices: ["A", "B"],
        ipHash: ip,
        createdAt: at,
      });
    await mk("1", "h1", "2026-07-04T01:00:00Z");
    await mk("2", "h1", "2026-07-04T23:00:00Z");
    await mk("3", "h2", "2026-07-04T12:00:00Z");
    await mk("4", "h1", "2026-07-05T00:10:00Z"); // 다음 날
    expect(await s.countByIpOnDate("h1", "2026-07-04")).toBe(2);
    expect(await s.countOnDate("2026-07-04")).toBe(3);
    expect(await s.countByIpOnDate("h1", "2026-07-05")).toBe(1);
  });

  test("screener를 저장·복원한다", async () => {
    const s = new SqliteStore(":memory:");
    await s.create({
      id: "scr",
      question: "q?",
      choices: ["A", "B"],
      ipHash: "h1",
      createdAt: "2026-07-10T10:00:00Z",
      screener: { 연령: ["20~24세", "25~29세"], 지역: "수도권" },
    });
    const r = await s.get("scr");
    expect(r?.screener).toEqual({
      연령: ["20~24세", "25~29세"],
      지역: "수도권",
    });
  });

  test("screener 없으면 undefined (기존 리포트 호환)", async () => {
    const s = new SqliteStore(":memory:");
    await s.create({
      id: "plain",
      question: "q?",
      choices: ["A", "B"],
      ipHash: "h1",
      createdAt: "2026-07-10T10:00:00Z",
    });
    expect((await s.get("plain"))?.screener).toBeUndefined();
  });

  test("같은 파일 DB에 스토어를 두 번 열어도 마이그레이션이 재실행 안전하다", async () => {
    const path = join(tmpdir(), `screener-migrate-${Date.now()}.db`);
    const a = new SqliteStore(path);
    await a.create({
      id: "m1",
      question: "q?",
      choices: ["A", "B"],
      ipHash: "h1",
      createdAt: "2026-07-10T10:00:00Z",
      screener: { 지역: "비수도권" },
    });
    // 두 번째 오픈 — ALTER가 중복 컬럼으로 던져도 삼켜져야 한다(생성자 무예외).
    const b = new SqliteStore(path);
    expect((await b.get("m1"))?.screener).toEqual({ 지역: "비수도권" });
    a.close();
    b.close();
    rmSync(path, { force: true });
    rmSync(`${path}-wal`, { force: true });
    rmSync(`${path}-shm`, { force: true });
    rmSync(`${path}-journal`, { force: true });
  });
});

describe("checkLimit", () => {
  async function storeWith(perIp: number, global: number) {
    const s = new SqliteStore(":memory:");
    for (let i = 0; i < global; i++) {
      await s.create({
        id: `g${i}`,
        question: "q",
        choices: ["A", "B"],
        ipHash: i < perIp ? "me" : `other${i}`,
        createdAt: "2026-07-04T05:00:00Z",
      });
    }
    return s;
  }

  test("한도 안이면 ok", async () => {
    const s = await storeWith(2, 10);
    expect(
      await checkLimit(s, "me", new Date("2026-07-04T06:00:00Z"), {
        perIpDaily: 3,
        globalDaily: 100,
      }),
    ).toEqual({ ok: true });
  });

  test("IP당 일 한도 초과", async () => {
    const s = await storeWith(3, 10);
    const r = await checkLimit(s, "me", new Date("2026-07-04T06:00:00Z"), {
      perIpDaily: 3,
      globalDaily: 100,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("오늘");
  });

  test("전역 일 한도 초과", async () => {
    const s = await storeWith(0, 100);
    const r = await checkLimit(s, "newbie", new Date("2026-07-04T06:00:00Z"), {
      perIpDaily: 3,
      globalDaily: 100,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("체험");
  });
});
