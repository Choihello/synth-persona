import { describe, expect, test } from "vitest";
import { SampleSource } from "./sample-source.js";

describe("SampleSource", () => {
  test("번들 분포를 로드한다", async () => {
    const dist = await new SampleSource().getDistribution();
    expect(dist.dimensions.map((d) => d.name)).toEqual([
      "age",
      "sex",
      "region",
      "hh",
    ]);
    expect(dist.crossTables?.[0].dims).toEqual(["age", "hh"]);
    expect(dist.marginals.sex).toEqual([0.5, 0.5]);
  });
});
