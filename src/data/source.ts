import type { Distribution } from "../types.js";

export interface DistSpec {
  year?: string;
  dimensions?: string[];
}
export interface DataSource {
  getDistribution(spec?: DistSpec): Promise<Distribution>;
}
