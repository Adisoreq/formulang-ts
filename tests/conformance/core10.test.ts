import { describe, expect, it } from "vitest";
import {
  Cleaner,
  Environment,
  EnvironmentVariables,
  Executor,
  IterationContext,
  TimeContext,
  Validator,
  Value,
} from "../../src/index.js";
import { expectResult, run } from "../helpers.js";
import {
  format,
  scopedComments,
  scopedComments_CleanUp,
  timeFunctions,
  timeFunctions_UseTimeOffset,
  unicodeTexts,
  validation_NowAndTimeOffsetAreWholeNumbers,
} from "./data/Core10.cases.js";

// core-1.0: scoped comments, Unicode texts, FORMAT, time functions, NOW, time_offset and the Time Context
// (Core10Tests of FormuLang.NET)

/** 2026-11-23 10:51:20.123 UTC */
const MONDAY = 1795431080123;

function runAt(formula: string, now: number, timeOffset = 0): string {
  const environment = Environment.create();
  environment.setNow(now);
  environment.setProperty(EnvironmentVariables.timeOffset, Value.number(timeOffset));
  return Executor.create().execute(formula, environment).value.toString();
}

describe("Scoped comments (docs/syntax/operators.md)", () => {
  it.each(scopedComments)("%j → %s", (formula, expected) => expectResult(run(formula), expected));

  it("reports a scoped comment that is not closed", () =>
    expect(run("$a = 1 <# note")).toBe("[SYNTAX_ERROR (2)] Scoped comment is not closed at line 1, column 8."));

  it.each(scopedComments_CleanUp)("clean-up of %j → %j", (formula, expected) =>
    expect(new Cleaner().cleanUp(formula).result).toBe(expected),
  );
});

describe("Unicode texts (docs/syntax/symbols.md)", () => {
  it.each(unicodeTexts)("%j → %s", (formula, expected) => expectResult(run(formula), expected));

  it("does not allow Unicode in identifiers", () =>
    expect(run("$zółw = 1")).toBe('[SYNTAX_ERROR (2)] Invalid symbol "ó" at line 1, column 3.'));
});

describe("FORMAT (docs/standards/core/functions/FORMAT.md)", () => {
  it.each(format)("%j → %s", (formula, expected) => expectResult(run(formula), expected));

  it("follows @array_indexing", () => expect(run('@array_indexing = 1\nFORMAT("{1}-{2}", ["a", "b"])')).toBe("a-b"));
});

describe("Time functions (docs/standards/core/functions/README.md)", () => {
  it.each(timeFunctions)("%j → %s", (formula, expected) => expectResult(runAt(formula, MONDAY), expected));

  it.each(timeFunctions_UseTimeOffset)("@time_offset = 60: %j → %s", (formula, expected) =>
    expect(runAt(formula, MONDAY, 60)).toBe(expected),
  );

  it("reads NOW from the clock once per execution", () => {
    const environment = Environment.create();
    expect(environment.clock).toBeDefined();
    const before = Date.now();
    const result = Executor.create().execute("$a = NOW\n[$a == NOW, NOW]", environment);
    const after = Date.now();
    const values = result.value.raw as readonly Value[];
    expect(values[0]!.raw).toBe(true);
    expect(values[1]!.raw).toBeGreaterThanOrEqual(before);
    expect(values[1]!.raw).toBeLessThanOrEqual(after);
  });

  it.each(validation_NowAndTimeOffsetAreWholeNumbers)("validation: %s = %d → %s", (name, value, message) => {
    const environment = Environment.create();
    environment.clock = undefined;
    if (name === "NOW") environment.setConstant(name, Value.number(value));
    else environment.setProperty(name, Value.number(value));
    expect(new Validator().validate("1", environment).error.message).toBe(message);
  });
});

describe("Iteration Context and Time Context (docs/core/context.md)", () => {
  it("keeps NOW the same in all iterations", () => {
    const environment = Environment.create();
    environment.setNow(1000);
    const result = Executor.create().executeIterations("NOW", IterationContext.create(environment, 3));
    expect(result.values.map(String)).toEqual(["1000", "1000", "1000"]);
  });

  it("sets the time constants of every frame", () => {
    const runner = Executor.create().createFrameRunner(
      "[FRAME, TIME_S, TIME_MS, DTIME_S, DTIME_MS]",
      TimeContext.create(Environment.create()),
    );
    expect(runner.nextFrame(0).value.toString()).toBe("[0, 0, 0, 0, 0]");
    expect(runner.nextFrame(0.5).value.toString()).toBe("[1, 0.5, 500, 0.5, 500]");
    expect(runner.nextFrame(1.25).value.toString()).toBe("[2, 1.25, 1250, 0.75, 750]");
  });

  it("passes only PREV from one frame to the next", () => {
    const formula = "$speed = 5\n$position = IF(ISNULL(PREV), 0, PREV)\nMIN($position + $speed * DTIME_S, 100)";
    const result = Executor.create().executeFrames(formula, TimeContext.create(Environment.create()), [
      { timeSeconds: 0, deltaSeconds: 0 },
      { timeSeconds: 0.5, deltaSeconds: 0.5 },
      { timeSeconds: 1, deltaSeconds: 0.5 },
    ]);
    expect(result.values.map(String)).toEqual(["0", "2.5", "5"]);
  });

  it("follows @array_indexing in FRAME and sets NOW for every frame", () => {
    const environment = Environment.create();
    environment.setProperty(EnvironmentVariables.arrayIndexing, Value.number(1));
    const result = Executor.create().executeFrames("[FRAME, NOW]", TimeContext.create(environment), [
      { timeSeconds: 0, deltaSeconds: 0, now: 1000 },
      { timeSeconds: 0.5, deltaSeconds: 0.5, now: 1500 },
    ]);
    expect(result.values.map(String)).toEqual(["[1, 1000]", "[2, 1500]"]);
  });

  it("fails in every frame for an invalid formula", () => {
    const runner = Executor.create().createFrameRunner("(1", TimeContext.create(Environment.create()));
    expect(runner.preparationError).toBeDefined();
    expect(runner.nextFrame(0).error.name).toBe("SYNTAX_ERROR");
  });

  it("never lets the time decrease", () => {
    const context = TimeContext.create(Environment.create());
    context.beginFrame(0, 1, 0);
    expect(() => context.beginFrame(1, 0.5, 0)).toThrow(RangeError);
  });
});
