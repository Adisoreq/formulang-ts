import { describe, expect, it } from "vitest";
import {
  Context,
  ContextType,
  Environment,
  ErrorCode,
  Executor,
  IterationContext,
  Validator,
  Value,
} from "../../src/index.js";
import { execute, run } from "../helpers.js";

// docs/semantics/execution.md, docs/semantics/evaluation.md
describe("Execution", () => {
  it("gives the result of the parsing example", () =>
    expect(run('REQUIRE "core-0.2+"\n\n$a = 4\n$b = 3\n$c = $a^2 + $b^2\n\nSQRT($c)')).toBe("5"));

  it("gives the result of the last sequence (example of the standard)", () => {
    expect(run('$x = 4\n$y = IF($x > 0, DIV(1, $x), ERROR("Negative!"))\n$y')).toBe("0.25");
    expect(run('$x = 4\n$z = IF($x < 0, 1, ERROR("Not negative!"))\n$x')).toBe("[CUSTOM_ERROR (1)] Not negative!");
    expect(run('ISERR(ERROR("a"))')).toBe("true");
  });

  it("skips the remaining sequences of an aborted execution", () => {
    const result = execute("$x = 1\n$y = DIV(1, 0)\n$x = 2");
    expect(result.error.code).toBe(ErrorCode.OperationError);
    expect(result.context.getProperty("x")?.getValue().toString()).toBe("1");
  });

  it("replaces an Error with null when @suppress_errors is true", () => {
    expect(run("@suppress_errors = true\n$a = DIV(1, 0)\n7")).toBe("7");
    expect(run("@suppress_errors = true\nDIV(1, 0)")).toBe("null");
  });

  it("computes the unselected branch of IF anyway", () => expect(run("IF(true, $a = 1, $b = 2)\n$a + $b")).toBe("3"));

  it("executes the example of the README of the standard", () => {
    const formula = [
      "$a = 1",
      "$b = 2",
      "$c = $a + $b # 3",
      "$b1 = true",
      "$integer_number = 42",
      "$negative_number = -28",
      "$scientific_notation = 5.2e-3",
      "$hexadecimal_integer = 0x40C",
      '$message = "Hello, world!"',
      "$sum = ADD(4, 5)",
      "$l2 = 25 > 10",
      '$l3 = IF(MOD(4, 2) == 0, "Even", "Odd")',
      "$arr = [5, 6, 7, 8, 9]",
      "$element = $arr[2]",
      '$both = CONCAT("ab", "cd")',
      '$obj = { name: "John", age: 24 }',
      "$name = $obj.name",
      "$div_by_3 = (n) => EQU(MOD(n, 3), 0)",
      "$filtered = FILTER($arr, $div_by_3)",
      '$is_err = ISERR(ERROR("Division by zero (0) is not permitted!"))',
      '$result = $message + "!!"',
      "[$c, $hexadecimal_integer, $l3, $element, $name, $filtered, $is_err, $result]",
    ].join("\n");
    expect(run(formula)).toBe('[3, 1036, "Even", 7, "John", [6, 9], true, "Hello, world!!!"]');
  });

  it("keeps the variables of a persistent context between executions", () => {
    const context = Context.create(Environment.create(), ContextType.Persistent);
    const executor = Executor.create();
    const formula = "$count := 0\n$count = $count + 1\n$count";
    expect(executor.execute(formula, context).value.toString()).toBe("1");
    expect(executor.execute(formula, context).value.toString()).toBe("2");
  });

  it("changes environment variables only in the context", () => {
    const environment = Environment.create();
    Executor.create().execute("@array_indexing = 1", environment);
    expect(environment.getProperty("array_indexing")?.getValue().toString()).toBe("0");
  });

  it("reads variables and constants provided by the host", () => {
    const context = Context.create(Environment.create());
    context.initVariable("price", Value.number(10));
    context.initConstant("TAX", Value.number(0.23));
    expect(Executor.create().execute("$price * (1 + TAX)", context).value.toString()).toBe("12.3");
  });

  it("does not set the outer variable of a chained assignment (conformance I17)", () => {
    expect(run("$a = $b = 1\n$b")).toBe("1");
    expect(execute("$a = $b = 1").context.hasKey("a")).toBe(false);
  });

  it("evaluates the parsing queue level by level (conformance I18)", () =>
    expect(run("$x = 1\n[($x = 5), NEG(NEG($x)), $x]")).toBe(
      "[[SUCCESS (0)] Operation completed successfully., 1, 5]",
    ));

  it("checks the number of lambda parameters before calling it (conformance I19)", () => {
    expect(run("MAP([1, 2], (a, b) => a)")).toBe("[1, 2]");
    expect(run("MAP([1, 2], (a, b, c) => a)")).toBe(
      '[ARGUMENT_ERROR (6)] The lambda passed to "MAP" must have 1 or 2 parameter(s).',
    );
  });

  it("stops at a syntax error before evaluation", () => {
    const result = execute("$x = 1\n$y = 1 +");
    expect(result.error.code).toBe(ErrorCode.SyntaxError);
    expect(result.context.hasKey("x")).toBe(false);
  });
});

// docs/standards/core/semantics/serialization.md
describe("Serialization variables", () => {
  it("serializes the result with the variables of the execution", () => {
    const result = execute("@decimal_place = 3\n2 / 3");
    expect(result.toString()).toBe("0.667");
    expect(result.value.toString()).toBe("0.6666666666666666");
  });

  it("are environment variables with their default values", () => {
    const environment = Environment.create();
    for (const name of ["decimal_place", "split_array", "split_object", "include_object_class", "max_array_preview"]) {
      expect(environment.getProperty(name)?.mutable, name).toBe(true);
    }
    expect(environment.getProperty("decimal_place")?.getValue().toString()).toBe("-1");
    expect(environment.getProperty("max_array_preview")?.getValue().toString()).toBe("-1");
    expect(new Validator().validate("1", environment).errors).toEqual([]);
  });

  it("are validated with the keyword constants", () => {
    const environment = Environment.create();
    environment.removeProperty("TRUE");
    environment.initConstant("TRUE", Value.boolean(false));
    environment.removeProperty("NULL");
    environment.removeProperty("decimal_place");
    environment.initVariable("decimal_place", Value.number(1.5));
    environment.removeProperty("split_array");
    expect(new Validator().validate("1", environment).errors.map((e) => e.toString())).toEqual([
      '[ENVIRONMENT_ERROR (10)] Environment constant "NULL" is missing or is not of type Null.',
      '[ENVIRONMENT_ERROR (10)] Environment constant "TRUE" must be true.',
      '[ENVIRONMENT_ERROR (10)] Environment variable "decimal_place" must be a whole number.',
      '[ENVIRONMENT_ERROR (10)] Environment variable "split_array" is missing or is not of type Boolean.',
    ]);
  });
});

// docs/core/context.md, "Iteration context"
describe("Iteration Context", () => {
  const iterate = (formula: string, count: number, stopOnError = true) =>
    Executor.create().executeIterations(formula, IterationContext.create(Environment.create(), count), stopOnError);
  const values = (formula: string, count: number): string[] => iterate(formula, count).values.map(String);

  it("provides I, N and PREV in every iteration", () => {
    const result = iterate("[I, N, PREV]", 3);
    expect(result.successful).toBe(true);
    expect(result.values.map(String)).toEqual(["[0, 3, null]", "[1, 3, [0, 3, null]]", "[2, 3, [1, 3, [0, 3, null]]]"]);
  });

  it("computes I with @array_indexing at the moment it is read", () =>
    expect(values("$a = I\n@array_indexing = 1\n[$a, I, N]", 2)).toEqual(["[0, 1, 2]", "[1, 2, 2]"]));

  it("does not keep variables between iterations", () => expect(values("$x := I\n$x", 3)).toEqual(["0", "1", "2"]));
  it("accumulates PREV", () => expect(values("IF(ISNULL(PREV), 1, PREV * 2)", 4)).toEqual(["1", "2", "4", "8"]));
  it("does not let a formula change its constants", () => expect(iterate("SET($I, 5)", 1).successful).toBe(false));

  it("lets the host decide about the remaining iterations", () => {
    const formula = 'IF(I == 1, ERROR("stop"), I)';
    const stopped = iterate(formula, 3);
    expect(stopped.results).toHaveLength(2);
    expect(stopped.error.name).toBe("CUSTOM_ERROR");
    const all = iterate(formula, 3, false);
    expect(all.results).toHaveLength(3);
    expect(all.results[2]?.value.toString()).toBe("2");
  });

  it("fails once for a formula that does not parse", () => {
    const result = iterate("(1", 5);
    expect(result.results).toHaveLength(1);
    expect(result.error.name).toBe("SYNTAX_ERROR");
  });

  it("has no iterations for a count of 0", () => expect(iterate("1", 0).results).toHaveLength(0));
});
