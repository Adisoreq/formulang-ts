/**
 * Patterns and strategies edited in the preview: mutable copies of the example configurations.
 */
import { type IndicatorParameterDraft, parameterDraftsOf, registryProblems } from "./indicators";
import type { PatternColor, PatternConfig, PatternType, StrategyConfig } from "./types";

export interface PatternDraft {
  /** Key of the pattern in the preview (not editable). */
  readonly id: string;
  /** Identifier in the registry: `LOAD_PATTERN("ENGULFING")`. */
  patternId: string;
  name: string;
  description: string;
  parameters: IndicatorParameterDraft[];
  type: PatternType;
  /** Number of candles of the pattern, ending with the candle where it is detected. */
  length: number;
  // Appearance
  color: PatternColor;
  /** Writes the label (the initials of the name) above every rectangle. */
  showLabel: boolean;
}

export interface StrategyRuntime {
  /** The strategy takes part in the final proposal. */
  active: boolean;
  /** Confidence used by the proposal; the default is the one of the definition. */
  confidence: number;
  /** Lifetime used by the proposal; the default is the one of the definition. */
  lifetime: number;
}

export interface StrategyDraft {
  /** Key of the strategy in the preview (not editable). */
  readonly id: string;
  name: string;
  description: string;
  /** Default confidence of the definition. */
  confidence: number;
  /** Default lifetime of the definition (whole number of candles). */
  lifetime: number;
  // Appearance
  /** Text of the markers of the strategy on the chart. */
  label: string;
  // Values of the preview
  runtime: StrategyRuntime;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export function patternDraftOf(config: PatternConfig): PatternDraft {
  return { ...config, parameters: parameterDraftsOf(config.parameters), showLabel: true };
}

export function strategyDraftOf(config: StrategyConfig, active = true): StrategyDraft {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    confidence: config.confidence,
    lifetime: config.lifetime,
    label: initials(config.name),
    runtime: { active, confidence: config.confidence, lifetime: config.lifetime },
  };
}

export const MAX_PATTERN_LENGTH = 20;

/** Number of candles of the rectangle of a pattern: its length, or 1 for a length that is not valid. */
export function patternLength(draft: PatternDraft): number {
  return Number.isInteger(draft.length) && draft.length >= 1 && draft.length <= MAX_PATTERN_LENGTH ? draft.length : 1;
}

/**
 * Problems of the definition of a pattern. A pattern with problems is not in the registry, so `LOAD_PATTERN(id)`
 * returns `INVALID_KEY_ERROR` for it.
 *
 * @param all Every pattern of the preview, to check that the registry id is unique.
 */
export function patternProblems(draft: PatternDraft, all: readonly PatternDraft[] = []): string[] {
  const problems = registryProblems(
    draft.patternId,
    "pattern",
    all.filter((other) => other !== draft).map((other) => other.patternId),
    draft.parameters,
  );
  if (draft.name.trim().length === 0) problems.push("The pattern has no name.");
  if (!Number.isInteger(draft.length) || draft.length < 1 || draft.length > MAX_PATTERN_LENGTH) {
    problems.push(`The number of candles must be a whole number from 1 to ${MAX_PATTERN_LENGTH}.`);
  }
  return problems;
}

export function strategyProblems(draft: StrategyDraft): string[] {
  const problems: string[] = [];
  if (draft.name.trim().length === 0) problems.push("The strategy has no name.");
  if (!Number.isFinite(draft.confidence) || draft.confidence < 0) problems.push("The confidence must be a number ≥ 0.");
  if (!Number.isInteger(draft.lifetime) || draft.lifetime < 1) {
    problems.push("The lifetime must be a whole number of candles ≥ 1.");
  }
  return problems;
}
