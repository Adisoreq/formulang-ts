import type { IError, IObject, IValue } from "../abstractions/primitives.js";
import {
  Errors,
  ExecutionResult,
  Executor,
  type FormulaSource,
  IterationExecutionResult,
  TypeNames,
  Value,
} from "../core/index.js";
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
  /**
   * The signal object of every candle (since `stock-1.2`, with `signal`, `reason`, `checks` and the keys of the host
   * application), or `undefined` where the formula returned a Number or no signal was computed.
   */
  readonly signalObjects: readonly (IObject | undefined)[];
  readonly error: IError;
  readonly successful: boolean;
  readonly iterations: IterationExecutionResult;
}

/**
 * The `OPERATION_ERROR` of the results of an indicator that break the expected result of the Indicator Context
 * (every non-null result is a Number, or every one is an Object of Numbers with the same keys), or `undefined`.
 */
export function indicatorResultsError(values: readonly IValue[]): IValue | undefined {
  let resultKind: string | undefined;
  let keys: ReadonlySet<string> | undefined;
  for (let i = 0; i < values.length; i++) {
    const value = values[i]!;
    const current = kind(value);
    if (current === undefined) return notAllowed(i, "a value that is not allowed in the Indicator Context");
    if (current === TypeNames.Object) {
      const objectKeys = new Set((value.raw as IObject).keys);
      if (keys !== undefined && !sameKeys(keys, objectKeys)) {
        return notAllowed(i, "an Object with other keys than the previous results");
      }
      keys = objectKeys;
    }
    if (current !== TypeNames.Null) {
      if (resultKind !== undefined && resultKind !== current) {
        return notAllowed(i, "another kind of value than the previous results");
      }
      resultKind = current;
    }
  }
  return undefined;
}

/** The `OPERATION_ERROR` of an iteration of a pattern that returned a value that is not a Boolean. */
export function patternResultError(iteration: number): IError {
  return Errors.operationError(`Iteration ${iteration} of the pattern returned a value that is not a Boolean.`);
}

/** The `OPERATION_ERROR` of an iteration of a strategy that returned neither a Number nor a signal object. */
export function strategyResultError(iteration: number): IError {
  return Errors.operationError(
    `Iteration ${iteration} of the strategy returned a value that is neither a Number nor a signal object.`,
  );
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
  executeIndicator(formula: FormulaSource, context: IndicatorContext): IValue {
    const run = this.executor.executeIterations(formula, context, true);
    if (!run.successful) return Value.error(run.error);
    return indicatorResultsError(run.values) ?? Value.array(run.values);
  }

  /** Runs a pattern formula once per candle; every result must be a Boolean. */
  executePattern(formula: FormulaSource, context: PatternContext, stopOnError = true): PatternResult {
    const run = this.executor.executeIterations(formula, context, stopOnError);
    const indices: number[] = [];
    let error = run.error;
    for (let i = 0; i < run.results.length; i++) {
      const result = run.results[i]!;
      if (result.value.type.base === TypeNames.Boolean) {
        if (result.value.raw === true) indices.push(i);
      } else if (result.successful && error.isSuccess()) {
        error = patternResultError(i);
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
  executePatternSeries(formula: FormulaSource, context: PatternContext): IValue {
    const result = this.executePattern(formula, context, true);
    if (!result.successful) return Value.error(result.error);
    return Value.array(result.iterations.values);
  }

  /**
   * Runs a strategy formula once per candle. Every result must be a Number, or since `stock-1.2` a signal object
   * `{ signal, reason?, checks?, ... }`; the signal is clamped to [-1, 1]. `PARAMETERS` is first completed with the
   * `default` values of the metadata of the formula (`StrategyContext.completeParameters`).
   */
  executeStrategy(formula: FormulaSource, context: StrategyContext, stopOnError = true): StrategyResult {
    const prepared = typeof formula === "string" ? this.executor.prepare(formula, context) : formula;
    let run: IterationExecutionResult;
    if (prepared instanceof ExecutionResult) {
      run = new IterationExecutionResult([prepared]);
    } else {
      context.completeParameters(prepared.metadata);
      run = this.executor.executeIterations(prepared, context, stopOnError);
    }
    const signals: (number | null)[] = [];
    const signalObjects: (IObject | undefined)[] = [];
    let error = run.error;
    for (let i = 0; i < run.results.length; i++) {
      const value = run.results[i]!.value;
      let signal = value;
      let object: IObject | undefined;
      if (value.type.base === TypeNames.Object) {
        // A valid signal object; an invalid one is an Error of the iteration (StrategyContext.finalizeResult)
        object = value.raw as IObject;
        signal = object.getProperty("signal")!.getValue();
      }
      if (signal.type.base === TypeNames.Number && typeof signal.raw === "number") {
        signals.push(Math.min(Math.max(signal.raw, StrategyContext.sell), StrategyContext.buy));
        signalObjects.push(object);
        continue;
      }
      signals.push(null);
      signalObjects.push(undefined);
      if (run.results[i]!.successful && error.isSuccess()) {
        error = strategyResultError(i);
        if (stopOnError) break;
      }
    }
    return { signals, signalObjects, error, successful: error.isSuccess(), iterations: run };
  }
}
