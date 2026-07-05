import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { refineHhFromNarrative } from "../../scripts/build-nemotron-pool.js";
import type { NarrativePool } from "./narrative.js";

describe("refineHhFromNarrative (가구 단서 보정)", () => {
  test("과거형 독거 + 현재 동거는 unknown 폴백 (오분류 방지)", () => {
    expect(
      refineHhFromNarrative(
        "혼자 살아온 세월을 뒤로 하고 지금은 가족과 함께 산다",
      ),
    ).toBe("unknown");
  });

  test("현재형 독거 단서만 있으면 '1'", () => {
    expect(refineHhFromNarrative("독거 노인으로 살아간다")).toBe("1");
  });
});

describe("kr-pool.json (커밋된 실데이터)", () => {
  const pool = JSON.parse(
    readFileSync(
      new URL("../../data/nemotron/kr-pool.json", import.meta.url),
      "utf8",
    ),
  ) as NarrativePool;

  test("meta에 출처·라이선스가 기록돼 있다", () => {
    expect(pool.meta.source).toBe("nvidia/Nemotron-Personas-Korea");
    expect(pool.meta.license).toBe("CC BY 4.0");
  });

  test("모든 스트라텀 키가 '연령|성|지역|혼인' 형식이고 우리 카테고리 값만 쓴다", () => {
    const AGES = new Set([
      "20~24세",
      "25~29세",
      "30~34세",
      "35~39세",
      "40~44세",
      "45~49세",
      "50~54세",
      "55~59세",
      "60~64세",
      "65~69세",
      "70~74세",
      "75~79세",
      "80~84세",
      "85세이상",
    ]);
    for (const key of Object.keys(pool.strata)) {
      const [age, sex, region, marital] = key.split("|");
      expect(AGES.has(age), key).toBe(true);
      expect(["남자", "여자"]).toContain(sex);
      expect(["수도권", "비수도권"]).toContain(region);
      expect(["미혼", "유배우", "사별·이혼"]).toContain(marital);
    }
  });

  test("항목은 비지 않고 필드가 유효하다", () => {
    const entries = Object.values(pool.strata).flat();
    expect(entries.length).toBeGreaterThan(500);
    for (const e of entries.slice(0, 200)) {
      expect(e.n.length).toBeGreaterThan(20);
      expect(e.n.length).toBeLessThanOrEqual(401);
      expect(["1", "2", "3+", "unknown"]).toContain(e.hh);
    }
  });

  test("15~19세 스트라텀은 없다 (19세 제외 규칙)", () => {
    expect(Object.keys(pool.strata).some((k) => k.startsWith("15~19세"))).toBe(
      false,
    );
  });
});
