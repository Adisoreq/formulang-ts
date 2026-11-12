import { expect } from "vitest";
import {
  Cleaner,
  Environment,
  type ExecutionResult,
  Executor,
  Parser,
  type ParsingResult,
  Tokenizer,
} from "../src/index.js";

/** Executes the formula in a new Core environment. */
export function execute(formula: string, environment: Environment = Environment.create()): ExecutionResult {
  return Executor.create().execute(formula, environment);
}

/** Executes the formula in a new Core environment and returns the serialized result (`Value.toString()`). */
export function run(formula: string): string {
  return execute(formula).value.toString();
}

/**
 * Compares a result with an expected one. An expected value ending with `_ERROR` is compared by the error name
 * only, because the messages of errors are implementation-defined.
 */
export function expectResult(actual: string, expected: string): void {
  if (expected.endsWith("_ERROR"))
    expect(actual.startsWith(`[${expected} (`), `${actual} is not ${expected}`).toBe(true);
  else expect(actual).toBe(expected);
}

/** Readable title of a test case. */
export function title(formula: string): string {
  return JSON.stringify(formula);
}

// Stages

export const cleaner = new Cleaner();
export const tokenizer = new Tokenizer();

export function clean(formula: string): string {
  const result = cleaner.cleanUp(formula);
  expect(result.successful, result.error.toString()).toBe(true);
  return result.result;
}

export type Pair = readonly [string, string];
export function tokenize(formula: string): Pair[] {
  const result = tokenizer.tokenize(formula);
  expect(result.successful, result.error.toString()).toBe(true);
  return result.tokens.map((t) => [t.type, t.value] as const);
}

export function parse(formula: string): ParsingResult {
  const tokens = tokenizer.tokenize(clean(formula));
  expect(tokens.successful, tokens.error.toString()).toBe(true);
  return new Parser().parse(tokens.tokens);
}

export function roots(formula: string): string[] {
  const result = parse(formula);
  expect(result.successful, result.error.toString()).toBe(true);
  return result.sequences.map((s) => s.root.key);
}
