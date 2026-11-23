import type { IObject, IValue } from "../abstractions/primitives.js";
import type { ContextType, IContext, IEnvironment } from "../abstractions/structures.js";
import { Errors, Executor, FlObject, IterationContext, Value, arrayToString } from "../core/index.js";
import { type Candle, candleToValue, isValidCandle } from "./candle.js";
import { STOCK_IDENTIFIER, StockFunctionNames } from "./names.js";

/**
 * Candles shared by a Stock Context and every child context created by `LOAD_INDICATOR` or `LOAD_PATTERN`, with
 * the computed indicator and pattern series, which are deterministic
 * (docs/standards/stock/functions/LOAD_INDICATOR.md, "Performance").
 *
 * @internal
 */
export class StockSeries {
  readonly #stored = new Map<string, IValue>();
  readonly #sourceKeys = new WeakMap<object, string>();
  readonly candles: readonly Candle[];
  readonly executor: Executor;
  readonly candlesValue: IValue;
  readonly open: IValue;
  readonly high: IValue;
  readonly low: IValue;
  readonly close: IValue;
  readonly volume: IValue;
  readonly time: IValue;

  /** @throws {RangeError} if a candle does not meet the requirements of `Stock.Candle`. */
  constructor(candles: Iterable<Candle>, executor?: Executor) {
    this.candles = Object.freeze([...candles]);
    this.executor = executor ?? Executor.create();
    this.candles.forEach((candle, i) => {
      if (!isValidCandle(candle)) throw new RangeError(`Candle ${i} does not meet the requirements of Stock.Candle.`);
    });
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

  get count(): number {
    return this.candles.length;
  }

  getStored(key: string): IValue | undefined {
    return this.#stored.get(key);
  }

  store(key: string, series: IValue): void {
    this.#stored.set(key, series);
  }

  /** Key of a source array in the indicator cache: `CLOSE`, or the serialized array. */
  sourceKey(source: readonly IValue[]): string {
    if (source === this.close.raw) return "CLOSE";
    let key = this.#sourceKeys.get(source);
    if (key === undefined) {
      key = arrayToString(source);
      this.#sourceKeys.set(source, key);
    }
    return key;
  }
}

/**
 * Stock Context (docs/standards/stock/README.md, "Context structure"): an Iteration Context over the candles,
 * with the constants `CANDLES`, `OPEN`, `HIGH`, `LOW`, `CLOSE`, `VOLUME` and `TIME`. `I` is the current candle.
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
   * @param executor Executor of the formulas loaded with `LOAD_INDICATOR` and `LOAD_PATTERN`.
   * @throws {RangeError} if a candle does not meet the requirements of `Stock.Candle`.
   */
  static override create(environment: IEnvironment, candles: CandlesArgument = [], executor?: Executor): StockContext {
    return prepare(new StockContext(environment, new StockSeries(asCandles(candles), executor)));
  }

  get candles(): readonly Candle[] {
    return this.series.candles;
  }

  protected override loadContextData(): void {
    super.loadContextData();
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
   * @param source Input series (`N` Numbers or `null` values); `CLOSE` by default.
   * @returns An Array of `N` values, or an Error.
   */
  computeIndicator(id: string, parameters?: IObject, source?: IValue): IValue {
    return this.#invoke(StockFunctionNames.loadIndicator, [
      Value.text(id),
      Value.object(parameters ?? new FlObject()),
      source ?? this.series.close,
    ]);
  }

  /**
   * Checks a pattern of the registry for these candles, like `LOAD_PATTERN(id, parameters)`.
   *
   * @param parameters Parameters of the pattern; missing ones have their default values.
   * @returns An Array of `N` Booleans, or an Error.
   */
  computePattern(id: string, parameters?: IObject): IValue {
    return this.#invoke(StockFunctionNames.loadPattern, [Value.text(id), Value.object(parameters ?? new FlObject())]);
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

function prepare<T extends StockContext>(context: T): T {
  context.preExecute();
  return context;
}

/** Indicator Context: a Stock Context with the constants `PARAMETERS` and `SOURCE`. */
export class IndicatorContext extends StockContext {
  /** @internal */
  constructor(
    environment: IEnvironment,
    series: StockSeries,
    readonly parameters: IValue,
    readonly source: IValue,
    indicatorKey: string | undefined,
    caller: IContext | undefined,
  ) {
    super(environment, series, indicatorKey, caller);
  }

  /**
   * An Indicator Context for the host application, e.g. to run an indicator formula directly.
   *
   * @param source Values of `SOURCE` (`CLOSE` by default).
   */
  static override create(
    environment: IEnvironment,
    candles: CandlesArgument = [],
    executor?: Executor,
    parameters?: IObject,
    source?: Iterable<number | null>,
  ): IndicatorContext {
    const series = new StockSeries(asCandles(candles), executor);
    const sourceValue =
      source === undefined
        ? series.close
        : Value.array(
            [...source].map((v) => (v === null ? Value.null() : Value.number(v))),
            "SOURCE",
          );
    return prepare(
      new IndicatorContext(
        environment,
        series,
        Value.object(parameters ?? new FlObject(), undefined, "PARAMETERS"),
        sourceValue,
        undefined,
        undefined,
      ),
    );
  }

  protected override loadContextData(): void {
    super.loadContextData();
    this.setConstant("PARAMETERS", this.parameters);
    this.setConstant("SOURCE", this.source);
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
   * @param parameters The `PARAMETERS` object (not completed with default values); `{ }` by default.
   */
  static override create(
    environment: IEnvironment,
    candles: CandlesArgument = [],
    executor?: Executor,
    parameters?: IObject,
  ): PatternContext {
    const series = new StockSeries(asCandles(candles), executor);
    return prepare(
      new PatternContext(
        environment,
        series,
        Value.object(parameters ?? new FlObject(), undefined, "PARAMETERS"),
        undefined,
        undefined,
      ),
    );
  }

  protected override loadContextData(): void {
    super.loadContextData();
    this.setConstant("PARAMETERS", this.parameters);
  }
}

/** Strategy Context: the formula returns a signal from `SELL` (-1) to `BUY` (1); constants `BUY`, `NEUTRAL`, `SELL`. */
export class StrategyContext extends StockContext {
  static readonly buy = 1;
  static readonly neutral = 0;
  static readonly sell = -1;

  static override create(
    environment: IEnvironment,
    candles: CandlesArgument = [],
    executor?: Executor,
  ): StrategyContext {
    return prepare(new StrategyContext(environment, new StockSeries(asCandles(candles), executor)));
  }

  protected override loadContextData(): void {
    super.loadContextData();
    this.setConstant("BUY", Value.number(StrategyContext.buy, "BUY"));
    this.setConstant("NEUTRAL", Value.number(StrategyContext.neutral, "NEUTRAL"));
    this.setConstant("SELL", Value.number(StrategyContext.sell, "SELL"));
  }
}
