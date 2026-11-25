/**
 * Runner of the language-independent conformance tests of the standard (FormuLang `tests/README.md`, copied to
 * `tests/conformance/spec`): builds the environment, the context and the registry of a case, executes its formula
 * and compares the outcome with `expected`. A port of the `ConformanceRunner` of FormuLang.NET.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CoreStandard,
  Environment,
  type ExecutionResult,
  Executor,
  FlObject,
  type IError,
  type IObject,
  type IValue,
  IterationContext,
  TimeContext,
  TypeNames,
  Validator,
  Value,
} from "../../src/index.js";
import {
  type Candle,
  type FormulaCollection,
  IndicatorContext,
  PatternContext,
  StockContext,
  StockStandard,
  StrategyContext,
  registerStock,
} from "../../src/stock/index.js";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

export interface ConformanceCase {
  readonly id: string;
  readonly file: string;
  readonly standards: readonly string[];
  readonly context: JsonObject;
  readonly environment: JsonObject | undefined;
  readonly registry: JsonObject | undefined;
  readonly formula: string;
  readonly expected: JsonObject;
}

/** Standards implemented by the library. A case that requires another standard is skipped. */
// The 1.1 versions are backward compatible, so the cases of the 1.0 versions apply too
export const supportedStandards: ReadonlySet<string> = new Set([
  ...CoreStandard.compatibleIdentifiers,
  CoreStandard.identifier,
  ...StockStandard.compatibleIdentifiers,
  StockStandard.identifier,
]);

export const specDirectory = join(dirname(fileURLToPath(import.meta.url)), "spec");

// Loading

function jsonFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return jsonFiles(path);
      return entry.name.endsWith(".json") && entry.name !== "schema.json" ? [path] : [];
    })
    .sort();
}

/** A formula is a text, or an array of lines joined with a new line. */
const readFormula = (formula: Json): string => (Array.isArray(formula) ? formula.join("\n") : (formula as string));

export function loadCases(): ConformanceCase[] {
  const cases: ConformanceCase[] = [];
  const ids = new Set<string>();
  for (const path of jsonFiles(specDirectory)) {
    const file = relative(specDirectory, path).replaceAll("\\", "/");
    const root = JSON.parse(readFileSync(path, "utf8")) as JsonObject;
    const standards = root["standards"] as string[];
    const defaults = root["defaults"] as JsonObject | undefined;
    for (const item of root["cases"] as JsonObject[]) {
      const id = item["id"] as string;
      if (ids.has(id)) throw new Error(`The case identifier "${id}" is used more than once.`);
      ids.add(id);
      const pick = (key: string): JsonObject | undefined => (item[key] ?? defaults?.[key]) as JsonObject | undefined;
      cases.push({
        id,
        file,
        standards: [...standards, ...((item["standards"] as string[] | undefined) ?? [])],
        context: pick("context") ?? { type: "Default" },
        environment: pick("environment"),
        registry: pick("registry"),
        formula: readFormula(item["formula"]!),
        expected: item["expected"] as JsonObject,
      });
    }
  }
  return cases;
}

// Running

/** Executes the case and returns the problems found; an empty list means that the case passed. */
export function runCase(testCase: ConformanceCase): string[] {
  const environment = createEnvironment(testCase);
  const [name, expected] = Object.entries(testCase.expected)[0]!;
  const problems: string[] = [];
  switch (name) {
    case "errors":
      compareValidation(new Validator().validate(testCase.formula, environment).errors, expected as Json[], problems);
      break;
    case "results": {
      const results = executeAll(testCase, environment);
      const items = expected as Json[];
      if (results.length !== items.length) {
        problems.push(`${results.length} iterations were executed, ${items.length} expected.`);
      }
      for (let i = 0; i < Math.min(results.length, items.length); i++) {
        compareOutcome(results[i]!, items[i]!, `iteration ${i}: `, problems);
      }
      break;
    }
    case "result":
      compareOutcome(executeSingle(testCase, environment), expected, "", problems);
      break;
    case "error": {
      const result = executeSingle(testCase, environment);
      const { code, message } = expected as { code: string; message?: string };
      if (result.successful) problems.push(`Expected ${code}, but the execution succeeded with ${result.toString()}.`);
      else if (result.error.name !== code)
        problems.push(`Expected ${code}, got ${result.error.name}: ${result.error.message}`);
      else if (message !== undefined && message !== result.error.message) {
        problems.push(`Expected the message "${message}", got "${result.error.message}".`);
      }
      break;
    }
    default:
      problems.push(`Unknown expected outcome "${name}".`);
  }
  return problems;
}

const contextType = (testCase: ConformanceCase): string => testCase.context["type"] as string;

function executeSingle(testCase: ConformanceCase, environment: Environment): ExecutionResult {
  if (contextType(testCase) === "Default") return Executor.create().execute(testCase.formula, environment);
  // A single outcome of an iterated context: the first failed iteration, or the last one
  const results = executeAll(testCase, environment);
  return results.find((r) => !r.successful) ?? results.at(-1)!;
}

function executeAll(testCase: ConformanceCase, environment: Environment): readonly ExecutionResult[] {
  const executor = Executor.create();
  const context = testCase.context;
  switch (contextType(testCase)) {
    case "Default":
      return [executor.execute(testCase.formula, environment)];
    case "Iteration":
      return executor.executeIterations(
        testCase.formula,
        IterationContext.create(environment, context["n"] as number),
        false,
      ).results;
    case "Time": {
      const frames = (context["frames"] as JsonObject[]).map((frame) => ({
        timeSeconds: frame["time_s"] as number,
        deltaSeconds: frame["dtime_s"] as number,
        ...(typeof frame["now"] === "number" ? { now: frame["now"] } : {}),
      }));
      return executor.executeFrames(testCase.formula, TimeContext.create(environment), frames, false).results;
    }
    default:
      return executor.executeIterations(testCase.formula, createStockContext(context, environment, executor), false)
        .results;
  }
}

function createStockContext(context: JsonObject, environment: Environment, executor: Executor): StockContext {
  const candles = (context["candles"] as JsonObject[]).map(readCandle);
  const parameters = context["parameters"] === undefined ? undefined : (toValue(context["parameters"]).raw as IObject);
  switch (context["type"]) {
    case "Stock":
      return StockContext.create(environment, candles, executor);
    case "Indicator": {
      const source = context["source"] as (number | null)[] | undefined;
      return IndicatorContext.create(environment, candles, executor, parameters, source);
    }
    case "Pattern":
      return PatternContext.create(environment, candles, executor, parameters);
    case "Strategy":
      return StrategyContext.create(environment, candles, executor);
    default:
      throw new Error(`Unknown context type "${String(context["type"])}".`);
  }
}

function readCandle(candle: JsonObject): Candle {
  const optional = (key: string): number | null => (typeof candle[key] === "number" ? candle[key] : null);
  return {
    open: candle["open"] as number,
    high: candle["high"] as number,
    low: candle["low"] as number,
    close: candle["close"] as number,
    volume: optional("volume"),
    time: optional("time"),
  };
}

// Environment

function createEnvironment(testCase: ConformanceCase): Environment {
  const environment = Environment.create();
  if (testCase.standards.some((s) => s.startsWith("stock-"))) {
    const registry = registerStock(environment).registry;
    if (testCase.registry !== undefined) {
      addDefinitions(testCase.registry, "indicators", registry.indicators);
      addDefinitions(testCase.registry, "patterns", registry.patterns);
    }
  }
  // Deterministic tests: NOW is 0 unless the case gives it
  environment.setNow(0);
  const changes = testCase.environment;
  if (changes === undefined) return environment;
  for (const [name, value] of Object.entries((changes["constants"] as JsonObject | undefined) ?? {})) {
    environment.setConstant(name, toValue(value));
  }
  for (const [name, value] of Object.entries((changes["variables"] as JsonObject | undefined) ?? {})) {
    // The value may have a wrong type on purpose, to test the validation
    environment.removeProperty(name);
    environment.initVariable(name, toValue(value));
  }
  for (const name of (changes["omit"] as string[] | undefined) ?? []) environment.removeProperty(name);
  return environment;
}

function addDefinitions(registry: JsonObject, part: string, collection: FormulaCollection): void {
  for (const definition of (registry[part] as JsonObject[] | undefined) ?? []) {
    const parameters = Object.entries((definition["parameters"] as JsonObject | undefined) ?? {}).map(
      ([name, value]) => [name, toValue(value)] as const,
    );
    collection.add(definition["id"] as string, readFormula(definition["formula"]!), Object.fromEntries(parameters));
  }
}

// Values

/** JSON value as a FormuLang value; an object with the `$type` key has that extended type. */
export function toValue(json: Json): IValue {
  if (json === null) return Value.null();
  switch (typeof json) {
    case "boolean":
      return Value.boolean(json);
    case "number":
      return Value.number(json);
    case "string":
      return Value.text(json);
  }
  if (Array.isArray(json)) return Value.array(json.map(toValue));
  const object = new FlObject();
  let type: string | undefined;
  for (const [key, value] of Object.entries(json)) {
    if (key === "$type") type = value as string;
    else object.initVariable(key, toValue(value));
  }
  return Value.object(object, type);
}

function compareOutcome(result: ExecutionResult, expected: Json, prefix: string, problems: string[]): void {
  if (expected !== null && typeof expected === "object" && !Array.isArray(expected) && "$error" in expected) {
    const code = expected["$error"] as string;
    if (result.successful) problems.push(`${prefix}expected ${code}, got ${result.toString()}.`);
    else if (result.error.name !== code) {
      problems.push(`${prefix}expected ${code}, got ${result.error.name}: ${result.error.message}`);
    }
    return;
  }
  if (!result.successful) {
    problems.push(`${prefix}expected ${JSON.stringify(expected)}, got ${result.error.name}: ${result.error.message}`);
    return;
  }
  if (!valueEquals(result.value, expected)) {
    problems.push(`${prefix}expected ${JSON.stringify(expected)}, got ${result.toString()}.`);
  }
}

/**
 * Numbers are equal if they differ by at most `1e-9` times the larger absolute value (or by `1e-12` near 0).
 * Object keys are compared in order. Delegates are not compared.
 */
export function valueEquals(actual: IValue, expected: Json): boolean {
  if (expected === null) return actual.type.base === TypeNames.Null;
  switch (typeof expected) {
    case "boolean":
      return actual.raw === expected;
    case "number": {
      if (actual.type.base !== TypeNames.Number || typeof actual.raw !== "number") return false;
      const scale = Math.max(Math.abs(actual.raw), Math.abs(expected));
      return Math.abs(actual.raw - expected) <= (scale < 1e-3 ? 1e-12 : 1e-9 * scale);
    }
    case "string":
      return actual.type.base === TypeNames.Text && actual.raw === expected;
  }
  if (Array.isArray(expected)) {
    if (actual.type.base !== TypeNames.Array) return false;
    const elements = actual.raw as readonly IValue[];
    return elements.length === expected.length && elements.every((e, i) => valueEquals(e, expected[i]!));
  }
  if (actual.type.base === TypeNames.Delegate) return true;
  if (actual.type.base !== TypeNames.Object) return false;
  const object = actual.raw as IObject;
  const properties = Object.entries(expected).filter(([key]) => key !== "$type");
  const type = expected["$type"] as string | undefined;
  return (
    actual.type.extended === type &&
    object.keys.length === properties.length &&
    object.keys.every((key, i) => key === properties[i]![0]) &&
    properties.every(([key, value]) => valueEquals(object.getProperty(key)!.getValue(), value))
  );
}

function compareValidation(errors: readonly IError[], expected: Json[], problems: string[]): void {
  if (errors.length !== expected.length) {
    problems.push(
      `Expected ${expected.length} validation errors, got ${errors.length}: ` +
        errors.map((e) => `${e.name}: ${e.message}`).join("; "),
    );
  }
  for (let i = 0; i < Math.min(errors.length, expected.length); i++) {
    const { code, message } = expected[i] as { code: string; message?: string };
    if (errors[i]!.name !== code) problems.push(`Error ${i}: expected ${code}, got ${errors[i]!.name}.`);
    if (message !== undefined && message !== errors[i]!.message) {
      problems.push(`Error ${i}: expected "${message}", got "${errors[i]!.message}".`);
    }
  }
}
