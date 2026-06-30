import type { Snapshot } from "./schema.js";

export function loadSnapshot(json: unknown): Snapshot {
  const s = json as Snapshot;
  if (!s || !s.meta || !s.core || !Array.isArray(s.conditional)) {
    throw new Error("invalid snapshot: missing meta/core/conditional");
  }
  if (!Array.isArray(s.core.dims) || !Array.isArray(s.core.counts)) {
    throw new Error("invalid snapshot: malformed core");
  }

  // core 구조 불변식: 모든 dim에 비어있지 않은 category, counts 길이 = product(category 길이),
  // 모든 count는 finite non-negative.
  let expectedCells = 1;
  for (const dim of s.core.dims) {
    const cats = s.core.categories?.[dim];
    if (!Array.isArray(cats) || cats.length === 0) {
      throw new Error(
        `invalid snapshot: core.categories['${dim}'] missing or empty`,
      );
    }
    expectedCells *= cats.length;
  }
  if (s.core.counts.length !== expectedCells) {
    throw new Error(
      `invalid snapshot: core.counts length ${s.core.counts.length} != product(categories) ${expectedCells}`,
    );
  }
  for (const c of s.core.counts) {
    if (typeof c !== "number" || !Number.isFinite(c) || c < 0) {
      throw new Error(
        `invalid snapshot: core.counts must be finite non-negative numbers (got ${c})`,
      );
    }
  }

  // frame 가드 + conditional 구조 불변식
  for (const ct of s.conditional) {
    // frame 가드: 개인 프레임이 아닌 conditional은 명시 bridge가 있어야 결합 허용
    if (ct.frame !== "individual" && !ct.bridge) {
      throw new Error(
        `cross-frame conditional '${ct.var}' (frame=${ct.frame}) requires an explicit bridge`,
      );
    }
    if (
      !Array.isArray(ct.givenKeys) ||
      !Array.isArray(ct.varKeys) ||
      !Array.isArray(ct.matrix)
    ) {
      throw new Error(
        `invalid snapshot: conditional '${ct.var}' malformed givenKeys/varKeys/matrix`,
      );
    }
    if (ct.matrix.length !== ct.givenKeys.length) {
      throw new Error(
        `invalid snapshot: conditional '${ct.var}' matrix rows ${ct.matrix.length} != givenKeys ${ct.givenKeys.length}`,
      );
    }
    for (const row of ct.matrix) {
      if (!Array.isArray(row) || row.length !== ct.varKeys.length) {
        throw new Error(
          `invalid snapshot: conditional '${ct.var}' row length != varKeys ${ct.varKeys.length}`,
        );
      }
      for (const v of row) {
        // null = suppressed(X) 허용. 그 외는 finite non-negative 숫자만.
        if (
          v !== null &&
          (typeof v !== "number" || !Number.isFinite(v) || v < 0)
        ) {
          throw new Error(
            `invalid snapshot: conditional '${ct.var}' values must be null or finite non-negative (got ${v})`,
          );
        }
      }
    }
  }
  return s;
}
