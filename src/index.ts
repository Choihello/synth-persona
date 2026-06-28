export type {
  Distribution,
  Dimension,
  CrossTable,
  JointDistribution,
  Persona,
  Response,
  StudyResult,
  SegmentResult,
} from "./types.js";
export { ipf } from "./personas/ipf.js";
export { samplePersonas, makeRng } from "./personas/sample.js";
export type { DataSource, DistSpec } from "./data/source.js";
export { SampleSource } from "./data/sample-source.js";
export {
  KosisSource,
  buildKosisUrl,
  parseKosisRows,
  rowsToCrossTable,
} from "./data/kosis-source.js";
export type { KosisRow, KosisOpts } from "./data/kosis-source.js";
export type { LLMProvider } from "./llm/provider.js";
export { MockProvider } from "./llm/mock.js";
export { ClaudeProvider } from "./llm/claude.js";
export { RecordedProvider } from "./llm/recorded.js";
export { simulate, matchChoice, type Question } from "./simulate/simulate.js";
export { aggregate, normalizedEntropy } from "./aggregate/uncertainty.js";
export { runStudy, type StudyConfig } from "./study.js";
export {
  spearman,
  meanAbsoluteError,
  brierScore,
  intervalCoverage,
} from "./verify/scoring.js";
export {
  backtest,
  topChoice,
  type GroundTruthCase,
  type CaseScore,
  type CalibrationReport,
} from "./verify/calibrate.js";
export { renderMarkdownReport, type ReportInput } from "./verify/report.js";
