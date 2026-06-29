import type { KosisRow } from "../src/data/kosis-source.js";
import type { CoreJoint } from "../src/population/schema.js";

// 시도 단위 행(C1=지역, C2=성, C3=연령)을 권역으로 합산해 성×연령×권역 CoreJoint 생성.
export function aggregateSidoToRegion(
  rows: KosisRow[],
  regionMapping: Record<string, string[]>,
  sexKeys: string[],
  ageKeys: string[],
): CoreJoint {
  const regionKeys = Object.keys(regionMapping);
  const sidoToRegion: Record<string, string> = {};
  for (const [region, sidos] of Object.entries(regionMapping))
    for (const s of sidos) sidoToRegion[s] = region;

  const si = Object.fromEntries(sexKeys.map((k, i) => [k, i]));
  const ai = Object.fromEntries(ageKeys.map((k, i) => [k, i]));
  const ri = Object.fromEntries(regionKeys.map((k, i) => [k, i]));
  const counts = new Array(
    sexKeys.length * ageKeys.length * regionKeys.length,
  ).fill(0);
  const stride = [ageKeys.length * regionKeys.length, regionKeys.length, 1];

  for (const r of rows) {
    if (r.value == null) continue;
    const region = sidoToRegion[r.c1nm];
    const s = si[r.c2nm ?? ""];
    const a = ai[r.c3nm ?? ""];
    if (region == null || s == null || a == null) continue;
    counts[s * stride[0] + a * stride[1] + ri[region] * stride[2]] += r.value;
  }
  return {
    dims: ["성", "연령", "지역"],
    categories: { 성: sexKeys, 연령: ageKeys, 지역: regionKeys },
    counts,
  };
}
