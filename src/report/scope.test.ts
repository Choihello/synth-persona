import { describe, expect, it } from "vitest";
import { scopeVerdict } from "./scope.js";
import type { FounderInsightReport } from "./types.js";

/** 판정에 필요한 필드만 채운 최소 픽스처 */
function reportWith(over: {
  opp?: number;
  res?: number;
  weak?: number;
  held?: number;
  lowRel?: number;
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
    observedButHeld: Array.from(
      { length: over.held ?? 0 },
      () => ({}) as never,
    ),
    lowRelevance: Array.from({ length: over.lowRel ?? 0 }, () => ({}) as never),
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

  it("만장일치면 weakSignals가 있어도 unanimous가 underpowered보다 우선한다", () => {
    // 순서 회귀 가드: unanimous 검사를 underpowered 아래로 내리면 이 테스트만 깨진다.
    expect(scopeVerdict(reportWith({ weak: 3, dist: { 끈다: 180 } }))).toBe(
      "unanimous",
    );
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

  it("observedButHeld만 있어도(weakSignals 0) underpowered다 — minN 미만이라 검정조차 못 한 세그먼트", () => {
    // C1: segments.ts는 total < minN이면 z-검정 이전에 early continue한다 —
    // 그런 세그먼트는 weakSignals에 절대 들어올 수 없다.
    expect(
      scopeVerdict(reportWith({ held: 2, dist: { 찬성: 78, 반대: 12 } })),
    ).toBe("underpowered");
  });

  it("lowRelevance만 있어도(승격 0) segmented다 — 관련성 강등은 '차이 없음'이 아니다", () => {
    // C2: AI 관련성 게이트가 게이트 통과분을 강등한 것 — 효과가 없던 게 아니라 순위에서만 뺀 것.
    expect(
      scopeVerdict(reportWith({ lowRel: 1, dist: { 찬성: 78, 반대: 12 } })),
    ).toBe("segmented");
  });

  it("unanimous가 observedButHeld보다 우선한다 — 만장일치는 표본을 키워도 갈릴 수 없다", () => {
    expect(scopeVerdict(reportWith({ held: 3, dist: { 끈다: 180 } }))).toBe(
      "unanimous",
    );
  });
});
