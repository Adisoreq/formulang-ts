import { createStore } from "solid-js/store";
import { generateCandles, randomSeed } from "./candles";
import { EXAMPLES, INDICATORS, NEW_FORMULA, PATTERNS, STRATEGIES, formulaKey } from "./examples";
import { type IndicatorDraft, draftOf } from "./indicators";
import { type PatternDraft, type StrategyDraft, patternDraftOf, strategyDraftOf } from "./patterns-strategies";
import type { ChartCandle, ContextKind } from "./types";

export interface PreviewState {
  context: ContextKind;
  /** Selected example of every context type. */
  selected: Record<ContextKind, string>;
  /** Formulas of the examples, as edited (`kind:id`). */
  formulas: Record<string, string>;
  /** Indicators as edited in the preview: definitions, parameter values and series styles. */
  indicators: IndicatorDraft[];
  /** Patterns as edited in the preview: definitions and appearance. */
  patterns: PatternDraft[];
  /** Strategies as edited in the preview: definitions, appearance and the values of the proposal. */
  strategies: StrategyDraft[];
  iterationCount: number;
  /** Frames per second of the Time Context. */
  framesPerSecond: number;
  candleCount: number;
  seed: number;
  candles: readonly ChartCandle[];
}

function initialState(): PreviewState {
  const formulas: Record<string, string> = {};
  const selected = {} as Record<ContextKind, string>;
  for (const [kind, examples] of Object.entries(EXAMPLES) as [ContextKind, (typeof EXAMPLES)[ContextKind]][]) {
    selected[kind] = examples[0]!.id;
    for (const example of examples) formulas[formulaKey(kind, example.id)] = example.formula;
  }
  const seed = 20251;
  return {
    context: "default",
    selected,
    formulas,
    indicators: INDICATORS.map(draftOf),
    patterns: PATTERNS.map(patternDraftOf),
    // The empty strategy is inactive until it has a formula
    strategies: STRATEGIES.map((s) => strategyDraftOf(s, s.id !== NEW_FORMULA)),
    iterationCount: 8,
    framesPerSecond: 20,
    candleCount: 160,
    seed,
    candles: generateCandles(160, seed),
  };
}

export const [state, setState] = createStore<PreviewState>(initialState());

/** Generates new mock candles; the chart is rebuilt. */
export function regenerateCandles(count = state.candleCount): void {
  const seed = randomSeed();
  setState({ seed, candleCount: count, candles: generateCandles(count, seed) });
}

export function selectedFormula(kind: ContextKind = state.context): string {
  return state.formulas[formulaKey(kind, state.selected[kind])] ?? "";
}

export function setFormula(value: string, kind: ContextKind = state.context): void {
  setState("formulas", formulaKey(kind, state.selected[kind]), value);
}

/** Restores the formula of the selected example. */
export function resetFormula(): void {
  const kind = state.context;
  const example = EXAMPLES[kind].find((e) => e.id === state.selected[kind]);
  if (example !== undefined) setFormula(example.formula);
}

/** Index of an indicator in the state. */
export function indicatorIndex(id: string): number {
  return state.indicators.findIndex((i) => i.id === id);
}

/** Restores the definition of an indicator from its example (its formula stays). */
export function resetIndicator(id: string): void {
  const config = INDICATORS.find((i) => i.id === id);
  if (config !== undefined) setState("indicators", indicatorIndex(id), draftOf(config));
}

export function patternIndex(id: string): number {
  return state.patterns.findIndex((p) => p.id === id);
}

/** Restores the definition and appearance of a pattern from its example (its formula stays). */
export function resetPattern(id: string): void {
  const config = PATTERNS.find((p) => p.id === id);
  if (config !== undefined) setState("patterns", patternIndex(id), patternDraftOf(config));
}

export function strategyIndex(id: string): number {
  return state.strategies.findIndex((s) => s.id === id);
}

/** Restores the definition and appearance of a strategy from its example (its formula and activity stay). */
export function resetStrategy(id: string): void {
  const config = STRATEGIES.find((s) => s.id === id);
  const index = strategyIndex(id);
  if (config !== undefined)
    setState("strategies", index, strategyDraftOf(config, state.strategies[index]!.runtime.active));
}
