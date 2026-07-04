import { describe, expect, test } from "vitest";
import { TursoStore } from "./store-turso.js";

describe("TursoStore (libsql, :memory:)", () => {
  test("생성→진행→완료 흐름과 일별 카운트가 SqliteStore와 동일 계약", async () => {
    const s = new TursoStore({ url: ":memory:" });
    await s.create({
      id: "t1",
      question: "q?",
      choices: ["A", "B"],
      ipHash: "h1",
      createdAt: "2026-07-04T10:00:00Z",
    });
    expect((await s.get("t1"))?.status).toBe("queued");

    await s.setStatus("t1", "running");
    await s.setProgress("t1", 45, 90, "응답 수집");
    let row = await s.get("t1");
    expect(row?.status).toBe("running");
    expect(row?.progressDone).toBe(45);
    expect(row?.phase).toBe("응답 수집");

    await s.markDone("t1", "# md");
    row = await s.get("t1");
    expect(row?.status).toBe("done");
    expect(row?.md).toBe("# md");
    expect(row?.choices).toEqual(["A", "B"]);

    expect(await s.countByIpOnDate("h1", "2026-07-04")).toBe(1);
    expect(await s.countOnDate("2026-07-04")).toBe(1);
    expect(await s.countOnDate("2026-07-05")).toBe(0);
  });

  test("실패 기록", async () => {
    const s = new TursoStore({ url: ":memory:" });
    await s.create({
      id: "t2",
      question: "q?",
      choices: ["A", "B"],
      ipHash: "h",
      createdAt: "2026-07-04T10:00:00Z",
    });
    await s.markFailed("t2", "boom");
    expect((await s.get("t2"))?.error).toBe("boom");
  });
});
