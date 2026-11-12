import type { IObject, IValue } from "../abstractions/primitives.js";
import type { ContextType, IContext, IEnvironment } from "../abstractions/structures.js";
import { Errors, Executor, FlObject, IterationContext, Value, arrayToString } from "../core/index.js";
import { type Candle, candleToValue, isValidCandle } from "./candle.js";

/** Name of the indicator function. */
export const INDICATOR_FUNCTION = "INDICATOR";

/**
 * Candles shared by a Stock Context and the Indicator Contexts created for it, with the computed indicators.
 *
 * @internal
 */
export class StockSeries {
  readonly #indicators = new Map<string, IValue>();
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

  getIndicator(key: string): IValue | undefined {
    return this.#indicators.get(key);
  }

  storeIndicator(key: string, series: IValue): void {
    this.#indicators.set(key, series);
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

  protected constructor(environment: IEnvironment, series: StockSeries) {
    super(environment, series.count);
    this.series = series;
  }

  /**
   * @param executor Executor of the indicators computed by `INDICATOR`.
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

  /** Computes an indicator for the candles of this context, like `INDICATOR(id, parameters, source)`. */
  computeIndicator(id: string, parameters?: IObject, source?: IValue): IValue {
    const indicator = this.environment.getFunction(INDICATOR_FUNCTION);
    if (indicator === undefined) {
      return Value.error(Errors.unknownSymbolError("The environment does not support stock-0.1."));
    }
    return indicator.invoke(
      [Value.text(id), Value.object(parameters ?? new FlObject()), source ?? this.series.close],
      this,
    );
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
    /** @internal Key of the indicator in the cache of the series. */
    readonly indicatorKey: string | undefined,
    /** Context that called `INDICATOR`. */
    readonly caller: IContext | undefined,
  ) {
    super(environment, series);
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

/** Pattern Context: the formula returns a Boolean for every candle. */
export class PatternContext extends StockContext {
  static override create(
    environment: IEnvironment,
    candles: CandlesArgument = [],
    executor?: Executor,
  ): PatternContext {
    return prepare(new PatternContext(environment, new StockSeries(asCandles(candles), executor)));
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
