import { readFile } from "node:fs/promises";
import sampleData from "../../data/samples/kr-census-sample.json" with {
  type: "json",
};
import type { Distribution } from "../types.js";
import type { DataSource, DistSpec } from "./source.js";

export class SampleSource implements DataSource {
  constructor(private path?: string) {}
  async getDistribution(_spec?: DistSpec): Promise<Distribution> {
    if (this.path) {
      const raw = await readFile(this.path, "utf8");
      return JSON.parse(raw) as Distribution;
    }
    // JSON import는 dims를 string[]로 추론하므로 unknown 경유 캐스트(CrossTable.dims는 [string,string])
    return sampleData as unknown as Distribution;
  }
}
