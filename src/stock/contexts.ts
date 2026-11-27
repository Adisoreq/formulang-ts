import type { IObject, IValue } from "../abstractions/primitives.js";
import type { ContextType, IContext, IEnvironment } from "../abstractions/structures.js";
import { Errors, Executor, FlObject, IterationContext, TypeNames, Value } from "../core/index.js";
import { type Candle, candleToValue, isValidCandle } from "./candle.js";
import { STOCK_IDENTIFIER, StockFunctionNames } from "./names.js";

/** Candles of another timeframe, provided by the host application (docs/standards/stock/README.md, "Other timeframes"). */
export interface TimeframeCandles {
  /** Length of a candle of the timeframe, in milliseconds. */
  readonly length: number;
  /**
   * The candles, ordered from the oldest, closed at the end of the last candle of the main chart. Every candle needs
   * its `time` (its opening time).
   */
  readonly candles: Iterable<Candle>;
}

/**
 * Other timeframes of a Stock Context: by name, or a function that the library calls the first time a formula uses a
 * timeframe (`undefined`: the timeframe is not provided, a `NOT_SUPPORTED_ERROR`).
 */
export type TimeframeSource =
  Readonly<Record<string, TimeframeCandles>> | ((timeframe: string) => TimeframeCandles | undefined);

/** Options of a Stock Context (since `stock-1.2`). */
export interface StockContextOptions {
  /** Executor of the formulas loaded with `LOAD_INDICATOR` and `LOAD_PATTERN`. */
  readonly executor?: Executor;
  /** The `TIMEFRAME` constant: the timeframe of the candles (e.g. `"15m"`), or `null` (default). */
  readonly timeframe?: string | null;
  /** The `INSTRUMENT` constant: the instrument of the candles (e.g. `"EURUSD"`), or `null` (default). */
  readonly instrument?: string | null;
  /** Length of a candle of the main chart, in milliseconds; needed with {@link timeframes}. */
  readonly timeframeLength?: number;
  /** Candles of other timeframes, for `LOAD_CANDLES` and the `timeframe` option of `LOAD_INDICATOR` and `LOAD_PATTERN`. */
  readonly timeframes?: TimeframeSource;
}

/** The candles of a timeframe that the host application provides, shared by every series of one Stock Context. */
class Timeframes {
  readonly #loaded = new Map<string, StockSeries | undefined>();

  constructor(private readonly source: TimeframeSource | undefined) {}

  get(name: string, parent: StockSeries): StockSeries | undefined {
    if (this.#loaded.has(name)) return this.#loaded.get(name);
    const data = typeof this.source === "function" ? this.source(name) : this.#own(name);
    let series: StockSeries | undefined;
    if (data !== undefined) {
      if (!(Number.isFinite(data.length) && data.length > 0)) {
        throw new RangeError(`The length of the timeframe "${name}" must be a positive number of milliseconds.`);
      }
      series = new StockSeries(data.candles, {
        executor: parent.executor,
        timeframe: name,
        instrument: parent.instrument,
        timeframeLength: data.length,
        shared: this,
      });
      series.candles.forEach((candle, i) => {
        if (typeof candle.time !== "number" && !(candle.time instanceof Date)) {
          throw new RangeError(`Candle ${i} of the timeframe "${name}" has no time.`);
        }
      });
    }
    this.#loaded.set(name, series);
    return series;
  }

  register(name: string, series: StockSeries): void {
    this.#loaded.set(name, series);
  }

  /** Forgets the loaded timeframes: the host application gives their candles again (new candles closed). */
  reload(): void {
    this.#loaded.clear();
  }

  #own(name: string): TimeframeCandles | undefined {
    const record = this.source as Readonly<Record<string, TimeframeCandles>> | undefined;
    return record !== undefined && Object.hasOwn(record, name) ? record[name] : undefined;
  }
}

/** @internal Options of a {@link StockSeries}. */
interface SeriesOptions extends StockContextOptions {
  readonly shared?: Timeframes;
}

const timeOf = (candle: Candle): number | null =>
  candle.time === undefined || candle.time === null
    ? null
    : candle.time instanceof Date
      ? candle.time.getTime()
      : candle.time;

/**
 * Candles shared by a Stock Context and every child context created by `LOAD_INDICATOR` or `LOAD_PATTERN`, with
 * the computed indicator and pattern series, which are deterministic
 * (docs/standards/stock/functions/LOAD_INDICATOR.md, "Performance"), and the candles of the other timeframes.
 *
 * @internal
 */
export class StockSeries {
  readonly #stored = new Map<string, IValue>();
  readonly #sourceKeys = new WeakMap<object, string>();
  readonly #alignments = new Map<StockSeries, Int32Array>();
  readonly #timeframes: Timeframes;
  readonly executor: Executor;
  readonly timeframe: string | null;
  readonly instrument: string | null;
  readonly timeframeLength: number | undefined;
  candles: readonly Candle[] = [];
  candlesValue!: IValue;
  open!: IValue;
  high!: IValue;
  low!: IValue;
  close!: IValue;
  volume!: IValue;
  time!: IValue;

  /** @throws {RangeError} if a candle does not meet the requirements of `Stock.Candle`. */
  constructor(candles: Iterable<Candle>, options: SeriesOptions = {}) {
    this.executor = options.executor ?? Executor.create();
    this.timeframe = options.timeframe ?? null;
    this.instrument = options.instrument ?? null;
    this.timeframeLength = options.timeframeLength;
    if (options.shared === undefined) {
      if (options.timeframes !== undefined && this.timeframeLength === undefined) {
        throw new RangeError("The length of the main timeframe (timeframeLength) is needed with other timeframes.");
      }
      if (this.timeframeLength !== undefined && !(Number.isFinite(this.timeframeLength) && this.timeframeLength > 0)) {
        throw new RangeError("The length of the main timeframe must be a positive number of milliseconds.");
      }
    }
    this.#timeframes = options.shared ?? new Timeframes(options.timeframes);
    if (options.shared === undefined && this.timeframe !== null) this.#timeframes.register(this.timeframe, this);
    this.#setCandles([...candles]);
  }

  #setCandles(candles: Candle[]): void {
    candles.forEach((candle, i) => {
      if (!isValidCandle(candle)) throw new RangeError(`Candle ${i} does not meet the requirements of Stock.Candle.`);
    });
    this.candles = Object.freeze(candles);
    this.candlesValue = Value.array(this.candles.map(candleToValue), "CANDLES");
    const candleValues = this.candlesValue.raw as readonly IValue[];
    const attribute = (key: string, name: string): IValue =>
      Value.array(
        candleValues.map((candle) => (candle.raw as IObject).getProperty(key)!.getValue()),
        name,
      );
    this.open = attribute("open", "OPEN");
    this.high = attribute("high", "HIGH");
    this.low = attribute("low", "LOW");
    this.close = attribute("close", "CLOSE");
    this.volume = attribute("volume", "VOLUME");
    this.time = attribute("time", "TIME");
  }

  /**
   * Adds candles to the end of the chart. The stored series and the other timeframes are computed again, because
   * their lengths and their closed candles change.
   */
  append(candles: Iterable<Candle>): void {
    this.#setCandles([...this.candles, ...candles]);
    this.#stored.clear();
    this.#alignments.clear();
    this.#timeframes.reload();
    if (this.timeframe !== null) this.#timeframes.register(this.timeframe, this);
  }

  get count(): number {
    return this.candles.length;
  }

  getStored(key: string): IValue | undefined {
    return this.#stored.get(key);
  }

  store(key: string, series: IValue): void {
    this.#stored.set(key, series);
  }

  /** The series of the candles of a timeframe, or `undefined` if the host application does not provide it. */
  otherTimeframe(name: string): StockSeries | undefined {
    if (name === this.timeframe) return this;
    return this.#timeframes.get(name, this);
  }

  /**
   * For every candle `k` of this series, the position of the last candle of `other` closed at the candle `k`
   * (docs/standards/stock/README.md, "Closed candles"), or `-1` if there is none. A candle of `other` with the time
   * `t` is closed at `k` if `t + L <= TIME[k] + L₀`.
   */
  alignment(other: StockSeries): Int32Array {
    let known = this.#alignments.get(other);
    if (known !== undefined) return known;
    known = new Int32Array(this.count);
    if (other === this) {
      for (let k = 0; k < known.length; k++) known[k] = k;
    } else {
      const mainLength = this.timeframeLength;
      const length = other.timeframeLength!;
      if (mainLength === undefined) {
        throw new RangeError("The length of the main timeframe (timeframeLength) is needed with other timeframes.");
      }
      const otherTimes = other.candles.map((candle) => timeOf(candle)!);
      let j = -1;
      for (let k = 0; k < known.length; k++) {
        const time = timeOf(this.candles[k]!);
        if (time === null) {
          known[k] = -1;
          continue;
        }
        while (j + 1 < otherTimes.length && otherTimes[j + 1]! + length <= time + mainLength) j++;
        known[k] = j;
      }
    }
    this.#alignments.set(other, known);
    return known;
  }

  readonly #validSources = new WeakSet<object>();

  /**
   * Whether every element of a source is a Number or `null`. A source is an immutable array, so the check runs once
   * for every array (`CLOSE` never), not in every iteration of the caller.
   */
  isValidSource(source: readonly IValue[]): boolean {
    if (source === this.close.raw || this.#validSources.has(source)) return true;
    const valid = source.every((e) => e.type.base === TypeNames.Number || e.type.base === TypeNames.Null);
    if (valid) this.#validSources.add(source);
    return valid;
  }

  /**
   * Key of a source array in the indicator cache: `CLOSE`, or a key of the elements. Sources with the same elements
   * get the same key, also when the formula builds a new array in every iteration (e.g. with `MAP`). The elements
   * (Numbers and `null`, checked by the caller) are compared as numbers instead of being serialized to text.
   */
  sourceKey(source: readonly IValue[]): string {
    if (source === this.close.raw) return "CLOSE";
    let key = this.#sourceKeys.get(source);
    if (key === undefined) {
      key = this.#contentKey(source);
      this.#sourceKeys.set(source, key);
    }
    return key;
  }

  readonly #contents = new Map<number, { readonly elements: readonly (number | null)[]; readonly key: string }[]>();
  #sourceCount = 0;

  #contentKey(source: readonly IValue[]): string {
    const elements = source.map((e) => (typeof e.raw === "number" ? e.raw : null));
    let hash = elements.length;
    for (const e of elements) hash = (Math.imul(hash, 31) + (e === null ? 7 : Math.floor(e * 1e6) | 0)) | 0;
    let candidates = this.#contents.get(hash);
    if (candidates === undefined) this.#contents.set(hash, (candidates = []));
    for (const known of candidates) {
      if (known.elements.length === elements.length && known.elements.every((e, i) => e === elements[i])) {
        return known.key;
      }
    }
    const key = `SOURCE#${this.#sourceCount++}`;
    candidates.push({ elements, key });
    return key;
  }
}

const STOCK_TYPE_NAMES: readonly string[] = Object.freeze(["Stock", "Iteration", "Default"]);
const typeNames = (name: string): readonly string[] => Object.freeze([name, ...STOCK_TYPE_NAMES]);
const INDICATOR_TYPE_NAMES = typeNames("Stock.Indicator");
const PATTERN_TYPE_NAMES = typeNames("Stock.Pattern");
const STRATEGY_TYPE_NAMES = typeNames("Stock.Strategy");

const textOrNull = (value: string | null, name: string): IValue =>
  value === null ? Value.null(name) : Value.text(value);

/**
 * Stock Context (docs/standards/stock/README.md, "Context structure"): an Iteration Context over the candles,
 * with the constants `CANDLES`, `OPEN`, `HIGH`, `LOW`, `CLOSE`, `VOLUME` and `TIME`, and since `stock-1.2`
 * `TIMEFRAME` and `INSTRUMENT`. `I` is the current candle.
 */
export class StockContext extends IterationContext {
  /** @internal */
  readonly series: StockSeries;

  /** @internal Key of the computed indicator or pattern; `undefined` if the host application created this context. */
  readonly formulaKey: string | undefined;
  /** Context that called `LOAD_INDICATOR` or `LOAD_PATTERN`, or `undefined` if the host application created it. */
  readonly caller: IContext | undefined;

  protected constructor(environment: IEnvironment, series: StockSeries, formulaKey?: string, caller?: IContext) {
    super(environment, series.count);
    this.series = series;
    this.formulaKey = formulaKey;
    this.caller = caller;
  }

  /**
   * @param options The executor of the formulas loaded with `LOAD_INDICATOR` and `LOAD_PATTERN`, or the options of
   * the context (`TIMEFRAME`, `INSTRUMENT`, other timeframes).
   * @throws {RangeError} if a candle does not meet the requirements of `Stock.Candle`.
   */
  static override create(
    environment: IEnvironment,
    candles: CandlesArgument = [],
    options?: Executor | StockContextOptions,
  ): StockContext {
    return prepare(new StockContext(environment, createSeries(candles, options)));
  }

  get candles(): readonly Candle[] {
    return this.series.candles;
  }

  /** The `TIMEFRAME` constant, or `null`. */
  get timeframe(): string | null {
    return this.series.timeframe;
  }

  /** The `INSTRUMENT` constant, or `null`. */
  get instrument(): string | null {
    return this.series.instrument;
  }

  override get contextTypeNames(): readonly string[] {
    return STOCK_TYPE_NAMES;
  }

  /**
   * Adds candles that closed after the last one (e.g. on a live chart), so the iterations can be resumed with
   * `Executor.resumeIterations` (docs/core/context.md, "Resumed iterations"). The indicators and patterns loaded by
   * the formula are computed again.
   *
   * @throws {RangeError} if a candle does not meet the requirements of `Stock.Candle`.
   * @throws {Error} for a child context created by `LOAD_INDICATOR` or `LOAD_PATTERN`.
   */
  appendCandles(candles: Iterable<Candle>): void {
    if (this.caller !== undefined) throw new Error("The candles of a child context cannot be changed.");
    this.series.append(candles);
    this.resize(this.series.count);
    this.#setSeriesConstants();
  }

  /** The count of a Stock Context follows its candles: use {@link appendCandles}. */
  override extend(_count: number): void {
    throw new Error("The candles of a Stock Context are added with appendCandles.");
  }

  protected override loadContextData(): void {
    super.loadContextData();
    this.#setSeriesConstants();
    this.setConstant("TIMEFRAME", textOrNull(this.series.timeframe, "TIMEFRAME"));
    this.setConstant("INSTRUMENT", textOrNull(this.series.instrument, "INSTRUMENT"));
  }

  #setSeriesConstants(): void {
    this.setConstant("CANDLES", this.series.candlesValue);
    this.setConstant("OPEN", this.series.open);
    this.setConstant("HIGH", this.series.high);
    this.setConstant("LOW", this.series.low);
    this.setConstant("CLOSE", this.series.close);
    this.setConstant("VOLUME", this.series.volume);
    this.setConstant("TIME", this.series.time);
  }

  /**
   * Computes an indicator of the registry for these candles, like `LOAD_INDICATOR(id, parameters, source)`.
   *
   * @param parameters Parameters of the indicator; missing ones have their default values.
   * @param source Input series (`N` Numbers or `null` values), `CLOSE` by default, or an Object of options
   * (`source`, `timeframe`, `output`, `align`).
   * @returns An Array, or an Error.
   */
  computeIndicator(id: string, parameters?: IObject, source?: IValue): IValue {
    return this.#invoke(StockFunctionNames.loadIndicator, [
      Value.text(id),
      Value.object(parameters ?? new FlObject()),
      source ?? this.series.close,
    ]);
  }

  /**
   * Checks a pattern of the registry for these candles, like `LOAD_PATTERN(id, parameters, options)`.
   *
   * @param parameters Parameters of the pattern; missing ones have their default values.
   * @param options An Object of options (`timeframe`, `align`).
   * @returns An Array of Booleans, or an Error.
   */
  computePattern(id: string, parameters?: IObject, options?: IObject): IValue {
    const args = [Value.text(id), Value.object(parameters ?? new FlObject())];
    if (options !== undefined) args.push(Value.object(options));
    return this.#invoke(StockFunctionNames.loadPattern, args);
  }

  #invoke(functionName: string, args: IValue[]): IValue {
    const fn = this.environment.getFunction(functionName);
    if (fn === undefined) {
      return Value.error(Errors.unknownSymbolError(`The environment does not support ${STOCK_IDENTIFIER}.`));
    }
    return fn.invoke(args, this);
  }
}

/**
 * Candles of a Stock Context. (`number` and `ContextType` are accepted by the type only to stay compatible with
 * `IterationContext.create`; a Stock Context is always created from candles.)
 */
export type CandlesArgument = Iterable<Candle> | number | ContextType;

function asCandles(candles: CandlesArgument): Iterable<Candle> {
  if (typeof candles !== "object") throw new TypeError("A Stock Context is created from candles.");
  return candles;
}

function createSeries(candles: CandlesArgument, options: Executor | StockContextOptions | undefined): StockSeries {
  return new StockSeries(asCandles(candles), options instanceof Executor ? { executor: options } : options);
}

function prepare<T extends StockContext>(context: T): T {
  context.preExecute();
  return context;
}

const parametersValue = (parameters: IObject | undefined): IValue =>
  Value.object(parameters ?? new FlObject(), undefined, "PARAMETERS");

/** Indicator Context: a Stock Context with the constants `PARAMETERS` and `SOURCE`. */
export class IndicatorContext extends StockContext {
  #source: IValue;

  /** @internal */
  constructor(
    environment: IEnvironment,
    series: StockSeries,
    readonly parameters: IValue,
    source: IValue,
    indicatorKey: string | undefined,
    caller: IContext | undefined,
  ) {
    super(environment, series, indicatorKey, caller);
    this.#source = source;
  }

  /** The `SOURCE` constant. */
  get source(): IValue {
    return this.#source;
  }

  /**
   * Adds candles, as {@link StockContext.appendCandles}. `SOURCE` follows `CLOSE`; a `SOURCE` given by the host
   * application gets the values of the new candles from `source` (one Number or `null` for every new candle).
   *
   * @throws {RangeError} if a `SOURCE` given by the host application gets no values, or another number of them.
   */
  override appendCandles(candles: Iterable<Candle>, source?: Iterable<number | null>): void {
    const added = [...candles];
    const followsClose = this.#source === this.series.close;
    const values = source === undefined ? undefined : [...source];
    if (!followsClose && values?.length !== added.length) {
      throw new RangeError("The SOURCE of the context needs one value for every new candle.");
    }
    super.appendCandles(added);
    this.#source = followsClose
      ? this.series.close
      : Value.array(
          [
            ...(this.#source.raw as readonly IValue[]),
            ...values!.map((v) => (v === null ? Value.null() : Value.number(v))),
          ],
          "SOURCE",
        );
    this.setConstant("SOURCE", this.#source);
  }

  /**
   * An Indicator Context for the host application, e.g. to run an indicator formula directly.
   *
   * @param options The executor of the loaded formulas, or the options of the context.
   * @param source Values of `SOURCE` (`CLOSE` by default).
   */
  static override create(
    environment: IEnvironment,
    candles: CandlesArgument = [],
    options?: Executor | StockContextOptions,
    parameters?: IObject,
    source?: Iterable<number | null>,
  ): IndicatorContext {
    const series = createSeries(candles, options);
    const sourceValue =
      source === undefined
        ? series.close
        : Value.array(
            [...source].map((v) => (v === null ? Value.null() : Value.number(v))),
            "SOURCE",
          );
    return prepare(
      new IndicatorContext(environment, series, parametersValue(parameters), sourceValue, undefined, undefined),
    );
  }

  override get contextTypeNames(): readonly string[] {
    return INDICATOR_TYPE_NAMES;
  }

  protected override loadContextData(): void {
    super.loadContextData();
    this.setConstant("PARAMETERS", this.parameters);
    this.setConstant("SOURCE", this.#source);
  }
}

/**
 * Pattern Context: the formula returns `true` if the pattern is found at the current candle. Constant:
 * `PARAMETERS`.
 */
export class PatternContext extends StockContext {
  /** @internal */
  constructor(
    environment: IEnvironment,
    series: StockSeries,
    readonly parameters: IValue,
    patternKey: string | undefined,
    caller: IContext | undefined,
  ) {
    super(environment, series, patternKey, caller);
  }

  /**
   * A Pattern Context for the host application.
   *
   * @param options The executor of the loaded formulas, or the options of the context.
   * @param parameters The `PARAMETERS` object (not completed with default values); `{ }` by default.
   */
  static override create(
    environment: IEnvironment,
    candles: CandlesArgument = [],
    options?: Executor | StockContextOptions,
    parameters?: IObject,
  ): PatternContext {
    const series = createSeries(candles, options);
    return prepare(new PatternContext(environment, series, parametersValue(parameters), undefined, undefined));
  }

  override get contextTypeNames(): readonly string[] {
    return PATTERN_TYPE_NAMES;
  }

  protected override loadContextData(): void {
    super.loadContextData();
    this.setConstant("PARAMETERS", this.parameters);
  }
}

/**
 * Strategy Context: the formula returns a signal from `SELL` (-1) to `BUY` (1), or since `stock-1.2` a signal object
 * `{ signal, reason?, checks?, ... }`; constants `BUY`, `NEUTRAL`, `SELL` and `PARAMETERS`.
 */
export class StrategyContext extends StockContext {
  static readonly buy = 1;
  static readonly neutral = 0;
  static readonly sell = -1;

  #parameters: IValue;

  /** @internal */
  constructor(environment: IEnvironment, series: StockSeries, parameters: IValue) {
    super(environment, series);
    this.#parameters = parameters;
  }

  /**
   * @param options The executor of the loaded formulas, or the options of the context.
   * @param parameters The `PARAMETERS` object (since `stock-1.2`); `{ }` by default. Complete it with the `default`
   * values of the metadata with {@link completeParameters}.
   */
  static override create(
    environment: IEnvironment,
    candles: CandlesArgument = [],
    options?: Executor | StockContextOptions,
    parameters?: IObject,
  ): StrategyContext {
    return prepare(new StrategyContext(environment, createSeries(candles, options), parametersValue(parameters)));
  }

  /** The `PARAMETERS` constant. */
  get parameters(): IValue {
    return this.#parameters;
  }

  override get contextTypeNames(): readonly string[] {
    return STRATEGY_TYPE_NAMES;
  }

  /**
   * Completes `PARAMETERS` with the `default` values of the `parameters` of the metadata of the strategy
   * (docs/standards/stock/README.md, "Strategy Context"): a parameter that the host application did not give gets
   * its default value. A parameter without a default stays missing.
   */
  completeParameters(metadata: IValue): void {
    const defaults = parameterDefaults(metadata);
    const given = this.#parameters.raw as IObject;
    const missing = [...defaults].filter(([name]) => !given.hasKey(name));
    if (missing.length === 0) return;
    const completed = new FlObject();
    for (const key of given.keys) completed.initVariable(key, given.getProperty(key)!.getValue());
    for (const [name, value] of missing) if (value !== undefined) completed.initVariable(name, value);
    this.#parameters = parametersValue(completed);
    this.setConstant("PARAMETERS", this.#parameters);
  }

  protected override loadContextData(): void {
    super.loadContextData();
    this.setConstant("BUY", Value.number(StrategyContext.buy, "BUY"));
    this.setConstant("NEUTRAL", Value.number(StrategyContext.neutral, "NEUTRAL"));
    this.setConstant("SELL", Value.number(StrategyContext.sell, "SELL"));
    this.setConstant("PARAMETERS", this.#parameters);
  }

  /**
   * An Object result is a signal object: it needs a Number `signal`; `reason` is a Text and `checks` an Object of
   * Booleans. Another Object is an `OPERATION_ERROR` of the iteration. Other results are checked by `StockExecutor`.
   */
  override finalizeResult(value: IValue): IValue {
    if (value.type.base !== TypeNames.Object) return value;
    const problem = signalObjectProblem(value.raw as IObject);
    return problem === undefined ? value : Value.error(Errors.operationError(problem));
  }
}

/** Why an Object is not a signal object, or `undefined` if it is one. */
export function signalObjectProblem(object: IObject): string | undefined {
  const read = (key: string): IValue | undefined => object.getProperty(key)?.getValue();
  const signal = read("signal");
  if (signal === undefined) return 'A signal object must have the key "signal".';
  if (signal.type.base !== TypeNames.Number) return 'The "signal" of a signal object must be a Number.';
  const reason = read("reason");
  if (reason !== undefined && reason.type.base !== TypeNames.Text) {
    return 'The "reason" of a signal object must be a Text.';
  }
  const checks = read("checks");
  if (checks !== undefined) {
    const valid =
      checks.type.base === TypeNames.Object &&
      (checks.raw as IObject).keys.every(
        (key) => (checks.raw as IObject).getProperty(key)!.getValue().type.base === TypeNames.Boolean,
      );
    if (!valid) return 'The "checks" of a signal object must be an Object of Boolean values.';
  }
  return undefined;
}

/**
 * The parameters of the metadata of a formula with their `default` values (`undefined` without a default), in the
 * order of the metadata.
 */
export function parameterDefaults(metadata: IValue): Map<string, IValue | undefined> {
  const defaults = new Map<string, IValue | undefined>();
  if (metadata.type.base !== TypeNames.Object) return defaults;
  const parameters = (metadata.raw as IObject).getProperty("parameters")?.getValue();
  if (parameters?.type.base !== TypeNames.Object) return defaults;
  const object = parameters.raw as IObject;
  for (const name of object.keys) {
    const description = object.getProperty(name)!.getValue();
    const value =
      description.type.base === TypeNames.Object
        ? (description.raw as IObject).getProperty("default")?.getValue()
        : undefined;
    defaults.set(name, value);
  }
  return defaults;
}
