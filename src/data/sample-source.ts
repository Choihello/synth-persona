import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Distribution } from "../types.js";
import type { DataSource, DistSpec } from "./source.js";

function getSamplePath(): string {
  return join(process.cwd(), "data", "samples", "kr-census-sample.json");
}

export class SampleSource implements DataSource {
  constructor(private path: string = getSamplePath()) {}
  async getDistribution(_spec?: DistSpec): Promise<Distribution> {
    const raw = await readFile(this.path, "utf8");
    return JSON.parse(raw) as Distribution;
  }
}
