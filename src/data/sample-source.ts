import sampleData from "../../data/samples/kr-census-sample.json" with { type: "json" };
import { readFile } from "node:fs/promises";
import type { Distribution } from "../types.js";
import type { DataSource, DistSpec } from "./source.js";

export class SampleSource implements DataSource {
  constructor(private path?: string) {}
  async getDistribution(_spec?: DistSpec): Promise<Distribution> {
    if (this.path) {
      const raw = await readFile(this.path, "utf8");
      return JSON.parse(raw) as Distribution;
    }
    return sampleData as Distribution;
  }
}
