import { describe, expect, test } from "vitest";
import { executeReport } from "./run-report.js";
import { SqliteStore } from "./store.js";
import { validateReportInput } from "./validate.js";

describe("validateReportInput", () => {
  test("정상 입력은 이스케이프되어 반환", () => {
    const out = validateReportInput({
      question: "<b>월 9900원</b> 쓸래?",
      choices: ["쓴다", "안쓴다"],
    });
    expect(out.question).toContain("&lt;b&gt;");
    expect(out.choices).toEqual(["쓴다", "안쓴다"]);
  });
  test("선택지 1개는 throw", () => {
    expect(() =>
      validateReportInput({ question: "q?", choices: ["A"] }),
    ).toThrow(/선택지/);
  });
});

describe("executeReport", () => {
  async function prep(id: string) {
    const s = new SqliteStore(":memory:");
    await s.create({
      id,
      question: "q?",
      choices: ["A", "B"],
      ipHash: "h",
      createdAt: new Date().toISOString(),
    });
    return s;
  }

  test("성공: running→done + 진행률 DB 기록", async () => {
    const store = await prep("r1");
    await executeReport(store, "r1", async (_q, _c, onProgress) => {
      onProgress(5, 10, "수집");
      onProgress(10, 10, "수집");
      return "# md";
    });
    const row = await store.get("r1");
    expect(row?.status).toBe("done");
    expect(row?.md).toBe("# md");
    expect(row?.progressDone).toBe(10);
  });

  test("실패: failed + 사유", async () => {
    const store = await prep("r2");
    await executeReport(store, "r2", async () => {
      throw new Error("boom 401");
    });
    const row = await store.get("r2");
    expect(row?.status).toBe("failed");
    expect(row?.error).toContain("401");
  });
});
