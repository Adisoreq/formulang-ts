/**
 * Execution of the formulas of every context type with FormuLang-TS.
 */
import {
  ContainerType,
  Context,
  Environment,
  ExecutionResult,
  Executor,
  FlObject,
  type IError,
  type IObject,
  type IValue,
  type IWarning,
  IterationContext,
  TimeContext,
  TypeNames,
  Value,
  serialize,
  toJs,
} from "formulang-ts";
import {
  type Candle,
  FormulaParameter,
  IndicatorContext,
  PatternContext,
  StockContext,
  type StockContextOptions,
  StockExecutor,
  StrategyContext,
  registerStock,
} from "formulang-ts/stock";
import { DAY, aggregateCandles } from "./candles";
import { type IndicatorDraft, type IndicatorParameterDraft, problemsOf } from "./indicators";
import { type PatternDraft, patternProblems } from "./patterns-strategies";
import { TimeSession } from "./time-session";
import type { ChartCandle, ContextKind } from "./types";

const executor = Executor.create();
const stockExecutor = new StockExecutor(executor);

/** An indicator of the preview with its current formula. */
export interface IndicatorSetup {
  readonly config: IndicatorDraft;
  readonly formula: string;
}

/** A pattern of the preview with its current formula. */
export interface PatternSetup {
  readonly config: PatternDraft;
  readonly formula: string;
}

const definitionParameters = (parameters: readonly IndicatorParameterDraft[]): FormulaParameter[] =>
  parameters.map((p) => new FormulaParameter(p.id, p.defaultValue));

/**
 * An environment with the Core and Stock standards. Every indicator and pattern of the preview with a valid
 * definition is in the formula registry, with its current formula and the default values of its parameters, so
 * `LOAD_INDICATOR("SMA")` and `LOAD_PATTERN("ENGULFING")` work in every Stock formula.
 */
export function createEnvironment(
  indicators: readonly IndicatorSetup[] = [],
  patterns: readonly PatternSetup[] = [],
): Environment {
  const environment = Environment.create();
  const registry = registerStock(environment).registry;
  const indicatorDrafts = indicators.map((i) => i.config);
  for (const { config, formula } of indicators) {
    if (problemsOf(config, indicatorDrafts).length === 0) {
      registry.indicators.add(config.indicatorId, formula, definitionParameters(config.parameters));
    }
  }
  const patternDrafts = patterns.map((p) => p.config);
  for (const { config, formula } of patterns) {
    if (patternProblems(config, patternDrafts).length === 0) {
      registry.patterns.add(config.patternId, formula, definitionParameters(config.parameters));
    }
  }
  return environment;
}

/** The environment used for the suggestions and the highlighting of the editor. */
export const referenceEnvironment = createEnvironment();

const toCandle = (c: ChartCandle): Candle => ({ ...c });

/** Timeframe of the mock candles (daily) and the other timeframe the preview provides (weekly). */
export const TIMEFRAME = "1d";
export const OTHER_TIMEFRAME = "1w";
export const INSTRUMENT = "MOCK";

const weekly = new WeakMap<readonly ChartCandle[], Candle[]>();

/**
 * Options of every Stock context of the preview (Stock 1.2): `TIMEFRAME`, `INSTRUMENT`, and the weekly candles built
 * from the daily ones, for `LOAD_CANDLES("1w")` and the `timeframe` option of `LOAD_INDICATOR` / `LOAD_PATTERN`.
 */
function chartOptions(candles: readonly ChartCandle[]): StockContextOptions {
  let week = weekly.get(candles);
  if (week === undefined) weekly.set(candles, (week = aggregateCandles(candles, 7 * DAY).map(toCandle)));
  return {
    executor,
    timeframe: TIMEFRAME,
    instrument: INSTRUMENT,
    timeframeLength: DAY,
    timeframes: { [OTHER_TIMEFRAME]: { length: 7 * DAY, candles: week } },
  };
}

/**
 * Result of the preparation (Core 1.2): every validation error (or the error of the metadata reading, clean-up,
 * tokenization or parsing), the parsed sequences, the warnings and the metadata of the formula.
 */
export interface Diagnostics {
  readonly validationErrors: readonly IError[];
  /** Canonical form of every sequence, e.g. `SET($x,ADD(1,2))`; empty if the formula does not parse. */
  readonly sequences: readonly string[];
  /** Warnings of the preparation, in the order of their positions. */
  readonly warnings: readonly IWarning[];
  /** The metadata block of the formula, serialized; `undefined` without one. */
  readonly metadata: string | undefined;
}

/** A context of the kind, for the preparation (the `METADATA_CONTEXT` warning compares it with the metadata). */
function contextOf(kind: ContextKind, environment: Environment): Context {
  switch (kind) {
    case "default":
      return Context.create(environment);
    case "iteration":
      return IterationContext.create(environment, 1);
    case "time":
      return TimeContext.create(environment);
    case "stock":
      return StockContext.create(environment, [], executor);
    case "indicator":
      return IndicatorContext.create(environment, [], executor);
    case "pattern":
      return PatternContext.create(environment, [], executor);
    case "strategy":
      return StrategyContext.create(environment, [], executor);
  }
}

export function diagnose(formula: string, environment: Environment, kind: ContextKind): Diagnostics {
  const prepared = executor.prepare(formula, contextOf(kind, environment));
  if (prepared instanceof ExecutionResult) {
    return { validationErrors: prepared.validationErrors, sequences: [], warnings: [], metadata: undefined };
  }
  const metadata = (prepared.metadata.raw as IObject).isEmpty() ? undefined : serialize(prepared.metadata);
  return {
    validationErrors: [],
    sequences: prepared.sequences.map((s) => s.root.key),
    warnings: prepared.warnings,
    metadata,
  };
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
  const context = StockContext.create(environment, candles.map(toCandle), chartOptions(candles));
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
  const context = IndicatorContext.create(
    environment,
    candles.map(toCandle),
    chartOptions(candles),
    parametersOf(config.parameters),
  );
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

/** `PARAMETERS` of the Indicator or Pattern Context: the values of the parameters set in the preview. */
function parametersOf(parameters: readonly IndicatorParameterDraft[]): IObject {
  const unique = parameters.filter((p, i) => parameters.findIndex((q) => q.id === p.id) === i);
  return FlObject.from(unique.map((p) => [p.id, Value.number(p.value)] as const));
}

export interface PatternRun {
  readonly kind: "pattern";
  /** Indices of the candles where the pattern ends. */
  readonly indices: readonly number[];
  readonly error: IError | undefined;
}

/** Runs a pattern formula with `PARAMETERS` = the values of the parameters set in the preview. */
export function runPattern(setup: PatternSetup, candles: readonly ChartCandle[], environment: Environment): PatternRun {
  const context = PatternContext.create(
    environment,
    candles.map(toCandle),
    chartOptions(candles),
    parametersOf(setup.config.parameters),
  );
  const result = stockExecutor.executePattern(setup.formula, context);
  return { kind: "pattern", indices: result.indices, error: result.successful ? undefined : result.error };
}

/** The frames of a Time Context, executed by the output of the preview while it plays. */
export interface TimeRun {
  readonly kind: "time";
  readonly session: TimeSession;
}

/** Prepares the frames of a Time Context; the output of the preview executes them as time passes. */
export function runTime(formula: string, environment: Environment): TimeRun {
  return {
    kind: "time",
    session: new TimeSession(executor.createFrameRunner(formula, TimeContext.create(environment))),
  };
}

export interface StrategySetup {
  /** Key of the strategy in the preview. */
  readonly id: string;
  readonly formula: string;
}

/** `reason` and `checks` of a signal object (Stock 1.2). */
export interface SignalDetails {
  readonly reason: string | undefined;
  readonly checks: Readonly<Record<string, boolean>> | undefined;
  /** The other keys of the signal object, e.g. `stop`. */
  readonly extra: Readonly<Record<string, unknown>>;
}

export interface StrategySignals {
  readonly id: string;
  /** Result of every candle, from -1 to 1 (clamped); `null` where the formula failed. */
  readonly signals: readonly (number | null)[];
  /** The signal object of every candle; `undefined` where the formula returned a Number. */
  readonly details: readonly (SignalDetails | undefined)[];
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
    // PARAMETERS is completed with the defaults of the metadata of the strategy
    const context = StrategyContext.create(environment, candles.map(toCandle), chartOptions(candles));
    const result = stockExecutor.executeStrategy(formula, context, false);
    const signals = candles.map((_, i) => result.signals[i] ?? null);
    const details = candles.map((_, i) => detailsOf(result.signalObjects[i]));
    return { id, signals, details, error: result.successful ? undefined : result.error };
  });
  return { kind: "strategy", strategies };
}

function detailsOf(object: IObject | undefined): SignalDetails | undefined {
  if (object === undefined) return undefined;
  const plain = toJs(Value.object(object)) as Record<string, unknown>;
  const { signal: _signal, reason, checks, ...extra } = plain;
  return {
    reason: typeof reason === "string" ? reason : undefined,
    checks: checks as Record<string, boolean> | undefined,
    extra,
  };
}
