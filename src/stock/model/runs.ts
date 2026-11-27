/**
 * Runs of the formula models (FormuLang docs/implementation/formula_models.md, "Runs"): an instance executed over a
 * chart, once or live (continued when new candles close).
 *
 * @module
 */
import type { IError, IObject, IValue } from "../../abstractions/primitives.js";
import type { IEnvironment } from "../../abstractions/structures.js";
import {
  Errors,
  ExecutionResult,
  Executor,
  type IterationExecutionResult,
  type IterationState,
  type PreparedFormula,
  TypeNames,
} from "../../core/index.js";
import { type JsValue, toJs } from "../../facade/index.js";
import type { Candle } from "../candle.js";
import {
  IndicatorContext,
  PatternContext,
  type StockContext,
  type StockContextOptions,
  StrategyContext,
} from "../contexts.js";
import { indicatorResultsError, patternResultError, strategyResultError } from "../executor.js";

/** The chart of a run: the candles of the Stock Context, with its options (`TIMEFRAME`, other timeframes, ...). */
export interface Chart extends StockContextOptions {
  readonly candles: Iterable<Candle>;
  /** Indicator only: the `SOURCE` (one Number or `null` for every candle); `CLOSE` by default. */
  readonly source?: Iterable<number | null>;
}

/** Common properties of the result of a run, or of the part of a live run that a new candle added. */
export interface RunResult {
  /** Index of the first candle of the result (`0` for a whole run). */
  readonly from: number;
  /** `SUCCESS`, or the first Error of the iterations of the result (or of its preparation). */
  readonly error: IError;
  readonly successful: boolean;
}

/** The indicator series: for every output, one value for every candle of the result. */
export interface IndicatorSeries extends RunResult {
  readonly outputs: ReadonlyMap<string, readonly (number | null)[]>;
}

/** The pattern series: `true` for every candle of the result where the pattern is found. */
export interface PatternSeries extends RunResult {
  readonly matches: readonly boolean[];
}

/** A signal of a strategy (docs/implementation/formula_models.md, "Runs"). */
export interface Signal {
  /** Index of the candle, from `0`. */
  readonly index: number;
  /** `time` of the candle (Unix time in milliseconds), or `null`. */
  readonly time: number | null;
  /** The signal, from `-1` (`SELL`) to `1` (`BUY`), clamped. */
  readonly signal: number;
  /** `reason` of the signal object. */
  readonly reason?: string;
  /** `checks` of the signal object. */
  readonly checks?: Readonly<Record<string, boolean>>;
  /** The other keys of the signal object (e.g. `stop`, `target`), as JavaScript values. */
  readonly extra: Readonly<Record<string, JsValue>>;
}

/** The signals of a strategy: one for every candle of the result whose signal is not `NEUTRAL`. */
export interface StrategySignals extends RunResult {
  readonly signals: readonly Signal[];
  /** The result of every candle of the result (a Number, a signal object or an Error), e.g. to explain the checks. */
  readonly results: readonly IValue[];
}

/** What a live run needs of its instance. @internal */
export interface RunSource {
  readonly formula: string;
  readonly parameters: IObject;
  readonly outputs?: readonly string[] | undefined;
}

const success = (): IError => Errors.success();

/** The first Error among the values from `from`. */
function firstError(values: readonly IValue[], from: number): IError | undefined {
  for (let i = from; i < values.length; i++) {
    const value = values[i]!;
    if (value.type.base === TypeNames.Error && (value.raw as IError).isFailed()) return value.raw as IError;
  }
  return undefined;
}

/**
 * A run of an instance that can be continued (docs/implementation/formula_models.md, "Live runs"): {@link start}
 * executes the formula for the candles of the chart, {@link append} adds the candles that closed later and executes
 * only them, with the same results as a new run over all the candles. The state can be saved and restored.
 */
export abstract class LiveRun<TResult extends RunResult> {
  readonly context: StockContext;
  readonly #executor: Executor;
  readonly #source: RunSource;
  #prepared: PreparedFormula | ExecutionResult | undefined;
  #values: IValue[] = [];

  /** @internal */
  protected constructor(source: RunSource, context: StockContext, executor: Executor) {
    this.#source = source;
    this.context = context;
    this.#executor = executor;
  }

  /** The results of every executed candle. */
  get values(): readonly IValue[] {
    return this.#values;
  }

  /** Executes the formula for every candle of the chart, from the first one. */
  start(): TResult {
    const prepared = this.#prepare();
    if (prepared instanceof ExecutionResult) return this.failed(0, prepared.error);
    this.#values = [];
    return this.#collect(this.#executor.executeIterations(prepared, this.context, false), 0);
  }

  /** Adds the candles that closed after the last one, and executes the formula only for them. */
  append(candles: Iterable<Candle>): TResult {
    const from = this.#values.length;
    this.addCandles(candles);
    const prepared = this.#prepare();
    if (prepared instanceof ExecutionResult) return this.failed(from, prepared.error);
    if (from === 0) return this.start();
    return this.#collect(this.#executor.resumeIterations(prepared, this.context, false), from);
  }

  /** The state of the executed candles (`PREV`, `HISTORY`, the memory), e.g. to store it in the host application. */
  saveState(): IterationState {
    return this.context.saveState();
  }

  /**
   * Restores a saved state in a live run over the same candles; the next {@link append} continues after it.
   *
   * @throws {RangeError} if the state does not fit the candles.
   */
  restoreState(state: IterationState): void {
    this.context.restoreState(state);
    this.#values =
      state.completedIterations === 0 || state.lastResult === undefined ? [] : [...state.history, state.lastResult];
  }

  #prepare(): PreparedFormula | ExecutionResult {
    this.#prepared ??= this.#executor.prepare(this.#source.formula, this.context);
    return this.#prepared;
  }

  #collect(run: IterationExecutionResult, from: number): TResult {
    this.#values.push(...run.values);
    return this.convert(this.#values, from);
  }

  /** @internal Adds the candles to the context. */
  protected addCandles(candles: Iterable<Candle>): void {
    this.context.appendCandles(candles);
  }

  /** @internal The result of the candles from `from`, of all the results. */
  protected abstract convert(values: readonly IValue[], from: number): TResult;

  /** @internal The result of a formula that cannot be prepared. */
  protected abstract failed(from: number, error: IError): TResult;

  /** @internal */
  protected get source(): RunSource {
    return this.#source;
  }
}

/** A live run of an indicator instance. */
export class LiveIndicatorRun extends LiveRun<IndicatorSeries> {
  /** @internal */
  constructor(source: RunSource, environment: IEnvironment, chart: Chart) {
    const executor = chart.executor ?? Executor.create();
    super(
      source,
      IndicatorContext.create(environment, chart.candles, { ...chart, executor }, source.parameters, chart.source),
      executor,
    );
  }

  #source: Iterable<number | null> | undefined;

  /**
   * Adds the candles that closed after the last one, and executes the indicator only for them.
   *
   * @param source With a `SOURCE` of the chart: its values of the new candles (one for every candle).
   */
  override append(candles: Iterable<Candle>, source?: Iterable<number | null>): IndicatorSeries {
    this.#source = source;
    try {
      return super.append(candles);
    } finally {
      this.#source = undefined;
    }
  }

  protected override addCandles(candles: Iterable<Candle>): void {
    (this.context as IndicatorContext).appendCandles(candles, this.#source);
  }

  protected convert(values: readonly IValue[], from: number): IndicatorSeries {
    const error = firstError(values, from);
    if (error !== undefined) return this.failed(from, error);
    const problem = indicatorResultsError(values);
    if (problem !== undefined) return this.failed(from, problem.raw as IError);
    const outputs = new Map<string, (number | null)[]>();
    for (const key of outputKeys(values, this.source.outputs)) {
      outputs.set(
        key,
        values.slice(from).map((value) => {
          if (value.type.base === TypeNames.Number) return key === "value" ? (value.raw as number) : null;
          if (value.type.base !== TypeNames.Object) return null;
          const property = (value.raw as IObject).getProperty(key)?.getValue();
          return property?.type.base === TypeNames.Number ? (property.raw as number) : null;
        }),
      );
    }
    return { from, outputs, error: success(), successful: true };
  }

  protected failed(from: number, error: IError): IndicatorSeries {
    return { from, outputs: new Map(), error, successful: false };
  }
}

/**
 * The outputs of an indicator: the outputs of the definition, then the other keys of the results in their order
 * (`value` for Number results); without results other than `null`, the outputs of the definition or `value`.
 */
function outputKeys(values: readonly IValue[], declared: readonly string[] | undefined): string[] {
  const keys = [...(declared ?? [])];
  for (const value of values) {
    if (value.type.base === TypeNames.Number && !keys.includes("value")) keys.push("value");
    if (value.type.base === TypeNames.Object) {
      for (const key of (value.raw as IObject).keys) if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys.length > 0 ? keys : ["value"];
}

/** A live run of a pattern instance. */
export class LivePatternRun extends LiveRun<PatternSeries> {
  /** @internal */
  constructor(source: RunSource, environment: IEnvironment, chart: Chart) {
    const executor = chart.executor ?? Executor.create();
    super(
      source,
      PatternContext.create(environment, chart.candles, { ...chart, executor }, source.parameters),
      executor,
    );
  }

  protected convert(values: readonly IValue[], from: number): PatternSeries {
    const error = firstError(values, from);
    if (error !== undefined) return this.failed(from, error);
    const matches: boolean[] = [];
    for (let i = from; i < values.length; i++) {
      const value = values[i]!;
      if (value.type.base !== TypeNames.Boolean) return this.failed(from, patternResultError(i));
      matches.push(value.raw === true);
    }
    return { from, matches, error: success(), successful: true };
  }

  protected failed(from: number, error: IError): PatternSeries {
    return { from, matches: [], error, successful: false };
  }
}

/** A live run of a strategy instance. */
export class LiveStrategyRun extends LiveRun<StrategySignals> {
  /** @internal */
  constructor(source: RunSource, environment: IEnvironment, chart: Chart) {
    const executor = chart.executor ?? Executor.create();
    super(
      source,
      StrategyContext.create(environment, chart.candles, { ...chart, executor }, source.parameters),
      executor,
    );
  }

  protected convert(values: readonly IValue[], from: number): StrategySignals {
    const results = values.slice(from);
    const error = firstError(values, from);
    if (error !== undefined) return { from, signals: [], results, error, successful: false };
    const signals: Signal[] = [];
    for (let i = from; i < values.length; i++) {
      const signal = signalOf(values[i]!, i, this.context.candles[i]);
      if (signal === undefined) return { from, signals: [], results, error: strategyResultError(i), successful: false };
      if (signal !== null) signals.push(signal);
    }
    return { from, signals, results, error: success(), successful: true };
  }

  protected failed(from: number, error: IError): StrategySignals {
    return { from, signals: [], results: [], error, successful: false };
  }
}

const clamp = (signal: number): number => Math.min(Math.max(signal, StrategyContext.sell), StrategyContext.buy);

const timeOf = (candle: Candle | undefined): number | null => {
  const time = candle?.time;
  if (time === undefined || time === null) return null;
  return time instanceof Date ? time.getTime() : time;
};

/**
 * The signal of a result: `null` for `NEUTRAL`, `undefined` for a value that is neither a Number nor a signal object
 * (the signal object itself is checked in the finalization of the iteration).
 */
function signalOf(value: IValue, index: number, candle: Candle | undefined): Signal | null | undefined {
  const time = timeOf(candle);
  if (value.type.base === TypeNames.Number) {
    const signal = clamp(value.raw as number);
    return signal === 0 ? null : { index, time, signal, extra: {} };
  }
  if (value.type.base !== TypeNames.Object) return undefined;
  const object = value.raw as IObject;
  const signal = clamp(object.getProperty("signal")!.getValue().raw as number);
  if (signal === 0) return null;
  const extra: Record<string, JsValue> = {};
  let reason: string | undefined;
  let checks: Record<string, boolean> | undefined;
  for (const key of object.keys) {
    const property = object.getProperty(key)!.getValue();
    if (key === "signal") continue;
    if (key === "reason") reason = property.raw as string;
    else if (key === "checks") checks = toJs(property) as Record<string, boolean>;
    else extra[key] = toJs(property);
  }
  return {
    index,
    time,
    signal,
    ...(reason === undefined ? {} : { reason }),
    ...(checks === undefined ? {} : { checks }),
    extra,
  };
}
