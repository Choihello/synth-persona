import { describe, expect, test } from "vitest";
import { MockProvider } from "../src/llm/mock.js";
import { makeReportRunner } from "./pipeline.js";

describe("makeReportRunner (키 없는 mock 경로)", () => {
  test("리포트 md 생성 + 진행이 반복(repeats)에 걸쳐 누적 보고된다", async () => {
    const provider = new MockProvider((p) =>
      (p.attrs.연령 ?? "").startsWith("2") ? "쓴다" : "안쓴다",
    );
    const runner = makeReportRunner(provider, {
      n: 10,
      repeats: 3,
      concurrency: 1,
    });
    const seen: Array<[number, number]> = [];
    const md = await runner(
      "월 9900원에 쓸 의향?",
      ["쓴다", "안쓴다"],
      (d, t) => seen.push([d, t]),
    );
    expect(md).toContain("## 한 줄 요약");
    expect(md).toContain("synthetic panel response");
    expect(md).toContain("전체 응답 분포"); // 분포 스택바 SVG
    // 누적: 마지막 진행은 30/30 (10×3), 중간에 리셋(감소) 없음
    const dones = seen.map(([d]) => d);
    expect(Math.max(...dones)).toBe(30);
    expect(seen[seen.length - 1][1]).toBe(30);
    for (let i = 1; i < dones.length; i++) {
      expect(dones[i]).toBeGreaterThanOrEqual(dones[i - 1]);
    }
  });
});
