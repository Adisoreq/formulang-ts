import { describe, expect, it } from "vitest";
import type { PreparedFormula } from "../../src/index.js";
import {
  Context,
  Environment,
  ExecutionResult,
  Executor,
  IterationContext,
  TimeContext,
  Value,
  WarningCode,
  readMetadata,
  serialize,
} from "../../src/index.js";

// Core 1.2: the examples of the documents of the standard that the JSON conformance tests do not cover, and the API
// of the library for the memory, the prepared formulas and the resumed iterations.

function iterate(formula: string, count: number, stopOnError = false): string[] {
  const context = IterationContext.create(Environment.create(), count);
  return Executor.create()
    .executeIterations(formula, context, stopOnError)
    .results.map((r) => r.toString());
}

function prepare(formula: string, context: Context = Context.create(Environment.create())): PreparedFormula {
  const prepared = Executor.create().prepare(formula, context);
  if (prepared instanceof ExecutionResult) throw new Error(prepared.toString());
  return prepared;
}

describe("Memory (docs/core/context.md, Memory)", () => {
  it("keeps a count between iterations (docs/core/context.md)", () => {
    const context = IterationContext.create(Environment.create(), 4);
    const source = Value.array([5, 20, 30, 1].map((n) => Value.number(n)));
    context.setConstant("SOURCE", source);
    const run = Executor.create().executeIterations(
      '$count = RECALL("count", 0) + IF(SOURCE[I] > 10, 1, 0)\nSTORE("count", $count)\n$count',
      context,
    );
    expect(run.results.map((r) => r.toString())).toEqual(["0", "1", "2", "2"]);
  });

  it("gives the previous value of a series (RECALL.md)", () =>
    expect(iterate('$prev = RECALL("close")\nSTORE("close", I * 2)\n$prev', 3)).toEqual(["null", "0", "2"]));

  it("discards the writes in the branch of IF that is not selected, also in a nested IF", () =>
    expect(iterate('IF(I > 0, IF(I == 1, STORE("x", I), STORE("x", 100)), 0)\nRECALL("x")', 4)).toEqual([
      "null",
      "null",
      "1",
      "100",
    ]));

  it("discards the writes in the arguments of AND after the deciding one", () =>
    expect(
      iterate('$t = AND(I == 1, ISERR(STORE("x", I)), ISERR(STORE("y", I)))\n[RECALL("x"), RECALL("y")]', 3),
    ).toEqual(["[null, null]", "[null, null]", "[1, 1]"]));

  it("discards the writes of IF whose condition is not a Boolean (no branch is selected)", () =>
    expect(iterate('$t = IFERR(IF(1, STORE("x", I), STORE("y", I)), 0)\n[RECALL("x"), RECALL("y")]', 2)).toEqual([
      "[null, null]",
      "[null, null]",
    ]));

  it("keeps the writes of a lambda invoked on the selected path, and discards the others", () =>
    expect(
      iterate(
        '$r = MAP([1, 2], (e) => IF(e == 2, STORE("x", I), 0))\n$s = IF(false, MAP([1], (e) => STORE("y", 1)), 0)\n[RECALL("x"), RECALL("y")]',
        3,
      ),
    ).toEqual(["[null, null]", "[0, null]", "[1, null]"]));

  it("applies the writes of a frame of a Time Context from the next frame", () => {
    const context = TimeContext.create(Environment.create());
    const run = Executor.create().executeFrames('STORE("t", TIME_S)\nRECALL("t", -1)', context, [
      { timeSeconds: 0, deltaSeconds: 0 },
      { timeSeconds: 1, deltaSeconds: 1 },
    ]);
    expect(run.results.map((r) => r.toString())).toEqual(["-1", "0"]);
    expect(context.memory.recall("t")?.toString()).toBe("1");
  });

  it("is empty again when the iterations start again", () => {
    const context = IterationContext.create(Environment.create(), 2);
    const executor = Executor.create();
    const formula = '$c = RECALL("c", 0) + 1\nSTORE("c", $c)\n$c';
    executor.executeIterations(formula, context);
    expect(executor.executeIterations(formula, context).values.map(String)).toEqual(["1", "2"]);
  });

  it("can be read and restored by the host application", () => {
    const context = IterationContext.create(Environment.create(), 1);
    context.memory.load([["x", Value.number(7)]]);
    context.beginIteration(0);
    expect(context.memory.size).toBe(0); // the first iteration starts with an empty memory
    context.memory.load([["x", Value.number(7)]]);
    expect(Executor.create().execute('RECALL("x")', context).toString()).toBe("7");
    expect(context.memory.entries().map(([key, value]) => `${key}=${serialize(value)}`)).toEqual(["x=7"]);
  });

  it("does not let IF skip a branch with a function that has side effects", () => {
    // STORE and CLEAR do not prevent the optimization of IF; the result is the same with and without it
    expect(iterate('$v = IF(I == 0, 1, STORE("x", I))\nRECALL("x")', 3)).toEqual(["null", "null", "1"]);
  });
});

describe("AND and OR (docs/standards/core/functions/AND.md, Short circuit)", () => {
  const run = (formula: string): string => Executor.create().execute(formula, Environment.create()).toString();

  it.each([
    ["AND(true, 1, false)", "false"],
    ["OR(false, 1, true)", "true"],
    ['AND(true, ERROR("x"), false)', "[CUSTOM_ERROR (1)] x"],
    ["AND(false)", "ARGUMENT_ERROR"],
    ["OR(true)", "ARGUMENT_ERROR"],
    ["true && true && true", "true"],
    ["false || false || true", "true"],
    ["OR(false, false)", "false"],
    ["AND(true, true, true, true, true)", "true"],
  ])("%s → %s", (formula, expected) => {
    const result = run(formula);
    if (expected.endsWith("_ERROR")) expect(result.startsWith(`[${expected} (`)).toBe(true);
    else expect(result).toBe(expected);
  });
});

describe("HISTORY and resumed iterations (docs/core/context.md)", () => {
  it("is null for an iteration that resulted in an Error", () =>
    expect(iterate('IF(I == 1, ERROR("e"), HISTORY)', 3)).toEqual(["[]", "[CUSTOM_ERROR (1)] e", "[[], null]"]));

  it("gives at most 3 BUY signals (docs/core/context.md, Resumed iterations)", () => {
    const context = IterationContext.create(Environment.create(), 6);
    context.setConstant("BUY", Value.number(1));
    context.setConstant("NEUTRAL", Value.number(0));
    const run = Executor.create().executeIterations(
      "$buys = LEN(FILTER(HISTORY, (r) => r == BUY))\nIF($buys < 3, BUY, NEUTRAL)",
      context,
    );
    expect(run.values.map(String)).toEqual(["1", "1", "1", "0", "0", "0"]);
  });

  it("continues with the same results as executing all the iterations again", () => {
    const formula = '$sum = RECALL("sum", 0) + I\nSTORE("sum", $sum)\n[$sum, LEN(HISTORY), IFNULL(PREV, -1)]';
    const executor = Executor.create();
    const all = executor.executeIterations(formula, IterationContext.create(Environment.create(), 5));

    const context = IterationContext.create(Environment.create(), 3);
    const prepared = prepare(formula, context);
    const first = executor.executeIterations(prepared, context);
    expect(context.completedIterations).toBe(3);
    context.extend(5);
    const rest = executor.resumeIterations(prepared, context);
    expect([...first.values, ...rest.values].map(String)).toEqual(all.values.map(String));
    expect(executor.resumeIterations(prepared, context).results).toHaveLength(0);
  });

  it("does not shrink the number of iterations", () =>
    expect(() => IterationContext.create(Environment.create(), 3).extend(2)).toThrow(RangeError));
});

describe("Prepared formulas (docs/semantics/execution.md, Execution modes)", () => {
  it("gives the same result in a hot execution as in a cold one", () => {
    const environment = Environment.create();
    const executor = Executor.create();
    const prepared = prepare("$a = 2\n$a * PI", Context.create(environment));
    const cold = executor.execute("$a = 2\n$a * PI", environment).toString();
    expect(executor.evaluate(prepared, Context.create(environment)).toString()).toBe(cold);
    expect(executor.evaluate(prepared, Context.create(environment)).toString()).toBe(cold);
  });

  it("prepares the formula again for another environment", () => {
    const prepared = prepare("1 + 1");
    const other = Environment.create();
    expect(Executor.create().evaluate(prepared, Context.create(other)).toString()).toBe("2");
  });

  it("checks the environment before the first hot execution in a context", () => {
    const prepared = prepare("1 + 1");
    const broken = Environment.create();
    broken.removeProperty("PI");
    const result = Executor.create().evaluate(prepared, Context.create(broken));
    expect(result.successful).toBe(false);
    expect(result.error.name).toBe("ENVIRONMENT_ERROR");
  });
});

describe("Metadata (docs/core/metadata.md)", () => {
  const block = '<@ {\n  id: "sma-cross",\n  parameters: { fast: { type: "Number", default: 10, min: 1 } }\n} @>\n';

  it("reads the metadata without an environment", () => {
    const reading = readMetadata(`${block}PARAMETERS.fast`);
    expect(reading.successful).toBe(true);
    expect(serialize(reading.metadata)).toBe(
      '{ id: "sma-cross", parameters: { fast: { type: "Number", default: 10, min: 1 } } }',
    );
    // The block is replaced by white space, so the rest of the formula keeps its positions
    expect(reading.formula.split("\n")[4]).toBe("PARAMETERS.fast");
  });

  it("is a part of the prepared formula", () =>
    expect(serialize(prepare(`${block}1`).metadata)).toBe(
      '{ id: "sma-cross", parameters: { fast: { type: "Number", default: 10, min: 1 } } }',
    ));

  it("gives the same result as the formula without it", () => {
    const executor = Executor.create();
    expect(executor.execute(`${block}$x = 2 # c\n$x ^ 2`, Environment.create()).toString()).toBe("4");
  });

  it.each([
    ["<@ { a: 1 }", "The metadata block is not closed (line 1, column 1)."],
    ["# c\n  <@ [1] @>\n1", "The metadata block (line 2, column 3) must contain one Object literal."],
    [
      "<@ { a: $x } @>\n1",
      "The metadata block (line 1, column 1) may contain only constant values: Number, Text and Boolean literals, " +
        "null, and Arrays and Objects of them.",
    ],
  ])("%j is a SYNTAX_ERROR", (formula, message) => {
    const result = Executor.create().execute(formula, Environment.create());
    expect(result.error.name).toBe("SYNTAX_ERROR");
    expect(result.error.message).toBe(message);
  });
});

describe("Warnings (docs/standards/core/semantics/warnings.md)", () => {
  it("have the position of the sequence and the message of the standard", () => {
    const warnings = prepare("$a = 1\n\n# comment\n  $a + 1; $a\n$x = $a\n- $a\n$x").warnings;
    expect(warnings.map((w) => [w.code, w.line, w.column, w.message])).toEqual([
      [WarningCode.UnusedValue, 4, 3, "The value of the sequence at line 4 is not used."],
      [WarningCode.UnusedValue, 4, 11, "The value of the sequence at line 4 is not used."],
      [WarningCode.UnusedValue, 6, 1, "The value of the sequence at line 6 is not used."],
      [
        WarningCode.ContinuedLine,
        6,
        1,
        'The sequence at line 6 starts with "-": a new line ends the previous sequence. Put the operator at the end ' +
          "of the previous line, or the expression in parentheses.",
      ],
    ]);
  });

  it("are positioned in the original text after a scoped comment and a metadata block", () => {
    const warnings = prepare("<@ {\n  id: 1\n} @> <# a\nb #> $a = 1; $a\n$a").warnings;
    expect(warnings.map((w) => `${w.code} ${w.line}:${w.column}`)).toEqual(["METADATA_TYPE 1:1", "UNUSED_VALUE 4:14"]);
    expect(warnings[0]!.message).toBe('Metadata key "id" must be of type Text.');
  });

  it("check the nested keys of the metadata", () => {
    const warnings = prepare(
      '<@ { parameters: { p: { min: "1" }, q: 2 }, result: [1], x: { anything: 1 } } @>\n1',
    ).warnings;
    expect(warnings.map((w) => w.message)).toEqual([
      'Metadata key "parameters.p.min" must be of type Number.',
      'Metadata key "parameters.q" must be of type Object.',
      'Metadata key "result" must be of type Text or Array of Text.',
    ]);
  });

  it("compare the context of the metadata with the context type and its base types", () => {
    const iteration = IterationContext.create(Environment.create(), 1);
    expect(prepare('<@ { context: "Default" } @>\n1', iteration).warnings).toEqual([]);
    expect(prepare('<@ { context: "Time" } @>\n1', iteration).warnings.map((w) => w.message)).toEqual([
      'The formula is written for the context "Time", but is executed in "Iteration".',
    ]);
  });

  it("are not reported for a new line inside parentheses or after a semicolon", () => {
    expect(prepare("$a = 1\n$x = ($a\n- 1)\n$x").warnings).toEqual([]);
    expect(prepare("$a = 1;\n- $a").warnings).toEqual([]);
  });

  it("are a part of the result of an execution", () =>
    expect(
      Executor.create()
        .execute("1\n2", Environment.create())
        .warnings.map((w) => w.code),
    ).toEqual([WarningCode.UnusedValue]));

  it("give a SYNTAX_ERROR with the message of the standard for a line that starts with a binary operator", () => {
    const result = Executor.create().execute("$a = true\n\n$b = $a\n  && true", Environment.create());
    expect(result.error.message).toBe(
      'Line 4 starts with "&&", which has no left operand: a new line ends the previous sequence. Put "&&" at the ' +
        "end of the previous line, or the expression in parentheses.",
    );
  });
});
