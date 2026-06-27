import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Distribution } from "../types.js";
import type { DataSource, DistSpec } from "./source.js";

const SAMPLE_PATH = fileURLToPath(new URL("../../data/samples/kr-census-sample.json", import.meta.url));

export class SampleSource implements DataSource {
  constructor(private path: string = SAMPLE_PATH) {}
  async getDistribution(_spec?: DistSpec): Promise<Distribution> {
    const raw = await readFile(this.path, "utf8");
    return JSON.parse(raw) as Distribution;
  }
}
