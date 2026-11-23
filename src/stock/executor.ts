import type { IError, IObject, IValue } from "../abstractions/primitives.js";
import { Errors, Executor, type IterationExecutionResult, TypeNames, Value } from "../core/index.js";
import { type IndicatorContext, type PatternContext, StrategyContext } from "./contexts.js";

function operationError(message: string): IValue {
  return Value.error(Errors.operationError(message));
}

/** Kind of an indicator result: Null, Number or Object (of Numbers); `undefined` for a value that is not allowed. */
function kind(value: IValue): string | undefined {
  switch (value.type.base) {
    case TypeNames.Null:
    case TypeNames.Number:
      return value.type.base;
    case TypeNames.Object: {
      const object = value.raw as IObject;
      return object.keys.every((key) => object.getProperty(key)?.getValue().type.base === TypeNames.Number)
        ? TypeNames.Object
        : undefined;
    }
    default:
      return undefined;
  }
}

const notAllowed = (iteration: number, problem: string): IValue =>
  operationError(`Iteration ${iteration} of the indicator returned ${problem}.`);

function sameKeys(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((key) => b.has(key));
}

/** Result of a pattern formula: the indices of the candles where the pattern occurs. */
export interface PatternResult {
  readonly indices: readonly number[];
  readonly error: IError;
  readonly successful: boolean;
  readonly iterations: IterationExecutionResult;
}

/** Result of a strategy formula: one signal from -1 (sell) to 1 (buy) per candle; `null` where none was computed. */
export interface StrategyResult {
  readonly signals: readonly (number | null)[];
  readonly error: IError;
  readonly successful: boolean;
  readonly iterations: IterationExecutionResult;
}

/**
 * Executes the formulas of the Stock context types (indicators, patterns, strategies) and checks their expected
 * results (docs/standards/stock/README.md, "Context structure").
 */
export class StockExecutor {
  constructor(readonly executor: Executor = Executor.create()) {}

  /**
   * Runs an indicator formula once per candle. The result is an Array with one value per candle: every non-null
   * value is a Number, or every one is an Object of Numbers with the same keys; otherwise `OPERATION_ERROR`.
   * An Error of an iteration is returned as it is.
   */
  executeIndicator(formula: string, context: IndicatorContext): IValue {
    const run = this.executor.executeIterations(formula, context, true);
    if (!run.successful) return Value.error(run.error);
    let resultKind: string | undefined;
    let keys: ReadonlySet<string> | undefined;
    const values: IValue[] = [];
    for (const value of run.values) {
      const current = kind(value);
      if (current === undefined)
        return notAllowed(values.length, "a value that is not allowed in the Indicator Context");
      if (current === TypeNames.Object) {
        const objectKeys = new Set((value.raw as IObject).keys);
        if (keys !== undefined && !sameKeys(keys, objectKeys)) {
          return notAllowed(values.length, "an Object with other keys than the previous results");
        }
        keys = objectKeys;
      }
      if (current !== TypeNames.Null) {
        if (resultKind !== undefined && resultKind !== current) {
          return notAllowed(values.length, "another kind of value than the previous results");
        }
        resultKind = current;
      }
      values.push(value);
    }
    return Value.array(values);
  }

  /** Runs a pattern formula once per candle; every result must be a Boolean. */
  executePattern(formula: string, context: PatternContext, stopOnError = true): PatternResult {
    const run = this.executor.executeIterations(formula, context, stopOnError);
    const indices: number[] = [];
    let error = run.error;
    for (let i = 0; i < run.results.length; i++) {
      const result = run.results[i]!;
      if (result.value.type.base === TypeNames.Boolean) {
        if (result.value.raw === true) indices.push(i);
      } else if (result.successful && error.isSuccess()) {
        error = Errors.operationError(`Iteration ${i} of the pattern returned a value that is not a Boolean.`);
        if (stopOnError) break;
      }
    }
    return { indices, error, successful: error.isSuccess(), iterations: run };
  }

  /**
   * Runs a pattern formula once per candle and returns its whole series, as `LOAD_PATTERN` does
   * (docs/standards/stock/functions/LOAD_PATTERN.md): an Array of `N` Booleans; the Error of an iteration; or
   * `OPERATION_ERROR` if an iteration returns a value that is not a Boolean.
   */
  executePatternSeries(formula: string, context: PatternContext): IValue {
    const result = this.executePattern(formula, context, true);
    if (!result.successful) return Value.error(result.error);
    return Value.array(result.iterations.values);
  }

  /** Runs a strategy formula once per candle; every result must be a Number, which is clamped to [-1, 1]. */
  executeStrategy(formula: string, context: StrategyContext, stopOnError = true): StrategyResult {
    const run = this.executor.executeIterations(formula, context, stopOnError);
    const signals: (number | null)[] = [];
    let error = run.error;
    for (let i = 0; i < run.results.length; i++) {
      const result = run.results[i]!;
      if (result.value.type.base === TypeNames.Number && typeof result.value.raw === "number") {
        signals.push(Math.min(Math.max(result.value.raw, StrategyContext.sell), StrategyContext.buy));
        continue;
      }
      signals.push(null);
      if (result.successful && error.isSuccess()) {
        error = Errors.operationError(`Iteration ${i} of the strategy returned a value that is not a Number.`);
        if (stopOnError) break;
      }
    }
    return { signals, error, successful: error.isSuccess(), iterations: run };
  }
}
