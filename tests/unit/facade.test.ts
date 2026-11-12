import { describe, expect, it } from "vitest";
import {
  ContextType,
  Errors,
  FormulaError,
  Value,
  createEngine,
  evaluate,
  fromJs,
  hostFunction,
  toJs,
  Context,
  Environment,
} from "../../src/index.js";

describe("evaluate", () => {
  it("returns the result as a JavaScript value", () => {
    const result = evaluate("$a * 2", { variables: { a: 5 } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(10);
    expect(result.text).toBe("10");
  });

  it("converts arrays and objects", () => {
    const result = evaluate("{ total: SUM($items), names: MAP($people, (p) => p.name) }", {
      variables: { items: [1, 2, 3], people: [{ name: "Ann" }, { name: "Bob" }] },
    });
    expect(result.ok && result.value).toEqual({ total: 6, names: ["Ann", "Bob"] });
  });

  it("reports the error of a failed execution", () => {
    const result = evaluate("$r := 2\n$x + 1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(FormulaError);
      expect(result.error.name).toBe("UNKNOWN_SYMBOL_ERROR");
      expect(result.error.code).toBe(5);
      expect(result.error.toString()).toBe('[UNKNOWN_SYMBOL_ERROR (5)] Variable "x" is not defined.');
    }
  });

  it("reports every validation error", () => {
    const result = evaluate('$x = (1\n$y = "a');
    expect(!result.ok && result.validationErrors.map((e) => e.name)).toEqual(["SYNTAX_ERROR", "SYNTAX_ERROR"]);
  });

  it("accepts constants and overrides of environment variables", () => {
    const result = evaluate("ROUND($price * (1 + TAX), 2) + [10, 20][1]", {
      variables: { price: 120 },
      constants: { TAX: 0.23 },
      environmentVariables: { array_indexing: 1 },
    });
    expect(result.ok && result.value).toBe(157.6);
  });

  it("serializes the text with the variables of the execution", () =>
    expect(evaluate("@decimal_place = 2\n1 / 3").text).toBe("0.33"));

  it("throws for an environment variable of another type", () =>
    expect(() => evaluate("1", { environmentVariables: { array_indexing: "one" } })).toThrow(TypeError));
});

describe("Engine", () => {
  it("calls functions of the host application", () => {
    const engine = createEngine({ functions: { HYPOT: (a, b) => Math.hypot(a as number, b as number) } });
    const result = engine.evaluate("HYPOT(3, 4)");
    expect(result.ok && result.value).toBe(5);
  });

  it("propagates an Error argument without calling the host function", () => {
    let called = false;
    const engine = createEngine({
      functions: {
        TOUCH: () => {
          called = true;
          return 1;
        },
      },
    });
    expect(engine.evaluate("TOUCH(DIV(1, 0))").ok).toBe(false);
    expect(called).toBe(false);
  });

  it("turns an exception of a host function into an OPERATION_ERROR", () => {
    const engine = createEngine({
      functions: {
        FAIL: () => {
          throw new Error("boom");
        },
      },
    });
    const result = engine.evaluate("FAIL()");
    expect(!result.ok && result.error.toString()).toBe('[OPERATION_ERROR (3)] "FAIL" failed: boom');
  });

  it("provides environment constants to every formula", () => {
    const engine = createEngine({ constants: { VAT: 0.2 } });
    expect(engine.evaluate("100 * VAT").text).toBe("20");
    expect(engine.evaluate("VAT = 1").ok).toBe(false);
  });

  it("keeps the variables of a persistent context", () => {
    const engine = createEngine();
    const context = engine.createContext(ContextType.Persistent);
    engine.evaluate("$n := 0\n$n = $n + 1", { context });
    const result = engine.evaluate("$n", { context });
    expect(result.ok && result.value).toBe(1);
  });

  it("updates a variable of a context", () => {
    const engine = createEngine();
    const context = engine.createContext(ContextType.Persistent, { variables: { n: 1 } });
    const result = engine.evaluate("$n * 10", { context, variables: { n: 2 } });
    expect(result.ok && result.value).toBe(20);
    expect(() => engine.evaluate("$n", { context, variables: { n: "text" } })).toThrow(TypeError);
  });

  it("returns delegates that can be called from JavaScript", () => {
    const result = evaluate("(x) => x * 2");
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.value as (x: number) => number)(21)).toBe(42);
  });

  it("calls JavaScript callbacks passed as variables", () => {
    const result = evaluate("MAP([1, 2, 3], $f)", { variables: { f: (x: unknown) => (x as number) + 1 } });
    expect(result.ok && result.value).toEqual([2, 3, 4]);
  });
});

describe("Conversion", () => {
  it("converts JavaScript values into FormuLang values", () => {
    expect(fromJs(null).type.base).toBe("Null");
    expect(fromJs(undefined).type.base).toBe("Null");
    expect(fromJs(true).toString()).toBe("true");
    expect(fromJs(10n).toString()).toBe("10");
    expect(fromJs(new Date(0)).toString()).toBe("0");
    expect(fromJs({ a: [1, "x"] }).toString()).toBe('{ a: [1, "x"] }');
    expect(fromJs(new FormulaError(Errors.customError("e"))).toString()).toBe("[CUSTOM_ERROR (1)] e");
    const value = Value.number(1);
    expect(fromJs(value)).toBe(value);
    expect(() => fromJs(Symbol("s"))).toThrow(TypeError);
  });

  it("converts FormuLang values into JavaScript values", () => {
    expect(toJs(Value.undefined())).toBeUndefined();
    expect(toJs(Value.error(Errors.customError("e")))).toBeInstanceOf(FormulaError);
    expect(toJs(Value.delegate(hostFunction("F", () => 1)))).toBeUndefined();
    const context = Context.create(Environment.create());
    const fn = toJs(Value.delegate(hostFunction("F", (x) => (x as number) * 3)), context) as (x: number) => number;
    expect(fn(2)).toBe(6);
  });
});
