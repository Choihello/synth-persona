import { describe, expect, test } from "vitest";
import type { Persona } from "../types.js";
import {
  type NarrativePool,
  attachNarratives,
  narrativeKey,
} from "./narrative.js";

function p(attrs: Record<string, string>, id = "p1"): Persona {
  return { id, attrs, weight: 1 };
}

const pool: NarrativePool = {
  meta: {
    source: "nvidia/Nemotron-Personas-Korea",
    license: "CC BY 4.0",
    generatedAt: "2026-07-05",
    rowsScanned: 1,
    strataFilled: 1,
    strataTotal: 168,
  },
  strata: {
    "45~49세|남자|수도권|유배우": [
      {
        n: "김철수 씨는 성실한 회사원입니다.",
        job: "사무원",
        edu: "대학교",
        hh: "2",
      },
      {
        n: "박영호 씨는 자영업자입니다.",
        job: "자영업",
        edu: "고등학교",
        hh: "unknown",
      },
      {
        n: "이민수 씨는 혼자 삽니다.",
        job: "프리랜서",
        edu: "대학교",
        hh: "1",
      },
    ],
  },
};

describe("narrativeKey", () => {
  test("네 축이 있으면 '연령|성|지역|혼인' 키", () => {
    expect(
      narrativeKey({
        연령: "45~49세",
        성: "남자",
        지역: "수도권",
        혼인: "유배우",
        가구원수: "가구원수 2명",
      }),
    ).toBe("45~49세|남자|수도권|유배우");
  });
  test("축이 하나라도 없으면 null", () => {
    expect(narrativeKey({ 연령: "45~49세", 성: "남자" })).toBeNull();
  });
});

describe("attachNarratives", () => {
  const attrs = {
    연령: "45~49세",
    성: "남자",
    지역: "수도권",
    혼인: "유배우",
    가구원수: "가구원수 2명",
  };

  test("매칭되면 narrative가 '서사 (직업: … · 학력: …)' 형식으로 붙는다", () => {
    const [out] = attachNarratives([p(attrs)], pool, 7);
    expect(out.narrative).toMatch(
      /^(김철수|박영호) .*\(직업: .+ · 학력: .+\)$/,
    );
  });

  test("결정적: 같은 seed 두 번 = 동일, 다른 id는 독립 선택", () => {
    const a = attachNarratives([p(attrs, "x"), p(attrs, "y")], pool, 7);
    const b = attachNarratives([p(attrs, "x"), p(attrs, "y")], pool, 7);
    expect(a[0].narrative).toBe(b[0].narrative);
    expect(a[1].narrative).toBe(b[1].narrative);
  });

  test("가구 모순 후보는 제외된다 (2인 가구 페르소나에 hh:'1' 서사 금지)", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const [out] = attachNarratives([p(attrs)], pool, seed);
      expect(out.narrative).not.toContain("이민수");
    }
  });

  test("스트라텀 없음/후보 전멸이면 미부착 + 원본 불변", () => {
    const solo = p({ ...attrs, 연령: "20~24세" });
    const [out] = attachNarratives([solo], pool, 1);
    expect(out.narrative).toBeUndefined();
    // 1인 가구인데 후보가 전부 2인/1인모순이면 unknown만 허용
    const one = p({ ...attrs, 가구원수: "가구원수 1명" });
    const [o2] = attachNarratives([one], pool, 1);
    if (o2.narrative) expect(o2.narrative).not.toContain("김철수");
  });

  test("attrs는 절대 변형되지 않는다 (세그먼트 축 오염 방지)", () => {
    const src = p(attrs);
    const [out] = attachNarratives([src], pool, 7);
    expect(out.attrs).toEqual(attrs);
    expect(Object.keys(out.attrs)).toHaveLength(5);
    expect(src.narrative).toBeUndefined(); // 원본 객체 불변 (새 객체 반환)
  });
});
