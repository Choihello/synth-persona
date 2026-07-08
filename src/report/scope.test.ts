import { describe, expect, it } from "vitest";
import { scopeVerdict } from "./scope.js";
import type { FounderInsightReport } from "./types.js";

/** 판정에 필요한 네 필드만 채운 최소 픽스처 */
function reportWith(over: {
  opp?: number;
  res?: number;
  weak?: number;
  dist?: Record<string, number>;
}): FounderInsightReport {
  return {
    opportunitySegments: Array.from(
      { length: over.opp ?? 0 },
      () => ({}) as never,
    ),
    resistanceSegments: Array.from(
      { length: over.res ?? 0 },
      () => ({}) as never,
    ),
    weakSignals: Array.from({ length: over.weak ?? 0 }, () => ({}) as never),
    overallSignal: { distribution: over.dist ?? { 쓴다: 30, 안쓴다: 30 } },
  } as unknown as FounderInsightReport;
}

describe("scopeVerdict", () => {
  it("승격 세그먼트가 하나라도 있으면 segmented", () => {
    expect(scopeVerdict(reportWith({ opp: 1 }))).toBe("segmented");
    expect(scopeVerdict(reportWith({ res: 1 }))).toBe("segmented");
  });

  it("응답이 단일 버킷이면 unanimous", () => {
    expect(scopeVerdict(reportWith({ dist: { 끈다: 180 } }))).toBe("unanimous");
  });

  it("0 카운트 버킷은 무시하고 unanimous로 본다", () => {
    expect(scopeVerdict(reportWith({ dist: { 끈다: 180, 켠다: 0 } }))).toBe(
      "unanimous",
    );
  });

  it("승격 0 + weakSignals 있으면 underpowered", () => {
    expect(
      scopeVerdict(
        reportWith({ weak: 3, dist: { 수용한다: 9, "수용 못 한다": 171 } }),
      ),
    ).toBe("underpowered");
  });

  it("승격 0 + weakSignals 0 + 응답은 갈림이면 no-effect", () => {
    expect(scopeVerdict(reportWith({ dist: { 찬성: 78, 반대: 12 } }))).toBe(
      "no-effect",
    );
  });

  it("승격이 있으면 만장일치여도 segmented가 우선한다 (방어적)", () => {
    expect(scopeVerdict(reportWith({ opp: 1, dist: { 끈다: 180 } }))).toBe(
      "segmented",
    );
  });

  it("빈 distribution은 unanimous로 본다 (버킷 0개)", () => {
    expect(scopeVerdict(reportWith({ dist: {} }))).toBe("unanimous");
  });
});
