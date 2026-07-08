import { describe, expect, it } from "vitest";
import { runReportDemo } from "./report-demo.js";

describe("report-demo", () => {
  it("키 없이 13섹션 markdown 리포트를 만든다", async () => {
    const md = await runReportDemo();
    expect(md).toContain("0차 시장검증 리포트");
    expect(md).toContain("## 다음 7일");
    expect(md).toContain("synthetic panel");
    expect(md).toContain("규칙 기반으로 파생된 초안");
  });
});
