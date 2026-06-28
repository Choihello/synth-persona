import fc from "fast-check";
import { describe, expect, test } from "vitest";
import type { Distribution } from "../types.js";
import { ipf } from "./ipf.js";

const baseDist = (): Distribution => ({
  dimensions: [
    { name: "age", categories: ["20s", "30s", "40s", "50s"] },
    { name: "hh", categories: ["1", "2", "3", "4+"] },
  ],
  marginals: {},
  crossTables: [
    {
      dims: ["age", "hh"],
      matrix: [
        [0.115, 0.07, 0.03, 0.025],
        [0.085, 0.08, 0.045, 0.04],
        [0.06, 0.06, 0.07, 0.09],
        [0.09, 0.07, 0.055, 0.055],
      ],
    },
  ],
});

const cellSum = (j: { cells: Float64Array }) =>
  j.cells.reduce((a, b) => a + b, 0);

describe("ipf", () => {
  test("결합분포 합은 1 (정규화)", () => {
    const j = ipf(baseDist());
    expect(cellSum(j)).toBeCloseTo(1, 6);
  });

  test("모든 셀은 음수가 아니다", () => {
    const j = ipf(baseDist());
    expect(j.cells.every((v) => v >= 0)).toBe(true);
  });

  test("2-way 교차표 타깃을 복원한다", () => {
    const d = baseDist();
    const j = ipf(d);
    // age=2(40s), hh=3(4+) 셀 합이 타깃과 일치해야 함
    const ai = 2;
    const hi = 3;
    let s = 0;
    for (let a = 0; a < 4; a++)
      for (let h = 0; h < 4; h++)
        if (a === ai && h === hi) s += j.cells[a * 4 + h];
    const ct = d.crossTables?.[0];
    if (!ct) throw new Error("fixture must provide crossTables");
    const targetTotal = ct.matrix.flat().reduce((x, y) => x + y, 0);
    expect(s).toBeCloseTo(0.09 / targetTotal, 4);
  });

  test("property: 1-way 마진 타깃을 항상 복원한다", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0.05, max: 1, noNaN: true }), {
          minLength: 2,
          maxLength: 2,
        }),
        (sexRaw) => {
          const total = sexRaw[0] + sexRaw[1];
          const sex = sexRaw.map((v) => v / total);
          const d: Distribution = {
            dimensions: [
              { name: "age", categories: ["20s", "30s"] },
              { name: "sex", categories: ["m", "f"] },
            ],
            marginals: { sex },
            crossTables: [],
          };
          const j = ipf(d);
          // sex 마진 복원 확인
          let m = 0;
          let f = 0;
          for (let a = 0; a < 2; a++) {
            m += j.cells[a * 2 + 0];
            f += j.cells[a * 2 + 1];
          }
          expect(m).toBeCloseTo(sex[0], 4);
          expect(f).toBeCloseTo(sex[1], 4);
        },
      ),
      { numRuns: 50 },
    );
  });
});
