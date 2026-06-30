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
export type { KosisRow, KosisOpts, KosisAxis } from "./data/kosis-source.js";
export type { LLMProvider } from "./llm/provider.js";
export { MockProvider } from "./llm/mock.js";
export { ClaudeProvider, personaSystemPrompt } from "./llm/claude.js";
export { RecordedProvider } from "./llm/recorded.js";
export { LoggingProvider, type LlmCallLog } from "./llm/logging.js";
export {
  simulate,
  matchChoice,
  buildPrompt,
  type Question,
} from "./simulate/simulate.js";
export { aggregate, normalizedEntropy } from "./aggregate/uncertainty.js";
export {
  runStudy,
  type StudyConfig,
  runCensusStudy,
  censusShareRunner,
  type CensusStudyConfig,
} from "./study.js";
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
export {
  selfConsistency,
  modeCollapseFlag,
  positivitySkew,
} from "./verify/probes.js";
export {
  paraphraseStability,
  orderBias,
  attributeSensitivity,
  type ShareRunner,
} from "./verify/robustness.js";
export {
  determinismGate,
  costBudgetCheck,
  driftDiff,
  type Usage,
  type Budget,
} from "./verify/governance.js";
export {
  renderHarnessReport,
  type HarnessFindings,
} from "./verify/harness-report.js";
export type {
  Snapshot,
  SnapshotMeta,
  CoreJoint,
  ConditionalTable,
} from "./population/schema.js";
export { loadSnapshot } from "./population/loader.js";
export {
  synthesizePopulation,
  conditionalProbs,
} from "./population/synthesize.js";
export {
  sampleForSimulation,
  CensusPopulation,
  type PersonaSource,
} from "./population/source.js";
export {
  populationFidelity,
  type FidelityReport,
  type BlockFidelity,
  type CellError,
} from "./verify/fidelity.js";
export { renderFidelityReport } from "./verify/fidelity-report.js";
export {
  assessReliability,
  type ReliabilityCard,
  type AttributeReliability,
  type Confidence,
} from "./assess/reliability.js";
export { renderReliabilityCard } from "./assess/reliability-report.js";
