/**
 * Execution of the formulas of every context type with FormuLang-TS.
 */
import {
  Cleaner,
  ContainerType,
  Context,
  Environment,
  type ExecutionResult,
  Executor,
  FlObject,
  type IError,
  type IObject,
  type IValue,
  IterationContext,
  Parser,
  Tokenizer,
  TypeNames,
  Validator,
  Value,
} from "formulang-ts";
import {
  type Candle,
  IndicatorContext,
  IndicatorParameter,
  PatternContext,
  StockContext,
  StockExecutor,
  StrategyContext,
  registerStock,
} from "formulang-ts/stock";
import { type IndicatorDraft, problemsOf } from "./indicators";
import type { ChartCandle } from "./types";

const executor = Executor.create();
const stockExecutor = new StockExecutor(executor);

/** An indicator of the preview with its current formula. */
export interface IndicatorSetup {
  readonly config: IndicatorDraft;
  readonly formula: string;
}

/**
 * An environment with the Core and Stock standards. Every indicator of the preview with a valid definition is in
 * the registry, with its current formula and the default values of its parameters, so `INDICATOR("SMA")` works
 * in every Stock formula.
 */
export function createEnvironment(indicators: readonly IndicatorSetup[] = []): Environment {
  const environment = Environment.create();
  const registry = registerStock(environment).registry;
  const drafts = indicators.map((i) => i.config);
  for (const { config, formula } of indicators) {
    if (problemsOf(config, drafts).length > 0) continue;
    registry.add(
      config.indicatorId,
      formula,
      config.parameters.map((p) => new IndicatorParameter(p.id, p.defaultValue)),
    );
  }
  return environment;
}

/** The environment used for the suggestions and the highlighting of the editor. */
export const referenceEnvironment = createEnvironment();

const toCandle = (c: ChartCandle): Candle => ({ ...c });

/** Problems found before the evaluation: every validation error, or the error of clean-up, tokenization or parsing. */
export interface Diagnostics {
  readonly validationErrors: readonly IError[];
  /** Canonical form of every sequence, e.g. `SET($x,ADD(1,2))`; empty if the formula does not parse. */
  readonly sequences: readonly string[];
}

export function diagnose(formula: string, environment: Environment): Diagnostics {
  const validationErrors = new Validator().validate(formula, environment).errors;
  const cleaned = new Cleaner().cleanUp(formula);
  if (!cleaned.successful) return { validationErrors, sequences: [] };
  const tokens = new Tokenizer().tokenize(cleaned.result);
  if (!tokens.successful) return { validationErrors, sequences: [] };
  const parsed = Parser.forEnvironment(environment).parse(tokens.tokens);
  return { validationErrors, sequences: parsed.successful ? parsed.sequences.map((s) => s.root.key) : [] };
}

export interface VariableRow {
  readonly name: string;
  readonly value: string;
  /** An environment variable changed by the formula. */
  readonly changed: boolean;
}

export interface DefaultRun {
  readonly kind: "default";
  readonly execution: ExecutionResult;
  readonly variables: readonly VariableRow[];
}

export function runDefault(formula: string, environment: Environment): DefaultRun {
  const context = Context.create(environment);
  const execution = executor.execute(formula, context);
  const variables: VariableRow[] = [];
  for (const key of context.keys) {
    const container = context.getProperty(key);
    if (container?.containerType === ContainerType.Variable) {
      variables.push({ name: `$${key}`, value: container.getValue().toString(), changed: false });
    }
  }
  for (const key of context.environmentVariables.keys) {
    const value = context.environmentVariables.getProperty(key)!.getValue().toString();
    variables.push({ name: `@${key}`, value, changed: value !== environment.getProperty(key)?.getValue().toString() });
  }
  return { kind: "default", execution, variables };
}

export interface IterationRun {
  readonly kind: "iterations";
  /** Results of the executed iterations; fewer than the count if an iteration failed. */
  readonly results: readonly ExecutionResult[];
  readonly count: number;
}

export function runIterations(formula: string, count: number, environment: Environment): IterationRun {
  const run = executor.executeIterations(formula, IterationContext.create(environment, count));
  return { kind: "iterations", results: run.results, count };
}

export function runStock(formula: string, candles: readonly ChartCandle[], environment: Environment): IterationRun {
  const context = StockContext.create(environment, candles.map(toCandle), executor);
  const run = executor.executeIterations(formula, context);
  return { kind: "iterations", results: run.results, count: candles.length };
}

export interface IndicatorRun {
  readonly kind: "indicator";
  /** Values of every series by its id; `null` where the indicator has no value. */
  readonly series: Readonly<Record<string, readonly (number | null)[]>>;
  readonly error: IError | undefined;
}

/** Runs an indicator formula and splits its results into the configured series. */
export function runIndicator(
  setup: IndicatorSetup,
  candles: readonly ChartCandle[],
  environment: Environment,
): IndicatorRun {
  const { config } = setup;
  const context = IndicatorContext.create(environment, candles.map(toCandle), executor, parametersOf(setup));
  const result = stockExecutor.executeIndicator(setup.formula, context);
  const series: Record<string, (number | null)[]> = Object.fromEntries(config.series.map((s) => [s.id, []]));
  if (result.type.base === TypeNames.Error) return { kind: "indicator", series, error: result.raw as IError };
  for (const value of result.raw as readonly IValue[]) {
    for (const s of config.series) {
      let number: unknown = null;
      if (config.seriesMode === "single") number = value.raw;
      else if (value.type.base === TypeNames.Object) number = (value.raw as IObject).getProperty(s.id)?.getValue().raw;
      series[s.id]!.push(typeof number === "number" ? number : null);
    }
  }
  return { kind: "indicator", series, error: undefined };
}

/** `PARAMETERS` of the Indicator Context: the values of the parameters set in the preview. */
function parametersOf(setup: IndicatorSetup): IObject {
  return FlObject.from(setup.config.parameters.map((p) => [p.id, Value.number(p.value)] as const));
}

export interface PatternRun {
  readonly kind: "pattern";
  /** Indices of the candles where the pattern ends. */
  readonly indices: readonly number[];
  readonly error: IError | undefined;
}

export function runPattern(formula: string, candles: readonly ChartCandle[], environment: Environment): PatternRun {
  const context = PatternContext.create(environment, candles.map(toCandle), executor);
  const result = stockExecutor.executePattern(formula, context);
  return { kind: "pattern", indices: result.indices, error: result.successful ? undefined : result.error };
}

export interface StrategySetup {
  /** Key of the strategy in the preview. */
  readonly id: string;
  readonly formula: string;
}

export interface StrategySignals {
  readonly id: string;
  /** Result of every candle, from -1 to 1 (clamped); `null` where the formula failed. */
  readonly signals: readonly (number | null)[];
  readonly error: IError | undefined;
}

/** Signals of every strategy. Confidence, lifetime and the proposal are applied by {@link proposalOf}. */
export interface StrategyRun {
  readonly kind: "strategy";
  readonly strategies: readonly StrategySignals[];
}

/** Values of a strategy: a signal stays active for `lifetime` candles, or until the strategy gives a new one. */
export function activeValues(signals: readonly (number | null)[], lifetime: number): number[] {
  const values: number[] = [];
  let value = 0;
  let remaining = 0;
  for (const signal of signals) {
    if (signal !== null && signal !== 0) {
      value = signal;
      remaining = Math.max(1, Math.floor(lifetime));
    }
    values.push(remaining > 0 ? value : 0);
    remaining--;
  }
  return values;
}

/** Settings of a strategy that the proposal uses. */
export interface StrategyWeights {
  readonly active: boolean;
  readonly confidence: number;
  readonly lifetime: number;
}

export interface StrategyValues {
  /** Signal × confidence of every candle; `null` where the formula failed. */
  readonly weighted: readonly (number | null)[];
  /** Value of the strategy for every candle: the last weighted signal while it is active (its lifetime). */
  readonly active: readonly number[];
}

/**
 * Values of every strategy and the final proposal of every candle: the sum of the values of all active
 * strategies. Computed from the signals, so a change of a weight needs no new execution.
 */
export function proposalOf(
  signals: readonly StrategySignals[],
  weights: (id: string) => StrategyWeights | undefined,
  count: number,
): { readonly values: ReadonlyMap<string, StrategyValues>; readonly proposal: readonly number[] } {
  const values = new Map<string, StrategyValues>();
  for (const strategy of signals) {
    const w = weights(strategy.id);
    if (w === undefined) continue;
    const weighted = strategy.signals.map((signal) => (signal === null ? null : signal * w.confidence));
    values.set(strategy.id, { weighted, active: activeValues(weighted, w.lifetime) });
  }
  const proposal = Array.from({ length: count }, (_, i) =>
    signals.reduce((sum, s) => (weights(s.id)?.active ? sum + (values.get(s.id)?.active[i] ?? 0) : sum), 0),
  );
  return { values, proposal };
}

export function runStrategies(
  setups: readonly StrategySetup[],
  candles: readonly ChartCandle[],
  environment: Environment,
): StrategyRun {
  const strategies = setups.map(({ id, formula }): StrategySignals => {
    const context = StrategyContext.create(environment, candles.map(toCandle), executor);
    const result = stockExecutor.executeStrategy(formula, context, false);
    const signals = candles.map((_, i) => result.signals[i] ?? null);
    return { id, signals, error: result.successful ? undefined : result.error };
  });
  return { kind: "strategy", strategies };
}
