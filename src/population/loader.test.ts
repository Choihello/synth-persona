import { describe, expect, test } from "vitest";
import { loadSnapshot } from "./loader.js";
import type { Snapshot } from "./schema.js";

const ok: Snapshot = {
  meta: {
    year: 2024,
    geographyLevel: "권역",
    generatedAt: "2026-06-29",
    sources: [],
    ageBins: ["15~19세"],
    weightUnit: "person_count",
  },
  core: {
    dims: ["성", "연령", "지역"],
    categories: { 성: ["남자"], 연령: ["15~19세"], 지역: ["수도권"] },
    counts: [100],
  },
  conditional: [
    {
      given: "연령",
      var: "혼인",
      frame: "individual",
      universe: "15세이상",
      givenKeys: ["15~19세"],
      varKeys: ["미혼"],
      matrix: [[100]],
    },
    {
      given: "연령",
      var: "가구원수",
      frame: "householder",
      universe: "일반가구",
      bridge: "householder_age_as_proxy",
      givenKeys: ["15~19세"],
      varKeys: ["가구원수 1명"],
      matrix: [[50]],
    },
  ],
};

describe("loadSnapshot", () => {
  test("정상 스냅샷을 로드한다", () => {
    const s = loadSnapshot(ok);
    expect(s.core.dims).toEqual(["성", "연령", "지역"]);
  });
  test("frame 가드: 비개인 conditional이 bridge 없으면 throw", () => {
    const bad = structuredClone(ok);
    bad.conditional[1].bridge = undefined;
    expect(() => loadSnapshot(bad)).toThrow(/bridge/i);
  });
  test("구조 불량은 throw", () => {
    expect(() => loadSnapshot({})).toThrow();
  });
});
