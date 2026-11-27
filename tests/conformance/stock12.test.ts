import { describe, expect, it } from "vitest";
import { Environment, ExecutionResult, Executor, FlObject, type IValue, Value, serialize } from "../../src/index.js";
import {
  type Candle,
  FormulaDefinition,
  IndicatorContext,
  StockContext,
  type StockContextOptions,
  StockExecutor,
  StrategyContext,
  registerStock,
} from "../../src/stock/index.js";

// Stock 1.2: the examples of the documents of the standard (docs/standards/stock) that the JSON conformance tests do
// not cover, and the API of the library for the other timeframes, the signal objects and the resumed iterations.

// docs/standards/stock/examples/indicator_examples.md, "Example 4: Relative Strength Index (RSI)"
const RSI = `<@ {
  id: "RSI",
  name: "Relative Strength Index",
  context: "Stock.Indicator",
  result: ["Number", "Null"],
  parameters: { period: { type: "Number", default: 14, min: 1, description: "Number of changes in the averages" } },
  stock: { category: "Momentum", outputs: { value: { name: "RSI" } } }
} @>
REQUIRE "stock-1.2+"

$p = PARAMETERS.period
$n = I - @array_indexing              # number of changes up to the current candle
$change = IF($n == 0, 0, SOURCE[I] - SOURCE[I - 1])
$gain = MAX($change, 0)
$loss = MAX(-$change, 0)

# Warm-up: the sums of the first \`period\` changes
$sumGain = RECALL("sumGain", 0) + $gain
$sumLoss = RECALL("sumLoss", 0) + $loss
STORE("sumGain", $sumGain)
STORE("sumLoss", $sumLoss)

# Wilder's averages: the mean of the first \`period\` changes, then a smoothing of the previous average
$avgGain = IF($n < $p, null, IF($n == $p, $sumGain / $p, (RECALL("avgGain") * ($p - 1) + $gain) / $p))
$avgLoss = IF($n < $p, null, IF($n == $p, $sumLoss / $p, (RECALL("avgLoss") * ($p - 1) + $loss) / $p))
STORE("avgGain", $avgGain)
STORE("avgLoss", $avgLoss)

IF(ISNULL($avgGain), null, IF($avgLoss == 0, 100, 100 - 100 / (1 + $avgGain / $avgLoss)))`;

const SMA2 = "WINDOW(SOURCE, 2, AVG)";

/** Candles with the closes, `length` milliseconds long, from the time 0; open is the close minus 0.5. */
function candles(closes: readonly number[], length = 900_000): Candle[] {
  return closes.map((close, i) => ({ open: close - 0.5, high: close + 0.5, low: close - 1, close, time: i * length }));
}

function environment(): Environment {
  const env = Environment.create();
  env.setNow(0);
  const registry = registerStock(env).registry;
  registry.addFormula(RSI);
  registry.indicators.add("SMA2", SMA2);
  registry.patterns.add("UP", "CANDLES[I].close > CANDLES[I].open");
  return env;
}

/** 8 candles of 15 minutes; the timeframe 1h has 2 candles with the closes 4 and 8. */
const HOURLY: StockContextOptions = {
  timeframe: "15m",
  instrument: "EURUSD",
  timeframeLength: 900_000,
  timeframes: { "1h": { length: 3_600_000, candles: candles([4, 8], 3_600_000) } },
};

function iterate(formula: string, context: StockContext, executor = Executor.create()): string[] {
  return executor.executeIterations(formula, context, false).results.map((r) => r.toString());
}

describe("RSI with the memory (docs/standards/stock/examples/indicator_examples.md, Example 4)", () => {
  it("is read from its metadata into the registry", () => {
    const definition = FormulaDefinition.fromFormula(RSI);
    expect(definition.id).toBe("RSI");
    expect(definition.parameters.map((p) => `${p.name}=${serialize(p.defaultValue)}`)).toEqual(["period=14"]);
  });

  it("gives [null, null, 50, 83.33333333333333]", () => {
    const context = StockContext.create(environment(), candles([1, 2, 1, 3]));
    expect(serialize(context.computeIndicator("RSI", FlObject.from([["period", Value.number(2)]])))).toBe(
      "[null, null, 50, 83.33333333333333]",
    );
  });

  it("has no warnings in an Indicator Context: the stock key of the metadata is valid", () => {
    const prepared = Executor.create().prepare(RSI, IndicatorContext.create(environment(), candles([1])));
    expect(prepared instanceof ExecutionResult ? prepared.toString() : prepared.warnings).toEqual([]);
    const inStrategy = Executor.create().prepare(RSI, StrategyContext.create(environment(), candles([1])));
    expect(inStrategy instanceof ExecutionResult ? [] : inStrategy.warnings.map((w) => w.message)).toEqual([
      'The formula is written for the context "Stock.Indicator", but is executed in "Stock.Strategy".',
    ]);
  });

  it("is checked by the Stock metadata check", () => {
    const prepared = Executor.create().prepare(
      "<@ { stock: { category: 1, outputs: { a: { name: 2 } }, checks: { b: true } } } @>\n1",
      StockContext.create(environment(), candles([1])),
    );
    expect(prepared instanceof ExecutionResult ? [] : prepared.warnings.map((w) => w.message)).toEqual([
      'Metadata key "stock.category" must be of type Text.',
      'Metadata key "stock.outputs.a.name" must be of type Text.',
      'Metadata key "stock.checks.b" must be of type Text.',
    ]);
  });
});

describe("Strategies (docs/standards/stock/examples/strategy_examples.md)", () => {
  it("completes PARAMETERS with the default values of the metadata (Example 5)", () => {
    const formula = `<@ {
  id: "sma-cross",
  context: "Stock.Strategy",
  parameters: { fast: { type: "Number", default: 1, min: 1 }, slow: { type: "Number", default: 3, min: 1 } }
} @>
REQUIRE "stock-1.2+"
$fast = WINDOW(CLOSE, PARAMETERS.fast, AVG)
$slow = WINDOW(CLOSE, PARAMETERS.slow, AVG)
IF(CROSSOVER(MAP(CLOSE, (c, i) => IF(i < PARAMETERS.slow - 1, null, c)), 3), BUY, NEUTRAL)`;
    const context = StrategyContext.create(
      environment(),
      candles([5, 4, 3, 2, 3, 4, 5, 6]),
      undefined,
      FlObject.from([["fast", Value.number(2)]]),
    );
    const result = new StockExecutor().executeStrategy(formula, context);
    expect(result.successful).toBe(true);
    expect(serialize(context.parameters)).toBe("{ fast: 2, slow: 3 }");
    expect(result.signals).toEqual([0, 0, 0, 0, 0, 1, 0, 0]);
  });

  it("returns the signal objects with the checks (README, Strategy Context)", () => {
    const formula = `$buy = { up: IS_BULLISH(CANDLES[I]), rising: RISING(CLOSE, 1) }
{ signal: SCORE($buy), checks: $buy, reason: "r", stop: LOWEST(LOW, 2) }`;
    const context = StrategyContext.create(environment(), candles([1, 2, 3]));
    const result = new StockExecutor().executeStrategy(formula, context);
    expect(result.signals).toEqual([0.5, 1, 1]);
    expect(result.signalObjects.map((o) => (o === undefined ? "-" : serialize(Value.object(o))))).toEqual([
      '{ signal: 0.5, checks: { up: true, rising: false }, reason: "r", stop: null }',
      '{ signal: 1, checks: { up: true, rising: true }, reason: "r", stop: 0 }',
      '{ signal: 1, checks: { up: true, rising: true }, reason: "r", stop: 1 }',
    ]);
  });

  it("clamps the signal of a signal object", () =>
    expect(
      new StockExecutor().executeStrategy("{ signal: 5 }", StrategyContext.create(environment(), candles([1]))).signals,
    ).toEqual([1]));

  it("reports a result that is neither a Number nor a signal object", () => {
    const result = new StockExecutor().executeStrategy('"x"', StrategyContext.create(environment(), candles([1])));
    expect(result.error.message).toBe(
      "Iteration 0 of the strategy returned a value that is neither a Number nor a signal object.",
    );
  });

  it("uses the trend of another timeframe (Example 7)", () => {
    const formula = `REQUIRE "stock-1.2+"
$trend = LOAD_INDICATOR("SMA2", { }, { timeframe: "1h" })
$hourly = LOAD_CANDLES("1h")
$uptrend = READY($trend, 1) && $hourly[I].close > $trend[I]
IF($uptrend && CROSSOVER(CLOSE, 7), BUY, NEUTRAL)`;
    const context = StrategyContext.create(environment(), candles([1, 2, 3, 4, 5, 6, 7, 8]), HOURLY);
    expect(new StockExecutor().executeStrategy(formula, context).signals).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
  });
});

describe("Other timeframes (docs/standards/stock/README.md, Other timeframes)", () => {
  const context = (): StockContext => StockContext.create(environment(), candles([1, 2, 3, 4, 5, 6, 7, 8]), HOURLY);

  it("gives TIMEFRAME and INSTRUMENT to the child contexts of another timeframe", () =>
    expect(iterate('LOAD_INDICATOR("SMA2", { }, { timeframe: "1h", source: [1, 2] })[I]', context())).toEqual([
      "null",
      "null",
      "null",
      "null",
      "null",
      "null",
      "null",
      "1.5",
    ]));

  it("aligns the timeframe of the main chart with itself", () =>
    expect(
      iterate(
        'LOAD_CANDLES("15m")[I].close == CLOSE[I] && LEN(LOAD_CANDLES("15m", { align: false })) == I + 1',
        context(),
      ),
    ).toEqual(Array(8).fill("true")));

  it("gives the native series of a pattern of another timeframe", () =>
    expect(iterate('LOAD_PATTERN("UP", { }, { timeframe: "1h", align: false })', context())).toEqual([
      "[]",
      "[]",
      "[]",
      "[true]",
      "[true]",
      "[true]",
      "[true]",
      "[true, true]",
    ]));

  it("rejects a source of a wrong length for the timeframe", () =>
    expect(iterate('LOAD_INDICATOR("SMA2", { }, { timeframe: "1h", source: [1, 2, 3] })', context())[0]).toBe(
      '[OPERATION_ERROR (3)] The source has 3 elements, but there are 2 candles of the timeframe "1h".',
    ));

  it("rejects an option of a wrong type", () =>
    expect(iterate('LOAD_PATTERN("UP", { }, { align: 1 })', context())[0]).toBe(
      '[ARGUMENT_ERROR (6)] The option "align" of "LOAD_PATTERN" must be of type Boolean.',
    ));

  it("asks the host application for a timeframe the first time it is used", () => {
    const asked: string[] = [];
    const ctx = StockContext.create(environment(), candles([1, 2, 3, 4]), {
      timeframeLength: 900_000,
      timeframes: (name) => {
        asked.push(name);
        return name === "1h" ? { length: 3_600_000, candles: candles([4], 3_600_000) } : undefined;
      },
    });
    expect(iterate('LEN(LOAD_CANDLES("1h", { align: false })) + IFERR(LEN(LOAD_CANDLES("1d")), 10)', ctx)).toEqual([
      "10",
      "10",
      "10",
      "11",
    ]);
    expect(asked.sort()).toEqual(["1d", "1h"]);
  });

  it("needs the length of the main timeframe", () =>
    expect(() => StockContext.create(environment(), candles([1]), { timeframes: {} })).toThrow(RangeError));
});

describe("Resumed iterations (docs/core/context.md, Resumed iterations)", () => {
  it("give the same results as executing all the iterations again", () => {
    const formula = '$n = RECALL("n", 0) + 1\nSTORE("n", $n)\n[$n, LOAD_INDICATOR("SMA2")[I], LEN(HISTORY)]';
    const closes = [1, 2, 3, 4, 5, 6];
    const executor = Executor.create();
    const all = iterate(formula, StockContext.create(environment(), candles(closes)), executor);

    const live = StockContext.create(environment(), candles(closes.slice(0, 4)));
    const first = executor.executeIterations(formula, live).results.map((r) => r.toString());
    live.appendCandles(candles(closes).slice(4));
    const rest = executor.resumeIterations(formula, live).results.map((r) => r.toString());
    expect([...first, ...rest]).toEqual(all);
    expect(live.count).toBe(6);
  });

  it("cannot extend a Stock Context without candles", () =>
    expect(() => StockContext.create(environment(), candles([1])).extend(2)).toThrow());
});

describe("Series functions (docs/standards/stock/functions)", () => {
  const values = (series: readonly (number | null)[]): string =>
    `[${series.map((v) => (v === null ? "null" : String(v))).join(", ")}]`;
  const run = (formula: string, closes: readonly number[]): string[] =>
    iterate(formula, StockContext.create(environment(), candles(closes)));

  it.each([
    // CROSSOVER.md: touching is not crossing; a value equal at the previous candle counts as below
    [`CROSSOVER([1, 2, 4, 5], [3, 2, 3, 3])`, ["false", "false", "true", "false"]],
    [`CROSSUNDER([5, 4, 2, 1], 3)`, ["false", "false", "true", "false"]],
    [`HIGHEST(${values([5, 7, 6, 9, 8])}, 3, 2)`, ["null", "null", "null", "null", "7"]],
    [`HIGHEST(${values([null, 2, null, 1, null])}, 3)`, ["null", "null", "2", "2", "1"]],
    [`LOWEST(${values([5, 3, 6, 4, 8])}, 3, 1)`, ["null", "null", "null", "3", "3"]],
    [`FALLING(${values([5, 4, 3, 3, 2])}, 2)`, ["false", "false", "true", "false", "false"]],
    [`READY(${values([null, null, 3, 4, 5])}, 2)`, ["false", "false", "false", "true", "true"]],
    [`VALUE_WHEN([true, false, true, false], [10, 11, 12, 13], 1)`, ["null", "null", "10", "10"]],
    [`VALUE_WHEN([true, false, true, false], [10, 11, 12, 13], -1)`, Array(4).fill("OPERATION_ERROR")],
    [`CROSSOVER([1, 2, "x", 4], 3)`, ["false", "false", "OPERATION_ERROR", "OPERATION_ERROR"]],
  ])("%s", (formula, expected) => {
    const closes = Array.from({ length: expected.length }, (_, i) => i + 1);
    const results = run(formula, closes);
    expected.forEach((e, i) => {
      if (e.endsWith("_ERROR")) expect(results[i]!.startsWith(`[${e} (`), results[i]).toBe(true);
      else expect(results[i]).toBe(e);
    });
  });

  it("do not depend on @array_indexing", () =>
    expect(run("@array_indexing = 1\nHIGHEST(CLOSE, 2)", [1, 2, 3])).toEqual(["null", "2", "3"]));
});

describe("Formula registry from the metadata (docs/standards/stock/README.md, Formula registry)", () => {
  it("adds a pattern by the context of its metadata", () => {
    const env = Environment.create();
    const registry = registerStock(env).registry;
    const definition = registry.addFormula('<@ { id: "P", context: "Stock.Pattern", parameters: { k: { } } } @>\ntrue');
    expect(registry.patterns.get("P")).toBe(definition);
    expect(definition.parameters.map((p) => serialize(p.defaultValue as IValue))).toEqual(["null"]);
  });

  it.each([
    ['<@ { context: "Stock.Indicator" } @>\n1', 'The metadata of the formula has no Text "id".'],
    [
      '<@ { id: "X", context: "Stock.Strategy" } @>\n1',
      'The "context" of the metadata must be "Stock.Indicator" or "Stock.Pattern".',
    ],
    ["1", 'The metadata of the formula has no Text "id".'],
  ])("rejects %j", (formula, message) =>
    expect(() => registerStock(Environment.create()).registry.addFormula(formula)).toThrow(message),
  );
});
