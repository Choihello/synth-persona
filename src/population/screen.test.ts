import { describe, expect, it } from "vitest";
import type { Persona } from "../types.js";
import {
  CENSUS_AGE_LABELS,
  type PanelScreener,
  ageRangeLabel,
  constantDims,
  narrowsPanel,
  screenPersonas,
  screenerLabel,
} from "./screen.js";

const p = (attrs: Record<string, string>, id = "x"): Persona => ({
  id,
  attrs,
  weight: 1,
});

describe("ageRangeLabel", () => {
  it("연속 구간은 시작~끝으로 압축한다", () => {
    expect(ageRangeLabel(["20~24세", "25~29세", "30~34세", "35~39세"])).toBe(
      "20~39세",
    );
  });
  it("한 구간이면 그대로 둔다", () => {
    expect(ageRangeLabel(["30~34세"])).toBe("30~34세");
  });
  it("마지막이 개방 구간이면 '이상'으로 쓴다", () => {
    expect(ageRangeLabel(["20~24세", "85세이상"])).toBe("20세 이상");
  });
  it("빈 목록은 빈 문자열", () => {
    expect(ageRangeLabel([])).toBe("");
  });
  it("형식을 모르면 지어내지 않고 원문을 잇는다", () => {
    expect(ageRangeLabel(["청년", "장년"])).toBe("청년~장년");
  });
});

describe("screenerLabel", () => {
  it("미지정이면 전체 인구", () => {
    expect(screenerLabel()).toBe("전체 인구");
    expect(screenerLabel({})).toBe("전체 인구");
    expect(screenerLabel({ 연령: [] })).toBe("전체 인구");
  });
  it("연령만", () => {
    expect(screenerLabel({ 연령: ["20~24세", "35~39세"] })).toBe("20~39세");
  });
  it("지역만", () => {
    expect(screenerLabel({ 지역: "수도권" })).toBe("수도권");
  });
  it("둘 다면 가운뎃점으로 잇는다", () => {
    expect(
      screenerLabel({ 연령: ["20~24세", "35~39세"], 지역: "수도권" }),
    ).toBe("20~39세 · 수도권");
  });
});

describe("narrowsPanel", () => {
  it("축이 하나도 없으면 좁히지 않는다", () => {
    expect(narrowsPanel(undefined)).toBe(false);
    expect(narrowsPanel({})).toBe(false);
  });
  it("빈 연령 목록은 좁히지 않는다 (screenerLabel이 '전체 인구'를 돌려주는 바로 그 경우)", () => {
    expect(narrowsPanel({ 연령: [] })).toBe(false);
    expect(screenerLabel({ 연령: [] })).toBe("전체 인구");
  });
  it("연령 또는 지역이 있으면 좁힌다", () => {
    expect(narrowsPanel({ 연령: ["20~24세"] })).toBe(true);
    expect(narrowsPanel({ 지역: "수도권" })).toBe(true);
    expect(narrowsPanel({ 연령: [], 지역: "비수도권" })).toBe(true);
  });
  it("screenPersonas가 거르는 조건과 정확히 일치한다", () => {
    const all = [p({ 연령: "20~24세", 지역: "수도권" }, "a")];
    const noop: (PanelScreener | undefined)[] = [undefined, {}, { 연령: [] }];
    for (const s of noop) {
      expect(narrowsPanel(s)).toBe(false);
      expect(screenPersonas(all, s)).toBe(all); // 동일 참조 = 안 걸렀다
    }
  });
});

describe("screenPersonas", () => {
  const all = [
    p({ 연령: "20~24세", 지역: "수도권" }, "a"),
    p({ 연령: "30~34세", 지역: "비수도권" }, "b"),
    p({ 연령: "70~74세", 지역: "수도권" }, "c"),
  ];

  it("미지정이면 입력을 그대로 돌려준다 (동일 참조)", () => {
    expect(screenPersonas(all)).toBe(all);
    expect(screenPersonas(all, {})).toBe(all);
  });
  it("연령 목록으로 거른다", () => {
    expect(
      screenPersonas(all, { 연령: ["20~24세", "30~34세"] }).map((x) => x.id),
    ).toEqual(["a", "b"]);
  });
  it("지역으로 거른다", () => {
    expect(screenPersonas(all, { 지역: "수도권" }).map((x) => x.id)).toEqual([
      "a",
      "c",
    ]);
  });
  it("둘 다면 교집합", () => {
    expect(
      screenPersonas(all, { 연령: ["20~24세", "70~74세"], 지역: "비수도권" }),
    ).toEqual([]);
  });
});

describe("constantDims", () => {
  it("값이 하나뿐인 축만 돌려준다", () => {
    const sample = [
      p({ 연령: "20~24세", 지역: "수도권" }),
      p({ 연령: "30~34세", 지역: "수도권" }),
    ];
    expect(constantDims(sample).sort()).toEqual(["지역"]);
  });
  it("모든 축이 갈리면 빈 배열", () => {
    const sample = [
      p({ 연령: "20~24세", 지역: "수도권" }),
      p({ 연령: "30~34세", 지역: "비수도권" }),
    ];
    expect(constantDims(sample)).toEqual([]);
  });
  it("페르소나가 없으면 빈 배열", () => {
    expect(constantDims([])).toEqual([]);
  });
});

import census from "../../data/census/kr-2024.json" with { type: "json" };

describe("CENSUS_AGE_LABELS", () => {
  it("census 스냅샷의 연령 순서와 정확히 일치한다 (드리프트 가드)", () => {
    const fromSnapshot = (
      census as { core: { categories: { 연령: string[] } } }
    ).core.categories.연령;
    expect(CENSUS_AGE_LABELS).toEqual(fromSnapshot);
  });

  it("15개 라벨, 15~19세로 시작해 85세이상으로 끝난다", () => {
    expect(CENSUS_AGE_LABELS).toHaveLength(15);
    expect(CENSUS_AGE_LABELS[0]).toBe("15~19세");
    expect(CENSUS_AGE_LABELS.at(-1)).toBe("85세이상");
  });
});
