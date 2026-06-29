import type { Snapshot } from "./schema.js";

export function loadSnapshot(json: unknown): Snapshot {
  const s = json as Snapshot;
  if (!s || !s.meta || !s.core || !Array.isArray(s.conditional)) {
    throw new Error("invalid snapshot: missing meta/core/conditional");
  }
  if (!Array.isArray(s.core.dims) || !Array.isArray(s.core.counts)) {
    throw new Error("invalid snapshot: malformed core");
  }
  // frame 가드: 개인 프레임이 아닌 conditional은 명시 bridge가 있어야 결합 허용
  for (const ct of s.conditional) {
    if (ct.frame !== "individual" && !ct.bridge) {
      throw new Error(
        `cross-frame conditional '${ct.var}' (frame=${ct.frame}) requires an explicit bridge`,
      );
    }
  }
  return s;
}
