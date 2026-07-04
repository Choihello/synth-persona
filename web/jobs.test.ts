import { describe, expect, test } from "vitest";
import { JobQueue, type ReportRunner } from "./jobs.js";
import { SqliteStore } from "./store.js";

function mkStore(id: string): SqliteStore {
  const s = new SqliteStore(":memory:");
  void s.create({
    id,
    question: "q?",
    choices: ["A", "B"],
    ipHash: "h",
    createdAt: new Date().toISOString(),
  });
  return s;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("JobQueue", () => {
  test("성공: running→done, md 저장, progress가 구독자에게 전달", async () => {
    const store = mkStore("j1");
    const runner: ReportRunner = async (_q, _c, onProgress) => {
      onProgress(1, 2, "응답 수집");
      onProgress(2, 2, "응답 수집");
      return "# 결과";
    };
    const q = new JobQueue(store, runner, { concurrency: 2 });
    const events: string[] = [];
    q.subscribe("j1", (e) => events.push(`${e.type}:${e.done ?? ""}`));
    q.enqueue("j1");
    await q.idle();
    expect((await store.get("j1"))?.status).toBe("done");
    expect((await store.get("j1"))?.md).toBe("# 결과");
    expect(events).toContain("progress:1");
    expect(events).toContain("done:");
    // 서버리스 폴링용: 진행률이 DB에도 남는다 (done===total 시점은 항상 기록)
    const row = await store.get("j1");
    expect(row?.progressDone).toBe(2);
    expect(row?.progressTotal).toBe(2);
  });

  test("실패: failed + 사유 저장 + error 이벤트", async () => {
    const store = mkStore("j2");
    const runner: ReportRunner = async () => {
      throw new Error("첫 실패 사유: 401");
    };
    const q = new JobQueue(store, runner, { concurrency: 1 });
    const events: string[] = [];
    q.subscribe("j2", (e) => events.push(e.type));
    q.enqueue("j2");
    await q.idle();
    expect((await store.get("j2"))?.status).toBe("failed");
    expect((await store.get("j2"))?.error).toContain("401");
    expect(events).toContain("error");
  });

  test("동시 실행이 concurrency를 넘지 않는다", async () => {
    const store = new SqliteStore(":memory:");
    let active = 0;
    let maxActive = 0;
    const runner: ReportRunner = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(10);
      active--;
      return "# r";
    };
    const q = new JobQueue(store, runner, { concurrency: 2 });
    for (let i = 0; i < 6; i++) {
      void store.create({
        id: `c${i}`,
        question: "q",
        choices: ["A", "B"],
        ipHash: "h",
        createdAt: new Date().toISOString(),
      });
      q.enqueue(`c${i}`);
    }
    await q.idle();
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(maxActive).toBeGreaterThan(1);
    expect((await store.get("c5"))?.status).toBe("done");
  });
});
