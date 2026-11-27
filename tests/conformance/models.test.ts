import { describe, expect, it } from "vitest";
import { Environment, FlObject, ParameterProblemCode, Value, serialize } from "../../src/index.js";
import type { InvalidDefinitionError, PatternDefinition, StrategyDefinition } from "../../src/stock/index.js";
import {
  type Candle,
  Definition,
  IndicatorDefinition,
  ParameterError,
  StockContext,
  registerStock,
} from "../../src/stock/index.js";

// Formula models (FormuLang docs/implementation/formula_models.md): the API of the library that the JSON
// conformance cases (tests/conformance/spec/stock/models.json) do not cover.

const RSI = `<@ {
  id: "RSI", name: "Relative Strength Index", context: "Stock.Indicator",
  parameters: { period: { type: "Number", default: 2, min: 1 } },
  stock: { category: "Momentum", outputs: { value: { name: "RSI" } } }
} @>
$p = PARAMETERS.period
$n = I - @array_indexing
$change = IF($n == 0, 0, SOURCE[I] - SOURCE[I - 1])
$sumGain = RECALL("sumGain", 0) + MAX($change, 0)
$sumLoss = RECALL("sumLoss", 0) + MAX(-$change, 0)
STORE("sumGain", $sumGain)
STORE("sumLoss", $sumLoss)
$avgGain = IF($n < $p, null, IF($n == $p, $sumGain / $p, (RECALL("avgGain") * ($p - 1) + MAX($change, 0)) / $p))
$avgLoss = IF($n < $p, null, IF($n == $p, $sumLoss / $p, (RECALL("avgLoss") * ($p - 1) + MAX(-$change, 0)) / $p))
STORE("avgGain", $avgGain)
STORE("avgLoss", $avgLoss)
IF(ISNULL($avgGain), null, IF($avgLoss == 0, 100, 100 - 100 / (1 + $avgGain / $avgLoss)))`;

const STRATEGY = `<@ {
  id: "rsi-cross", context: "Stock.Strategy",
  parameters: { level: { type: "Number", default: 50, min: 0, max: 100 }, side: { type: "Text", default: "long", options: ["long", "short"] } },
  stock: { checks: { cross: "RSI crosses the level" } }
} @>
$rsi = LOAD_INDICATOR("RSI", { period: 2 })
$cross = CROSSOVER($rsi, PARAMETERS.level)
IF($cross, { signal: IF(PARAMETERS.side == "long", BUY, SELL), checks: { cross: $cross }, reason: "cross", stop: LOW[I] }, NEUTRAL)`;

const closes = [1, 2, 1, 3, 2, 4, 3, 5];
const candles = (values: readonly number[]): Candle[] =>
  values.map((close, i) => ({ open: close, high: close + 1, low: close - 1, close, time: i * 60_000 }));

function environment(): Environment {
  const env = Environment.create();
  env.setNow(0);
  registerStock(env).registry.addDefinition(Definition.fromFormula(RSI) as IndicatorDefinition);
  return env;
}

describe("Definitions", () => {
  it("are read from the metadata", () => {
    const rsi = Definition.fromFormula(RSI);
    expect(rsi).toBeInstanceOf(IndicatorDefinition);
    expect(rsi.name).toBe("Relative Strength Index");
    expect(rsi.category).toBe("Momentum");
    expect((rsi as IndicatorDefinition).outputs).toEqual([{ key: "value", name: "RSI", description: undefined }]);
    const strategy = Definition.fromFormula(STRATEGY) as StrategyDefinition;
    expect(strategy.checks).toEqual([{ key: "cross", label: "RSI crosses the level" }]);
    expect(strategy.parameters.map((p) => `${p.key}:${p.type}:${serialize(p.defaultValue!)}`)).toEqual([
      "level:Number:50",
      "side:Text:long",
    ]);
  });

  it("give the reason of an invalid formula", () => {
    const reason = (formula: string): string => {
      try {
        Definition.fromFormula(formula);
        return "valid";
      } catch (error) {
        return (error as InvalidDefinitionError).reason;
      }
    };
    expect(reason('<@ { id: "x", context: "Stock.Pattern" } @>\n"unclosed')).toBe("ERROR");
    expect(reason('<@ { id: "x", context: "Stock.Pattern", stock: { category: 1 } } @>\ntrue')).toBe("METADATA_TYPE");
  });

  it("go into the formula registry", () => {
    const env = environment();
    const context = StockContext.create(env, candles(closes));
    expect(serialize(context.computeIndicator("RSI", FlObject.from([])))).toBe(
      "[null, null, 50, 83.33333333333333, 50, 80.76923076923077, 50, 80.18867924528303]",
    );
    const strategy = Definition.fromFormula(STRATEGY);
    expect(() => registerStock(Environment.create()).registry.addDefinition(strategy)).toThrow(TypeError);
  });
});

describe("Instances", () => {
  const strategy = Definition.fromFormula(STRATEGY) as StrategyDefinition;

  it("accept JavaScript values and complete the defaults", () => {
    const instance = strategy.instance({ level: 60, side: undefined });
    expect(serialize(Value.object(instance.parameters))).toBe('{ level: 60, side: "long" }');
    expect(instance.key).toBe('rsi-cross|{ level: 60, side: "long" }');
  });

  it("report every problem of the values", () => {
    const normalization = strategy.normalize({ level: 101, side: "both", x: true });
    expect(normalization.problems.map((p) => [p.code, p.key])).toEqual([
      [ParameterProblemCode.Unknown, "x"],
      [ParameterProblemCode.Max, "level"],
      [ParameterProblemCode.Option, "side"],
    ]);
    expect(() => strategy.instance({ level: "high" })).toThrow(ParameterError);
  });

  it("are serialized and read back", () => {
    const instance = strategy.instance({ side: "short" });
    const json = JSON.parse(JSON.stringify(instance)) as { id: string; parameters: Record<string, unknown> };
    expect(json).toEqual({ id: "rsi-cross", parameters: { level: 50, side: "short" } });
    expect(strategy.instanceFromJSON(json).key).toBe(instance.key);
    expect(() => strategy.instanceFromJSON({ ...json, id: "other" })).toThrow(TypeError);
  });
});

describe("Runs", () => {
  it("give the signals of a strategy with their checks and extra keys", () => {
    const env = environment();
    const run = (Definition.fromFormula(STRATEGY) as StrategyDefinition)
      .instance({ level: 60 })
      .compute(env, { candles: candles(closes) });
    expect(run.successful).toBe(true);
    expect(run.signals).toEqual([
      { index: 3, time: 180_000, signal: 1, reason: "cross", checks: { cross: true }, extra: { stop: 2 } },
      { index: 5, time: 300_000, signal: 1, reason: "cross", checks: { cross: true }, extra: { stop: 3 } },
      { index: 7, time: 420_000, signal: 1, reason: "cross", checks: { cross: true }, extra: { stop: 4 } },
    ]);
    expect(run.results).toHaveLength(closes.length);
  });

  it("give the error of an iteration", () => {
    const pattern = Definition.fromFormula('<@ { id: "p", context: "Stock.Pattern" } @>\nIF(I == 1, 1, true)');
    const run = (pattern as PatternDefinition).instance().compute(environment(), { candles: candles([1, 2, 3]) });
    expect(run.successful).toBe(false);
    expect(run.error.message).toBe("Iteration 1 of the pattern returned a value that is not a Boolean.");
  });

  it("continue live with the same results as a new run (with the memory of RSI)", () => {
    const env = environment();
    const instance = (Definition.fromFormula(RSI) as IndicatorDefinition).instance();
    const all = instance.compute(env, { candles: candles(closes) });

    const live = instance.live(env, { candles: candles(closes.slice(0, 5)) });
    const first = live.start();
    const rest = live.append(candles(closes).slice(5));
    expect(rest.from).toBe(5);
    expect([...first.outputs.get("value")!, ...rest.outputs.get("value")!]).toEqual(all.outputs.get("value"));
  });

  it("restore a saved state in a new live run", () => {
    const env = environment();
    const instance = (Definition.fromFormula(RSI) as IndicatorDefinition).instance();
    const all = instance.compute(env, { candles: candles(closes) }).outputs.get("value")!;

    const before = instance.live(env, { candles: candles(closes.slice(0, 6)) });
    before.start();
    const state = JSON.parse(JSON.stringify({ completed: before.saveState().completedIterations })) as {
      completed: number;
    };
    expect(state.completed).toBe(6);

    const after = instance.live(env, { candles: candles(closes.slice(0, 6)) });
    after.restoreState(before.saveState());
    expect(after.append(candles(closes).slice(6)).outputs.get("value")).toEqual(all.slice(6));
  });
});

describe("Identifiers with - (docs/standards/stock/README.md, Formula registry)", () => {
  it("are definitions of the registry, loaded with a Text", () => {
    const env = Environment.create();
    env.setNow(0);
    const registry = registerStock(env).registry;
    registry.addDefinition(
      Definition.fromFormula('<@ { id: "sma-2", context: "Stock.Indicator" } @>\nWINDOW(SOURCE, 2, AVG)'),
    );
    registry.indicators.add("ema-fast", "SOURCE[I]");
    const context = StockContext.create(env, candles([1, 2, 3]));
    expect(serialize(context.computeIndicator("sma-2"))).toBe("[null, 1.5, 2.5]");
    expect(serialize(context.computeIndicator("ema-fast"))).toBe("[1, 2, 3]");
    expect(() => registry.indicators.add("-x", "1")).toThrow(TypeError);
  });
});
