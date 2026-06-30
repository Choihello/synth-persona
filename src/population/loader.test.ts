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

  test("counts 길이가 product(categories)와 다르면 throw", () => {
    const bad = structuredClone(ok);
    bad.core.counts = [100, 200]; // product=1인데 2개
    expect(() => loadSnapshot(bad)).toThrow(/counts/i);
  });

  test("dim에 대응하는 category가 없으면 throw", () => {
    const bad = structuredClone(ok);
    (bad.core.categories as Record<string, string[] | undefined>).지역 =
      undefined;
    expect(() => loadSnapshot(bad)).toThrow(/categor/i);
  });

  test("category 배열이 비어 있으면 throw", () => {
    const bad = structuredClone(ok);
    bad.core.categories.지역 = [];
    expect(() => loadSnapshot(bad)).toThrow(/categor/i);
  });

  test("음수/NaN count는 throw", () => {
    const neg = structuredClone(ok);
    neg.core.counts = [-1];
    expect(() => loadSnapshot(neg)).toThrow();
    const nan = structuredClone(ok);
    nan.core.counts = [Number.NaN];
    expect(() => loadSnapshot(nan)).toThrow();
  });

  test("conditional matrix 행 수가 givenKeys와 다르면 throw", () => {
    const bad = structuredClone(ok);
    bad.conditional[0].matrix = [[100], [50]]; // givenKeys len1인데 2행
    expect(() => loadSnapshot(bad)).toThrow();
  });

  test("conditional matrix row 길이가 varKeys와 다르면 throw", () => {
    const bad = structuredClone(ok);
    bad.conditional[0].matrix = [[100, 50]]; // varKeys len1인데 2열
    expect(() => loadSnapshot(bad)).toThrow();
  });

  test("conditional 음수 값은 throw하되 null(suppressed)은 허용", () => {
    const neg = structuredClone(ok);
    neg.conditional[0].matrix = [[-5]];
    expect(() => loadSnapshot(neg)).toThrow();
    const sup = structuredClone(ok);
    sup.conditional[0].matrix = [[null]];
    expect(() => loadSnapshot(sup)).not.toThrow();
  });
});
