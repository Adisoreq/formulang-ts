import { describe, expect, it } from "vitest";
import { Environment, Executor, FlObject, type IObject, type IValue, TypeNames, Value } from "../../src/index.js";
import type { IndicatorRegistry } from "../../src/stock/index.js";
import {
  type Candle,
  IndicatorContext,
  PatternContext,
  StockContext,
  StockExecutor,
  StockStandard,
  StrategyContext,
  getIndicatorRegistry,
  registerStock,
} from "../../src/stock/index.js";
import { expectResult } from "../helpers.js";
import {
  candle_Examples,
  candle_Values,
  indicator_Examples,
  indicator_ResultThatIsNotAllowed,
  require,
} from "./data/Stock.cases.js";

// docs/standards/stock/examples/indicator_examples.md
const SMA = `
$period = PARAMETERS.period

# The last \`period\` values of the source, fewer at the beginning of the chart
$window = RANGE(SOURCE, MAX(I - $period + 1, @array_indexing), I)
$complete = AND(LEN($window) == $period, LEN(FILTER($window, (e) => ISNULL(e))) == 0)

IF($complete, AVG($window), null)`;

const EMA = `
$period = PARAMETERS.period
$alpha = 2 / ($period + 1)
$x = SOURCE[I]

$window = RANGE(SOURCE, MAX(I - $period + 1, @array_indexing), I)
$complete = AND(LEN($window) == $period, LEN(FILTER($window, (e) => ISNULL(e))) == 0)

IF(ISNULL($x),
   null,
   IF(NOT(ISNULL(PREV)),
      $alpha * $x + (1 - $alpha) * PREV,
      IF($complete, AVG($window), null)))`;

const MACD = `
$short = INDICATOR("EMA", { period: PARAMETERS.short_period }, SOURCE)
$long = INDICATOR("EMA", { period: PARAMETERS.long_period }, SOURCE)

# MACD line for every candle: the two series joined element by element
$line = MAP($short, (s, i) => IF(OR(ISNULL(s), ISNULL($long[i])), null, s - $long[i]))

$macd = $line[I]
$signal = INDICATOR("EMA", { period: PARAMETERS.signal_period }, $line)[I]

IF(OR(ISNULL($macd), ISNULL($signal)),
   null,
   { macd: $macd, signal: $signal, histogram: $macd - $signal })`;

// docs/standards/stock/examples/strategy_examples.md
const BULLISH_ENGULFING = `
# In the first iteration, the previous candle is the current one
$prev = CANDLES[MAX(I - 1, @array_indexing)]
$curr = CANDLES[I]

$prev_bearish = $prev.close < $prev.open
$curr_bullish = $curr.close > $curr.open
$covers = AND($curr.open <= $prev.close, $curr.close >= $prev.open)

AND(I > @array_indexing, AND($prev_bearish, AND($curr_bullish, $covers)))`;

const CROSSOVER = `
$fast = INDICATOR("SMA", { period: 10 })
$slow = INDICATOR("SMA", { period: 40 })

$p = MAX(I - 1, @array_indexing)
$fast_prev = $fast[$p]
$slow_prev = $slow[$p]
$fast_curr = $fast[I]
$slow_curr = $slow[I]

# Both SMAs need a value for the previous and the current candle
$values = [$fast_prev, $slow_prev, $fast_curr, $slow_curr]
$ready = AND(I > @array_indexing, LEN(FILTER($values, (e) => ISNULL(e))) == 0)

IF(NOT($ready),
   NEUTRAL,
   IF(AND($fast_prev <= $slow_prev, $fast_curr > $slow_curr),
      BUY,
      IF(AND($fast_prev >= $slow_prev, $fast_curr < $slow_curr), SELL, NEUTRAL)))`;

const MACD_STRENGTH = `
$macd = INDICATOR("MACD")[I]

IF(ISNULL($macd),
   NEUTRAL,
   CLAMP($macd.histogram / CLOSE[I] * 100, SELL, BUY))`;

function createEnvironment(): { environment: Environment; registry: IndicatorRegistry } {
  const environment = Environment.create();
  const registry = registerStock(environment).registry;
  registry.add("SMA", SMA, { period: 14 });
  registry.add("EMA", EMA, { period: 14 });
  registry.add("MACD", MACD, { short_period: 12, long_period: 26, signal_period: 9 });
  return { environment, registry };
}

const flat = (price: number): Candle => ({ open: price, high: price, low: price, close: price });
const ONE_TO_FIVE: readonly Candle[] = [flat(1), flat(2), flat(3), flat(4), flat(5)];

/** Executes the formula in a Stock Context and returns the serialized result of the last iteration. */
function runLast(formula: string, candles: readonly Candle[] = ONE_TO_FIVE, environment?: Environment): string {
  const context = StockContext.create(environment ?? createEnvironment().environment, candles);
  return Executor.create().executeIterations(formula, context).results.at(-1)!.toString();
}

function params(entries: Record<string, number>): IObject {
  return FlObject.from(Object.entries(entries).map(([key, value]) => [key, Value.number(value)] as const));
}

describe("Stock standard", () => {
  it("is registered in the environment", () => {
    const { environment } = createEnvironment();
    expect(environment.supports("stock-0.1")).toBe(true);
    expect(environment.getProperty("STANDARDS")?.getValue().toString()).toBe('["core-0.3", "stock-0.1"]');
    expect(environment.extendedTypes).toContain("Stock.Candle");
    expect(environment.getFunction("CANDLE")).toBeDefined();
    expect(getIndicatorRegistry(environment)).toBeDefined();
    expect(StockStandard.isCoreSupported(environment)).toBe(true);
  });

  it("cannot be registered twice", () => {
    const { environment } = createEnvironment();
    expect(() => registerStock(environment)).toThrow();
  });

  it.each(require)("REQUIRE: %j → %s", (formula, expected) => expectResult(runLast(formula), expected));
});

describe("Stock Context", () => {
  it("provides the candle constants", () => {
    const candles: Candle[] = [
      { open: 10, high: 12, low: 9, close: 11, volume: 5_000, time: 1_700_000_000_000 },
      { open: 11, high: 13, low: 10, close: 12 },
    ];
    expect(runLast("[N, OPEN, HIGH, LOW, CLOSE, VOLUME, TIME]", candles)).toBe(
      "[2, [10, 11], [12, 13], [9, 10], [11, 12], [5000, null], [1700000000000, null]]",
    );
    expect(runLast("[CLOSE[I], CANDLES[I].close, CANDLES[I].high]", candles)).toBe("[12, 12, 13]");
    expect(runLast("ISOBJ(CANDLES[0])", candles)).toBe("true");
  });

  it("accepts a Date as the time of a candle", () =>
    expect(runLast("TIME[0]", [{ ...flat(1), time: new Date(Date.UTC(2026, 0, 1)) }])).toBe("1767225600000"));

  it("rejects invalid candles", () => {
    const { environment } = createEnvironment();
    expect(() => StockContext.create(environment, [{ open: 10, high: 9, low: 8, close: 11 }])).toThrow(RangeError);
    expect(() => StockContext.create(environment, [{ open: 10, high: 12, low: 8, close: 11, volume: -1 }])).toThrow(
      RangeError,
    );
  });

  it("serializes candles with their class", () =>
    expect(runLast("@include_object_class = true\nTEXT(CANDLES[0])", [{ open: 10, high: 12, low: 9, close: 11 }])).toBe(
      "[Stock.Candle] { open: 10, high: 12, low: 9, close: 11, volume: null, time: null }",
    ));
});

// docs/standards/stock/functions/CANDLE.md
describe("CANDLE", () => {
  it.each(candle_Examples)("%j → %s", (formula, expected) => {
    const result = Executor.create().execute(
      "@include_object_class = true\n" + formula,
      createEnvironment().environment,
    );
    expect(result.toString()).toBe(expected);
  });

  it.each(candle_Values)("%j → %s", (formula, expected) => expectResult(runLast(formula, [flat(1)]), expected));
});

// docs/standards/stock/functions/INDICATOR.md
describe("INDICATOR", () => {
  it.each(indicator_Examples)("%j → %s", (formula, expected) => expectResult(runLast(formula), expected));

  it("does not pass the environment variables of the caller", () => {
    expect(runLast('@array_indexing = 1\nINDICATOR("SMA", { period: 3 })')).toBe("[null, null, 2, 3, 4]");
    expect(runLast('@array_indexing = 1\nINDICATOR("SMA", { period: 3 })[I]')).toBe("4");
  });

  it("fails outside of a Stock Context", () =>
    expect(Executor.create().execute('INDICATOR("SMA")', createEnvironment().environment).error.name).toBe(
      "OPERATION_ERROR",
    ));

  it("detects an indicator that calls itself", () => {
    const { environment, registry } = createEnvironment();
    registry.add("LOOP", 'INDICATOR("LOOP")[I]');
    registry.add("A", 'INDICATOR("B")[I]');
    registry.add("B", 'INDICATOR("A")[I]');
    expect(runLast('INDICATOR("LOOP")', ONE_TO_FIVE, environment)).toMatch(
      /^\[OPERATION_ERROR \(3\)\] Indicator "LOOP" calls itself\./,
    );
    expect(runLast('INDICATOR("A")', ONE_TO_FIVE, environment)).toMatch(
      /^\[OPERATION_ERROR \(3\)\] Indicator "A" calls itself\./,
    );
  });

  it("returns the Error of an iteration", () => {
    const { environment, registry } = createEnvironment();
    registry.add("FAIL", 'IF(I == 2, ERROR("broken"), I)');
    expect(runLast('INDICATOR("FAIL")', ONE_TO_FIVE, environment)).toBe("[CUSTOM_ERROR (1)] broken");
  });

  it.each(indicator_ResultThatIsNotAllowed)("rejects the indicator result %j", (formula) => {
    const { environment, registry } = createEnvironment();
    registry.add("BAD", formula);
    expect(runLast('INDICATOR("BAD")', ONE_TO_FIVE, environment).startsWith("[OPERATION_ERROR (3)] Iteration")).toBe(
      true,
    );
  });

  it("computes MACD", () => {
    const context = StockContext.create(createEnvironment().environment, ONE_TO_FIVE);
    const series = context.computeIndicator("MACD", params({ short_period: 2, long_period: 3, signal_period: 2 }));
    const values = series.raw as readonly IValue[];
    expect(values).toHaveLength(5);
    for (const value of values.slice(0, 3)) expect(value.type.base).toBe(TypeNames.Null);
    for (const value of values.slice(3)) {
      const object = value.raw as IObject;
      expect(object.keys).toEqual(["macd", "signal", "histogram"]);
      expect(object.getProperty("macd")?.getValue().raw).toBeCloseTo(0.5, 12);
      expect(object.getProperty("signal")?.getValue().raw).toBeCloseTo(0.5, 12);
      expect(object.getProperty("histogram")?.getValue().raw).toBeCloseTo(0, 12);
    }
  });

  it("uses MACD in a formula", () => {
    const formula =
      '$macd = INDICATOR("MACD", { short_period: 2, long_period: 3, signal_period: 2 })[I]\nIF(ISNULL($macd), null, ROUND($macd.histogram, 6))';
    const context = StockContext.create(createEnvironment().environment, ONE_TO_FIVE);
    expect(Executor.create().executeIterations(formula, context).values.map(String)).toEqual([
      "null",
      "null",
      "null",
      "0",
      "0",
    ]);
  });

  it("runs in an Indicator Context created by the host", () => {
    const context = IndicatorContext.create(
      createEnvironment().environment,
      ONE_TO_FIVE,
      undefined,
      params({ period: 3 }),
    );
    expect(new StockExecutor().executeIndicator(SMA, context).toString()).toBe("[null, null, 2, 3, 4]");
  });
});

// docs/standards/stock/examples/strategy_examples.md
describe("Patterns and strategies", () => {
  it("finds a bullish engulfing pattern", () => {
    const candles: Candle[] = [
      { open: 10, high: 10.5, low: 7.5, close: 8 }, // bearish
      { open: 7.5, high: 11, low: 7, close: 10.5 }, // bullish, covers the previous body
      { open: 10.5, high: 11, low: 9, close: 9.5 }, // bearish
      { open: 9.6, high: 10, low: 9, close: 9.8 }, // bullish, does not cover
    ];
    const result = new StockExecutor().executePattern(
      BULLISH_ENGULFING,
      PatternContext.create(createEnvironment().environment, candles),
    );
    expect(result.successful).toBe(true);
    expect(result.indices).toEqual([1]);
  });

  it("rejects a pattern result that is not a Boolean", () => {
    const context = PatternContext.create(createEnvironment().environment, ONE_TO_FIVE);
    expect(new StockExecutor().executePattern("I", context).error.name).toBe("OPERATION_ERROR");
  });

  it("gives the signals of a moving average crossover", () => {
    // Falling prices, then rising prices: the fast SMA crosses above the slow SMA once
    const close = [
      ...Array.from({ length: 50 }, (_, i) => 100 - i),
      ...Array.from({ length: 50 }, (_, i) => 50 + 2 * (i + 1)),
    ];
    const context = StrategyContext.create(createEnvironment().environment, close.map(flat));
    const result = new StockExecutor().executeStrategy(CROSSOVER, context);
    expect(result.successful, result.error.toString()).toBe(true);
    expect(result.signals).toEqual(expectedCrossover(close, 10, 40));
    expect(result.signals.filter((s) => s === StrategyContext.buy)).toHaveLength(1);
  });

  it("gives the signal strength of MACD", () => {
    const close = Array.from({ length: 60 }, (_, i) => 100 + 10 * Math.sin(i / 5));
    const context = StrategyContext.create(createEnvironment().environment, close.map(flat));
    const result = new StockExecutor().executeStrategy(MACD_STRENGTH, context);
    expect(result.successful, result.error.toString()).toBe(true);
    for (const signal of result.signals) expect(Math.abs(signal!)).toBeLessThanOrEqual(1);
    expect(result.signals.slice(0, 33).every((s) => s === 0)).toBe(true);
    expect(result.signals.some((s) => s !== 0)).toBe(true);
  });

  it("clamps the signals", () => {
    const context = StrategyContext.create(createEnvironment().environment, ONE_TO_FIVE);
    expect(new StockExecutor().executeStrategy("I - 2 + BUY * 0 + SELL * 0 + NEUTRAL", context).signals).toEqual([
      -1, -1, 0, 1, 1,
    ]);
  });
});

function expectedCrossover(close: readonly number[], fastPeriod: number, slowPeriod: number): number[] {
  const sma = (i: number, period: number): number | null =>
    i + 1 < period ? null : close.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  return close.map((_, i) => {
    const p = Math.max(i - 1, 0);
    const [fp, sp, fc, sc] = [sma(p, fastPeriod), sma(p, slowPeriod), sma(i, fastPeriod), sma(i, slowPeriod)];
    if (i === 0 || fp === null || sp === null || fc === null || sc === null) return 0;
    if (fp <= sp && fc > sc) return 1;
    if (fp >= sp && fc < sc) return -1;
    return 0;
  });
}
