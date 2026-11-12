/**
 * Array and collection functions (docs/standards/core/functions/README.md, "5. Arrays and collections").
 * Indices follow `@array_indexing`.
 *
 * @module
 */
import type { IFunction } from "../../../abstractions/functions.js";
import type { IValue } from "../../../abstractions/primitives.js";
import type { IContext } from "../../../abstractions/structures.js";
import { Errors } from "../../errors.js";
import { ArgumentTemplate } from "../../functions/argument-template.js";
import type { FlFunction } from "../../functions/function.js";
import { TypeNames, Types } from "../../primitives/types.js";
import { Value } from "../../primitives/value.js";
import {
  A,
  B,
  N,
  arr,
  arrayArg,
  arrayIndexing,
  call,
  checkHandler,
  compareOrdinal,
  del,
  delegateArg,
  anyArg,
  fn,
  invalidIndexError,
  isError,
  isWhole,
  num,
  numberArg,
  numberArrayArg,
  obj,
  objectArg,
  operationError,
  overload,
  parameterCount,
  resolveIndex,
  textArg,
  txt,
} from "../helpers.js";

/** Largest length of an array (`Array.MaxLength` of .NET). */
const MAX_ARRAY_LENGTH = 2147483591;

function get(array: readonly IValue[], index: number, context: IContext): IValue {
  const resolved = resolveIndex(index, array.length, context);
  return typeof resolved === "number" ? array[resolved]! : resolved;
}

function getKey(object: ReturnType<typeof obj>, key: string): IValue {
  const property = object.getProperty(key);
  return property === undefined
    ? Value.error(Errors.invalidKeyError(`Key "${key}" does not exist.`))
    : property.getValue();
}

function range(array: readonly IValue[], first: number, last: number, context: IContext): IValue {
  const from = resolveIndex(first, array.length, context);
  if (typeof from !== "number") return from;
  const to = resolveIndex(last, array.length, context);
  if (typeof to !== "number") return to;
  if (from > to) return invalidIndexError('"first_index" is greater than "last_index".');
  return A(array.slice(from, to + 1));
}

function seq(n: number, step: number, start: number): IValue {
  if (!isWhole(n) || n < 0) return operationError('"n" is not a whole number or is negative.');
  if (n > MAX_ARRAY_LENGTH) return operationError('"n" is too large.');
  const results: IValue[] = [];
  for (let k = 0; k < n; k++) {
    const element = N(start + k * step);
    if (isError(element)) return element;
    results.push(element);
  }
  return A(results);
}

/** Calls the handler for every element; stops at the first Error result. */
function collect(array: readonly IValue[], handler: (element: IValue, index: number) => IValue): IValue[] | IValue {
  const results: IValue[] = [];
  for (let i = 0; i < array.length; i++) {
    const result = handler(array[i]!, i);
    if (isError(result)) return result;
    results.push(result);
  }
  return results;
}

function seqGenerator(n: number, generator: IFunction, context: IContext): IValue {
  const error = checkHandler(generator, "SEQ");
  if (error !== undefined) return error;
  const indices = seq(n, 1, arrayIndexing(context));
  if (isError(indices)) return indices;
  const results = collect(arr(indices), (index) => call(generator, context, index));
  return Array.isArray(results) ? A(results) : (results as IValue);
}

function map(array: readonly IValue[], lambda: IFunction, context: IContext): IValue {
  const error = checkHandler(lambda, "MAP", 1, 2);
  if (error !== undefined) return error;
  const withIndex = parameterCount(lambda) === 2;
  const indexing = arrayIndexing(context);
  const results = collect(array, (element, i) =>
    withIndex ? call(lambda, context, element, N(i + indexing)) : call(lambda, context, element),
  );
  return Array.isArray(results) ? A(results) : (results as IValue);
}

function filter(array: readonly IValue[], lambda: IFunction, context: IContext): IValue {
  const error = checkHandler(lambda, "FILTER");
  if (error !== undefined) return error;
  const results: IValue[] = [];
  for (const element of array) {
    const result = call(lambda, context, element);
    if (isError(result)) return result;
    if (result.type.base !== TypeNames.Boolean)
      return operationError('The lambda passed to "FILTER" must return a Boolean.');
    if (result.raw === true) results.push(element);
  }
  return A(results);
}

function reduce(array: readonly IValue[], lambda: IFunction, initial: IValue, context: IContext): IValue {
  const error = checkHandler(lambda, "REDUCE", 2, 3);
  if (error !== undefined) return error;
  const withIndex = parameterCount(lambda) === 3;
  const indexing = arrayIndexing(context);
  let accumulated = initial;
  for (let i = 0; i < array.length; i++) {
    accumulated = withIndex
      ? call(lambda, context, accumulated, array[i]!, N(i + indexing))
      : call(lambda, context, accumulated, array[i]!);
    if (isError(accumulated)) return accumulated;
  }
  return accumulated;
}

/** `ANY` (stops at the first `true`) and `ALL` (stops at the first `false`). */
function quantify(
  name: string,
  array: readonly IValue[],
  lambda: IFunction,
  stopAt: boolean,
  context: IContext,
): IValue {
  const error = checkHandler(lambda, name);
  if (error !== undefined) return error;
  for (const element of array) {
    const result = call(lambda, context, element);
    if (isError(result)) return result;
    if (result.type.base !== TypeNames.Boolean)
      return operationError(`The lambda passed to "${name}" must return a Boolean.`);
    if (result.raw === stopAt) return B(stopAt);
  }
  return B(!stopAt);
}

function sortBy(elements: readonly IValue[], handler: IFunction, context: IContext): IValue {
  const error = checkHandler(handler, "SORT");
  if (error !== undefined) return error;
  const keys: IValue[] = [];
  for (let i = 0; i < elements.length; i++) {
    const key = call(handler, context, elements[i]!);
    if (isError(key)) return key;
    if (key.type.base !== TypeNames.Number && key.type.base !== TypeNames.Text) {
      return operationError('The handler passed to "SORT" must return a Number or a Text.');
    }
    if (i > 0 && key.type.base !== keys[0]!.type.base) {
      return operationError('The handler passed to "SORT" must return values of the same type.');
    }
    keys.push(key);
  }
  const order = elements.map((_, i) => i);
  if (keys.length > 0 && keys[0]!.type.base === TypeNames.Text) {
    order.sort((i, j) => compareOrdinal(txt(keys[i]), txt(keys[j])));
  } else {
    order.sort((i, j) => num(keys[i]) - num(keys[j]));
  }
  return A(order.map((i) => elements[i]!));
}

/** `MAX` and `MIN`: of two numbers, of numbers, of an `Array<Number>`, or of an array by a handler. */
function extreme(name: string, better: (x: number, y: number) => boolean): FlFunction {
  const pick = (numbers: readonly number[]): number => numbers.reduce((x, y) => (better(x, y) ? x : y));
  return fn(
    name,
    overload((a) => N(pick([num(a[0]), num(a[1])])), numberArg("a"), numberArg("b")),
    overload((a) => N(pick(a.map(num))), ArgumentTemplate.of("numbers", Types.Number, { multiple: true })),
    overload(
      (a) => (arr(a[0]).length === 0 ? operationError("The array is empty.") : N(pick(arr(a[0]).map(num)))),
      numberArrayArg("numbers"),
    ),
    overload(
      (a, c) => {
        const elements = arr(a[0]);
        const handler = del(a[1]);
        const error = checkHandler(handler, name);
        if (error !== undefined) return error;
        if (elements.length === 0) return operationError("The array is empty.");
        const numbers: number[] = [];
        for (const element of elements) {
          const result = call(handler, c, element);
          if (isError(result)) return result;
          if (typeof result.raw !== "number")
            return operationError(`The handler passed to "${name}" must return a Number.`);
          numbers.push(result.raw);
        }
        return N(pick(numbers));
      },
      arrayArg("elements"),
      delegateArg("handler"),
    ),
  );
}

function sum(values: readonly IValue[]): number {
  let total = 0;
  for (const value of values) total += num(value);
  return total;
}

export const collectionFunctions = (): FlFunction[] => [
  fn(
    "ARRAY",
    overload((a) => A(a), ArgumentTemplate.any("elements", { optional: true, multiple: true })),
  ),
  fn(
    "GET",
    overload((a, c) => get(arr(a[0]), num(a[1]), c), arrayArg("array"), numberArg("index")),
    overload((a) => getKey(obj(a[0]), txt(a[1])), objectArg("object"), textArg("key")),
  ),
  fn(
    "SUM",
    overload((a) => N(sum(arr(a[0]))), numberArrayArg("array")),
  ),
  fn(
    "PROD",
    overload((a) => N(arr(a[0]).reduce((p, e) => p * num(e), 1)), numberArrayArg("array")),
  ),
  fn(
    "AVG",
    overload(
      (a) => (arr(a[0]).length === 0 ? operationError("The array is empty.") : N(sum(arr(a[0])) / arr(a[0]).length)),
      numberArrayArg("array"),
    ),
  ),
  fn(
    "LEN",
    overload((a) => N(arr(a[0]).length), arrayArg("array")),
    overload((a) => N(txt(a[0]).length), textArg("text")),
  ),
  extreme("MAX", (x, y) => x >= y),
  extreme("MIN", (x, y) => x <= y),
  fn(
    "RANGE",
    overload(
      (a, c) => range(arr(a[0]), num(a[1]), num(a[2]), c),
      arrayArg("array"),
      numberArg("first_index"),
      numberArg("last_index"),
    ),
  ),
  fn(
    "SEQ",
    overload((a, c) => seq(num(a[0]), 1, arrayIndexing(c)), numberArg("n")),
    overload((a, c) => seq(num(a[0]), num(a[1]), arrayIndexing(c)), numberArg("n"), numberArg("step")),
    overload((a) => seq(num(a[0]), num(a[1]), num(a[2])), numberArg("n"), numberArg("step"), numberArg("start")),
    overload((a, c) => seqGenerator(num(a[0]), del(a[1]), c), numberArg("n"), delegateArg("generator")),
  ),
  fn(
    "MAP",
    overload((a, c) => map(arr(a[0]), del(a[1]), c), arrayArg("array"), delegateArg("lambda")),
  ),
  fn(
    "FILTER",
    overload((a, c) => filter(arr(a[0]), del(a[1]), c), arrayArg("array"), delegateArg("lambda")),
  ),
  fn(
    "REDUCE",
    overload(
      (a, c) => reduce(arr(a[0]), del(a[1]), a[2]!, c),
      arrayArg("array"),
      delegateArg("lambda"),
      anyArg("initial"),
    ),
  ),
  fn(
    "ANY",
    overload((a, c) => quantify("ANY", arr(a[0]), del(a[1]), true, c), arrayArg("array"), delegateArg("lambda")),
  ),
  fn(
    "ALL",
    overload((a, c) => quantify("ALL", arr(a[0]), del(a[1]), false, c), arrayArg("array"), delegateArg("lambda")),
  ),
  fn(
    "HAS",
    overload((a) => B(obj(a[0]).hasKey(txt(a[1]))), objectArg("object"), textArg("key")),
    overload(
      (a, c) => B(typeof resolveIndex(num(a[1]), arr(a[0]).length, c) === "number"),
      arrayArg("array"),
      numberArg("index"),
    ),
  ),
  fn(
    "SORT",
    overload((a) => A([...arr(a[0])].sort((x, y) => num(x) - num(y))), numberArrayArg("numbers")),
    overload(
      (a) => A([...arr(a[0])].sort((x, y) => compareOrdinal(txt(x), txt(y)))),
      ArgumentTemplate.arrayOf("texts", Types.Text),
    ),
    overload((a, c) => sortBy(arr(a[0]), del(a[1]), c), arrayArg("elements"), delegateArg("handler")),
  ),
];
