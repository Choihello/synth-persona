import type { Frame } from "../types.js";

export interface SnapshotSourceMeta {
  var: string[];
  tblId: string;
  orgId?: string;
  frame: Frame;
  universe: string;
  denominator?: string;
}
export interface SnapshotMeta {
  year: number;
  geographyLevel: "시도" | "권역" | "전국";
  generatedAt: string;
  sources: SnapshotSourceMeta[];
  ageBins: string[];
  weightUnit: "person_count" | "normalized_weight";
  regionMapping?: Record<string, string[]>;
  bridgeAssumptions?: string[];
  missingPolicy?: { structuralZero: string[]; suppressed: string[] };
}
export interface CoreJoint {
  dims: string[];
  categories: Record<string, string[]>;
  counts: number[]; // flat, row-major over dims
}
export interface ConditionalTable {
  given: string;
  var: string;
  frame: Frame;
  universe: string;
  givenKeys: string[];
  varKeys: string[];
  matrix: (number | null)[][]; // [given][var] counts; null = suppressed
  bridge?: string;
}
export interface Snapshot {
  meta: SnapshotMeta;
  core: CoreJoint;
  conditional: ConditionalTable[];
}
