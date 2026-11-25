import { describe, expect, it } from "vitest";
import { Environment, Executor, IterationContext, hostFunction } from "../../src/index.js";
import { type Candle, StockContext, registerStock } from "../../src/stock/index.js";
import { run } from "../helpers.js";

/**
 * The optimizations of the evaluator, the Iteration Context and LOAD_INDICATOR give the same results as the plain
 * algorithm: skipping the branch of IF that is not selected, reusing the containers between iterations, and reusing
 * a series of a source built again in every iteration.
 */

function environmentWithCounter(sideEffectFree: boolean): { environment: Environment; calls: () => number } {
  const environment = Environment.create();
  let calls = 0;
  environment.registerFunction(hostFunction("COUNT", () => ++calls, { sideEffectFree }));
  return { environment, calls: () => calls };
}

const runIn = (environment: Environment, formula: string): string =>
  Executor.create().execute(formula, environment).value.toString();

describe("skipping the branch of IF that is not selected", () => {
  it("does not compute a side-effect-free branch that is not selected", () => {
    const { environment, calls } = environmentWithCounter(true);
    expect(runIn(environment, "IF(TRUE, 1, COUNT())")).toBe("1");
    expect(calls()).toBe(0);
    expect(runIn(environment, "IF(FALSE, 0, COUNT())")).toBe("1");
    expect(calls()).toBe(1);
  });

  it("still calls a function with side effects in the branch that is not selected", () => {
    const { environment, calls } = environmentWithCounter(false);
    expect(runIn(environment, "IF(TRUE, 1, COUNT())")).toBe("1");
    expect(calls()).toBe(1);
  });

  it("still invokes a delegate from a variable in the branch that is not selected", () => {
    const { environment, calls } = environmentWithCounter(false);
    expect(runIn(environment, "$f = (x) => COUNT()\nIF(TRUE, 0, MAP([1, 2], $f))")).toBe("0");
    expect(calls()).toBe(2);
  });

  it("still executes an assignment in the branch that is not selected", () => {
    expect(run("$a = 1\n$b = IF(TRUE, 0, $a = 5)\n$a")).toBe("5");
  });

  it.each([
    ["IF(TRUE, 1, DIV(1, 0))", "1"],
    ['IF(FALSE, ERROR("a"), 2)', "2"],
    ['IF(1, ERROR("a"), 2)', "[CUSTOM_ERROR (1)] a"],
    ['IF(ERROR("c"), ERROR("a"), 2)', "[CUSTOM_ERROR (1)] c"],
    ["$x = IF(2 > 1, IF(FALSE, 1, 2), 3)\n$x * 10", "20"],
    ['MAP([1, 2, 3], (v) => IF(v > 1, v * 10, ERROR("small")))', "[CUSTOM_ERROR (1)] small"],
    ['MAP([2, 3], (v) => IF(v > 1, v * 10, ERROR("small")))', "[20, 30]"],
  ])("gives the same result as with both branches computed: %s", (formula, expected) => {
    expect(run(formula)).toBe(expected);
  });
});

describe("iterations", () => {
  it("start with the environment variables of the environment", () => {
    const environment = Environment.create();
    const context = IterationContext.create(environment, 3);
    const result = Executor.create().executeIterations("$i = I\n@array_indexing = 1\n$i", context);
    expect(result.values.map(String)).toEqual(["0", "1", "2"]);
    expect(environment.getProperty("array_indexing")!.getValue().toString()).toBe("0");
  });

  it("start without context variables and with the previous result", () => {
    const context = IterationContext.create(Environment.create(), 4);
    const result = Executor.create().executeIterations(
      "$seen := 0\n$seen = $seen + 1\nIF(ISNULL(PREV), $seen, PREV + $seen)",
      context,
    );
    expect(result.values.map(String)).toEqual(["1", "2", "3", "4"]);
  });

  it("read the previous result through the context", () => {
    const context = IterationContext.create(Environment.create(), 3);
    const result = Executor.create().executeIterations("IF(ISNULL(PREV), 10, PREV * 2)", context);
    expect(result.values.map(String)).toEqual(["10", "20", "40"]);
    expect(context.previous.toString()).toBe("20");
    expect(context.getProperty(IterationContext.previousConstant)!.getValue().toString()).toBe("20");
  });
});

describe("LOAD_INDICATOR", () => {
  it("reuses the series of a source built in every iteration by its elements", () => {
    const environment = Environment.create();
    let runs = 0;
    environment.registerFunction(hostFunction("RUNS", () => (runs++, 0)));
    registerStock(environment).registry.indicators.add("COUNTED", "RUNS() + SOURCE[I]");
    const flat = (price: number): Candle => ({ open: price, high: price, low: price, close: price });
    const candles = [1, 2, 3, 4, 5].map(flat);

    const result = Executor.create().executeIterations(
      [
        'LOAD_INDICATOR("COUNTED", { }, MAP(CLOSE, (c) => c * 2))[I]',
        '+ LOAD_INDICATOR("COUNTED", { }, MAP(CLOSE, (c) => c * 3))[I]',
      ].join(" "),
      StockContext.create(environment, candles),
    );

    expect(result.values.map(String)).toEqual(["5", "10", "15", "20", "25"]);
    expect(runs).toBe(2 * candles.length); // two series of N iterations, not one per caller iteration
  });
});

describe("numbers", () => {
  it("keep their expression", () => {
    expect(Executor.create().execute("1 / 4 + 0.5", Environment.create()).value.expression).toBe("0.75");
  });
});
