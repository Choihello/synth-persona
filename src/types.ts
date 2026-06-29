export interface Dimension {
  name: string;
  categories: string[];
}
export interface CrossTable {
  dims: [string, string];
  matrix: number[][];
}
export interface Distribution {
  dimensions: Dimension[];
  marginals: Record<string, number[]>;
  crossTables?: CrossTable[];
}
export interface JointDistribution {
  dimensions: Dimension[];
  cells: Float64Array; // row-major, dimension 순서 mixed-radix
}
export type Provenance =
  | "matched"
  | "conditioned"
  | "inferred"
  | "llm_generated";
export type Frame = "individual" | "householder" | "household";
export interface Persona {
  id: string;
  attrs: Record<string, string>;
  weight: number;
  provenance?: Record<string, Provenance>;
  flags?: string[];
}
export interface Response {
  persona: Persona;
  answer: string;
  choice?: string;
}
export interface SegmentResult {
  signal: "consensus" | "split";
  breakdown: Record<string, number>;
}
export interface StudyResult {
  responses: Response[];
  signal: "consensus" | "split";
  dispersion: number;
  bySegment: Record<string, Record<string, SegmentResult>>;
  missing?: { personaId: string; reason: string }[];
}
