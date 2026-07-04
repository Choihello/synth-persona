import { describe, expect, test } from "vitest";
import { MockProvider } from "../src/llm/mock.js";
import { runReportLive } from "./report-live.js";

describe("runReportLive (키 없는 mock 경로)", () => {
  test("generateJson 없는 provider는 heuristic 폴백 + 경고 라인 + 13섹션 리포트", async () => {
    const provider = new MockProvider((p) =>
      (p.attrs.연령 ?? "").startsWith("2") ? "쓴다" : "안쓴다",
    );
    const out = await runReportLive({
      provider,
      n: 30,
      repeats: 1,
      concurrency: 1,
    });
    expect(out).toContain("LLM 처방 생성 실패");
    expect(out).toContain("## 한 줄 요약");
    expect(out).toContain("## 다음 7일");
    expect(out).toContain("synthetic panel response");
  });
});
