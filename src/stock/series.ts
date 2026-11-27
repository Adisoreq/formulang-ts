/**
 * Series functions (docs/standards/stock/functions/README.md, "Series functions") and the strategy function `SCORE`
 * of `stock-1.2`.
 *
 * Common rules of the series functions: they can be called only in a Stock Context; a series is an Array of `N`
 * elements; they work at the current candle (positions do not depend on `@array_indexing`, and the elements after the
 * current candle are never read); missing data (a `null`, or not enough candles) gives `false` or `null`, never an
 * Error.
 *
 * @module
 */
import type { IObject, IValue } from "../abstractions/primitives.js";
import { FunctionType } from "../abstractions/primitives.js";
import type { IContext } from "../abstractions/structures.js";
import { ArgumentTemplate, Errors, FlFunction, FunctionOverload, TypeNames, Types, Value } from "../core/index.js";
import { currentPosition } from "./functions.js";
import { StockFunctionNames } from "./names.js";

const operationError = (message: string): IValue => Value.error(Errors.operationError(message));
const argumentError = (message: string): IValue => Value.error(Errors.argumentError(message));
const invalidKeyError = (message: string): IValue => Value.error(Errors.invalidKeyError(message));
const isWhole = (value: number): boolean => Number.isInteger(value);

const seriesArg = (name: string): ArgumentTemplate => ArgumentTemplate.of(name, Types.Array);
const numberArg = (name: string): ArgumentTemplate => ArgumentTemplate.of(name, Types.Number);
const elements = (value: IValue | undefined): readonly IValue[] => value!.raw as readonly IValue[];
const numeric = (value: IValue | undefined): number => value!.raw as number;

function seriesFunction(name: string, ...overloads: FunctionOverload[]): FlFunction {
  return new FlFunction(name, overloads, FunctionType.Function, { sideEffectFree: true });
}

/** A `length` or `n`: a whole number of 1 or more; otherwise the `OPERATION_ERROR`. */
function lengthError(name: string, value: number, what = "length"): IValue | undefined {
  return isWhole(value) && value >= 1
    ? undefined
    : operationError(`The ${what} of "${name}" must be a whole number of 1 or more.`);
}

/** An `offset` or `occurrence`: a whole number of 0 or more; otherwise the `OPERATION_ERROR`. */
function offsetError(name: string, value: number, what: string): IValue | undefined {
  return isWhole(value) && value >= 0
    ? undefined
    : operationError(`The ${what} of "${name}" must be a whole number of 0 or more.`);
}

const notNumber = (name: string): IValue =>
  operationError(`A value of the series of "${name}" is neither a Number nor null.`);
const notBoolean = (name: string): IValue =>
  operationError(`A value of the condition of "${name}" is neither a Boolean nor null.`);

const isNull = (value: IValue): boolean => value.type.base === TypeNames.Null;
const isNumber = (value: IValue): boolean => value.type.base === TypeNames.Number;

// READY

function ready(series: readonly IValue[], n: number, context: IContext): IValue {
  const name = StockFunctionNames.ready;
  const position = currentPosition(name, series, context);
  if (typeof position !== "number") return position;
  const error = lengthError(name, n, "n");
  if (error !== undefined) return error;
  if (position + 1 < n) return Value.boolean(false);
  for (let i = position - n + 1; i <= position; i++) if (isNull(series[i]!)) return Value.boolean(false);
  return Value.boolean(true);
}

// CROSSOVER and CROSSUNDER

/** A series, or a Number that is the same at every candle. */
type Operand = readonly IValue[] | IValue;

function cross(name: string, a: Operand, b: Operand, above: boolean, context: IContext): IValue {
  let position: number | undefined;
  for (const operand of [a, b]) {
    if (!Array.isArray(operand)) continue;
    const current = currentPosition(name, operand as readonly IValue[], context);
    if (typeof current !== "number") return current;
    position = current;
  }
  if (position === undefined) return operationError(`"${name}" needs a series.`);
  if (position === 0) return Value.boolean(false);
  const at = (operand: Operand, i: number): IValue =>
    Array.isArray(operand) ? (operand as readonly IValue[])[i]! : (operand as IValue);
  const values = [at(a, position - 1), at(b, position - 1), at(a, position), at(b, position)];
  if (values.some(isNull)) return Value.boolean(false);
  if (!values.every(isNumber)) return notNumber(name);
  const [a0, b0, a1, b1] = values.map((value) => value.raw as number) as [number, number, number, number];
  return Value.boolean(above ? a0 <= b0 && a1 > b1 : a0 >= b0 && a1 < b1);
}

function crossFunction(name: string, above: boolean): FlFunction {
  const operand = (value: IValue): Operand => (value.type.base === TypeNames.Array ? elements(value) : value);
  const implementation = (a: readonly IValue[], c: IContext): IValue =>
    cross(name, operand(a[0]!), operand(a[1]!), above, c);
  return seriesFunction(
    name,
    new FunctionOverload([seriesArg("a"), seriesArg("b")], implementation),
    new FunctionOverload([seriesArg("a"), numberArg("b")], implementation),
    new FunctionOverload([numberArg("a"), seriesArg("b")], implementation),
  );
}

// HIGHEST and LOWEST

function extreme(
  name: string,
  series: readonly IValue[],
  length: number,
  offset: number,
  highest: boolean,
  context: IContext,
): IValue {
  const position = currentPosition(name, series, context);
  if (typeof position !== "number") return position;
  const error = lengthError(name, length) ?? offsetError(name, offset, "offset");
  if (error !== undefined) return error;
  const end = position - offset;
  if (end + 1 < length) return Value.null();
  let result: number | undefined;
  for (let i = end - length + 1; i <= end; i++) {
    const value = series[i]!;
    if (isNull(value)) continue;
    if (!isNumber(value)) return notNumber(name);
    const number = value.raw as number;
    if (result === undefined || (highest ? number > result : number < result)) result = number;
  }
  return result === undefined ? Value.null() : Value.number(result);
}

function extremeFunction(name: string, highest: boolean): FlFunction {
  return seriesFunction(
    name,
    new FunctionOverload([seriesArg("series"), numberArg("length")], (a, c) =>
      extreme(name, elements(a[0]), numeric(a[1]), 0, highest, c),
    ),
    new FunctionOverload([seriesArg("series"), numberArg("length"), numberArg("offset")], (a, c) =>
      extreme(name, elements(a[0]), numeric(a[1]), numeric(a[2]), highest, c),
    ),
  );
}

// RISING and FALLING

function monotonic(
  name: string,
  series: readonly IValue[],
  length: number,
  rising: boolean,
  context: IContext,
): IValue {
  const position = currentPosition(name, series, context);
  if (typeof position !== "number") return position;
  const error = lengthError(name, length);
  if (error !== undefined) return error;
  if (position < length) return Value.boolean(false);
  const window = series.slice(position - length, position + 1);
  if (window.some(isNull)) return Value.boolean(false);
  if (!window.every(isNumber)) return notNumber(name);
  for (let i = 1; i < window.length; i++) {
    const previous = window[i - 1]!.raw as number;
    const current = window[i]!.raw as number;
    if (rising ? !(current > previous) : !(current < previous)) return Value.boolean(false);
  }
  return Value.boolean(true);
}

function monotonicFunction(name: string, rising: boolean): FlFunction {
  return seriesFunction(
    name,
    new FunctionOverload([seriesArg("series"), numberArg("length")], (a, c) =>
      monotonic(name, elements(a[0]), numeric(a[1]), rising, c),
    ),
  );
}

// BARS_SINCE and VALUE_WHEN

/**
 * The position of the `true` element number `occurrence + 1` of the condition, counted from the current candle back
 * to the first one; `-1` if there is none, or the `OPERATION_ERROR` of an element that is neither a Boolean nor null.
 */
function findTrue(name: string, condition: readonly IValue[], position: number, occurrence: number): number | IValue {
  let found = 0;
  for (let i = position; i >= 0; i--) {
    const value = condition[i]!;
    if (value.type.base === TypeNames.Boolean) {
      if (value.raw === true && found++ === occurrence) return i;
    } else if (!isNull(value)) {
      return notBoolean(name);
    }
  }
  return -1;
}

function barsSince(condition: readonly IValue[], context: IContext): IValue {
  const name = StockFunctionNames.barsSince;
  const position = currentPosition(name, condition, context);
  if (typeof position !== "number") return position;
  const found = findTrue(name, condition, position, 0);
  if (typeof found !== "number") return found;
  return found < 0 ? Value.null() : Value.number(position - found);
}

function valueWhen(
  condition: readonly IValue[],
  series: readonly IValue[],
  occurrence: number,
  context: IContext,
): IValue {
  const name = StockFunctionNames.valueWhen;
  const position = currentPosition(name, condition, context);
  if (typeof position !== "number") return position;
  const seriesPosition = currentPosition(name, series, context);
  if (typeof seriesPosition !== "number") return seriesPosition;
  const error = offsetError(name, occurrence, "occurrence");
  if (error !== undefined) return error;
  const found = findTrue(name, condition, position, occurrence);
  if (typeof found !== "number") return found;
  return found < 0 ? Value.null() : series[found]!;
}

// SCORE (strategy function; it does not need a Stock Context)

/** The values of an Object of conditions, or the Error of a value that is not a Boolean. */
function conditionsOf(conditions: IObject): Map<string, boolean> | IValue {
  const result = new Map<string, boolean>();
  for (const key of conditions.keys) {
    const value = conditions.getProperty(key)!.getValue();
    if (value.type.base === TypeNames.Error) return value;
    if (value.type.base !== TypeNames.Boolean) {
      return argumentError(`The condition "${key}" of "${StockFunctionNames.score}" is not a Boolean.`);
    }
    result.set(key, value.raw as boolean);
  }
  return result;
}

const share = (met: number, total: number): IValue => Value.number(total === 0 ? 0 : met / total);

function scoreObject(conditions: IObject, weights: IObject | undefined): IValue {
  const name = StockFunctionNames.score;
  const values = conditionsOf(conditions);
  if (!(values instanceof Map)) return values;
  const weightOf = new Map<string, number>();
  for (const key of weights?.keys ?? []) {
    const weight = weights!.getProperty(key)!.getValue();
    if (weight.type.base === TypeNames.Error) return weight;
    if (weight.type.base !== TypeNames.Number)
      return argumentError(`The weight "${key}" of "${name}" is not a Number.`);
    weightOf.set(key, weight.raw as number);
  }
  for (const key of weightOf.keys()) {
    if (!values.has(key)) return invalidKeyError(`The weight "${key}" of "${name}" is not a key of the conditions.`);
  }
  for (const [key, weight] of weightOf) {
    if (weight < 0) return operationError(`The weight "${key}" of "${name}" is negative.`);
  }
  let met = 0;
  let total = 0;
  for (const [key, value] of values) {
    const weight = weightOf.get(key) ?? 1;
    total += weight;
    if (value) met += weight;
  }
  return share(met, total);
}

function scoreArray(conditions: readonly IValue[], weights: readonly IValue[] | undefined): IValue {
  const name = StockFunctionNames.score;
  if (weights !== undefined && weights.length !== conditions.length) {
    return operationError(`The conditions and the weights of "${name}" have different lengths.`);
  }
  let met = 0;
  let total = 0;
  for (let i = 0; i < conditions.length; i++) {
    const weight = weights === undefined ? 1 : (weights[i]!.raw as number);
    if (weight < 0) return operationError(`A weight of "${name}" is negative.`);
    total += weight;
    if (conditions[i]!.raw === true) met += weight;
  }
  return share(met, total);
}

/** `SCORE(conditions, weights?)`: docs/standards/stock/functions/SCORE.md */
export function createScoreFunction(): FlFunction {
  const objectArg = (name: string): ArgumentTemplate => ArgumentTemplate.of(name, Types.Object);
  const booleans = ArgumentTemplate.arrayOf("conditions", Types.Boolean);
  return seriesFunction(
    StockFunctionNames.score,
    new FunctionOverload([objectArg("conditions")], (a) => scoreObject(a[0]!.raw as IObject, undefined)),
    new FunctionOverload([booleans], (a) => scoreArray(elements(a[0]), undefined)),
    new FunctionOverload([objectArg("conditions"), objectArg("weights")], (a) =>
      scoreObject(a[0]!.raw as IObject, a[1]!.raw as IObject),
    ),
    new FunctionOverload([booleans, ArgumentTemplate.arrayOf("weights", Types.Number)], (a) =>
      scoreArray(elements(a[0]), elements(a[1])),
    ),
  );
}

/** The series functions of `stock-1.2`. */
export function createSeriesFunctions(): FlFunction[] {
  const names = StockFunctionNames;
  return [
    seriesFunction(
      names.ready,
      new FunctionOverload([seriesArg("series"), numberArg("n")], (a, c) => ready(elements(a[0]), numeric(a[1]), c)),
    ),
    crossFunction(names.crossover, true),
    crossFunction(names.crossunder, false),
    extremeFunction(names.highest, true),
    extremeFunction(names.lowest, false),
    monotonicFunction(names.rising, true),
    monotonicFunction(names.falling, false),
    seriesFunction(
      names.barsSince,
      new FunctionOverload([seriesArg("condition")], (a, c) => barsSince(elements(a[0]), c)),
    ),
    seriesFunction(
      names.valueWhen,
      new FunctionOverload([seriesArg("condition"), seriesArg("series")], (a, c) =>
        valueWhen(elements(a[0]), elements(a[1]), 0, c),
      ),
      new FunctionOverload([seriesArg("condition"), seriesArg("series"), numberArg("occurrence")], (a, c) =>
        valueWhen(elements(a[0]), elements(a[1]), numeric(a[2]), c),
      ),
    ),
  ];
}
