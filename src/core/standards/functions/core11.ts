/**
 * Functions added in `core-1.1`: `CALL`, `FIRST`, `LAST`, `IFNULL`, `IFERR`, `ISINT`, `ISEVEN`, `ISODD`, the
 * statistical functions (`MEDIAN`, `VAR_P`, `VAR_S`, `STDEV_P`, `STDEV_S`) and `MERGE`.
 *
 * @module
 */
import type { IFunction } from "../../../abstractions/functions.js";
import type { IObject, IValue } from "../../../abstractions/primitives.js";
import { FunctionType } from "../../../abstractions/primitives.js";
import type { IContext } from "../../../abstractions/structures.js";
import { ArgumentTemplate } from "../../functions/argument-template.js";
import type { FlFunction } from "../../functions/function.js";
import { FlObject } from "../../primitives/object.js";
import { TypeNames } from "../../primitives/types.js";
import { Value } from "../../primitives/value.js";
import {
  B,
  N,
  anyArg,
  arr,
  arrayArg,
  call,
  checkHandler,
  del,
  delegateArg,
  fn,
  isError,
  isWhole,
  num,
  numberArrayArg,
  obj,
  objectArg,
  operationError,
  overload,
} from "../helpers.js";

/** `CALL(function, arguments...)`: a lambda is invoked, a named function is called like a call written with its name. */
function callDelegate(fn: IFunction, args: readonly IValue[], context: IContext): IValue {
  if (fn.functionType === FunctionType.Procedure) {
    return operationError(`Procedure "${fn.name}" cannot be called through a delegate.`);
  }
  return fn.invoke(args, context);
}

function findElement(
  name: string,
  array: readonly IValue[],
  handler: IFunction,
  fromEnd: boolean,
  context: IContext,
): IValue {
  const invalid = checkHandler(handler, name);
  if (invalid !== undefined) return invalid;
  for (let k = 0; k < array.length; k++) {
    const element = array[fromEnd ? array.length - 1 - k : k]!;
    const result = call(handler, context, element);
    if (isError(result)) return result;
    if (result.type.base !== TypeNames.Boolean) {
      return operationError(`The handler passed to "${name}" must return a Boolean.`);
    }
    if (result.raw === true) return element;
  }
  return Value.null();
}

function median(numbers: number[]): IValue {
  if (numbers.length === 0) return operationError("The array is empty.");
  numbers.sort((a, b) => a - b);
  const middle = Math.floor(numbers.length / 2);
  return N(numbers.length % 2 === 1 ? numbers[middle]! : (numbers[middle - 1]! + numbers[middle]!) / 2);
}

function variance(values: readonly IValue[], sample: boolean, root: boolean): IValue {
  const count = values.length;
  if (sample && count < 2) return operationError("The sample variance needs at least 2 numbers.");
  if (count === 0) return operationError("The array is empty.");
  const numbers = values.map(num);
  const mean = numbers.reduce((sum, x) => sum + x, 0) / count;
  const squares = numbers.reduce((sum, x) => sum + (x - mean) * (x - mean), 0);
  const result = squares / (sample ? count - 1 : count);
  return N(root ? Math.sqrt(result) : result);
}

/** Shallow merge: the keys of the first object in their order (values of the second win), then new keys of the second. */
function merge(first: IObject, second: IObject): IValue {
  const merged = new FlObject();
  for (const key of first.keys)
    merged.initVariable(key, (second.hasKey(key) ? second : first).getProperty(key)!.getValue());
  for (const key of second.keys) merged.initVariable(key, second.getProperty(key)!.getValue());
  return Value.object(merged);
}

const isWholeNumber = (value: IValue): value is IValue & { raw: number } =>
  typeof value.raw === "number" && value.type.base === TypeNames.Number && isWhole(value.raw);

export const core11Functions = (): FlFunction[] => [
  // Control flow
  fn(
    "CALL",
    overload(
      (a, c) => callDelegate(del(a[0]), a.slice(1), c),
      delegateArg("function"),
      ArgumentTemplate.any("arguments", { optional: true, multiple: true }),
    ),
  ),
  fn(
    "IFNULL",
    overload((a) => (a[0]!.type.base === TypeNames.Null ? a[1]! : a[0]!), anyArg("value"), anyArg("fallback")),
  ),
  fn(
    "IFERR",
    overload((a) => (isError(a[0]!) ? a[1]! : a[0]!), anyArg("value"), anyArg("fallback")),
  ),

  // Arrays
  fn(
    "FIRST",
    overload((a) => arr(a[0])[0] ?? Value.null(), arrayArg("array")),
    overload((a, c) => findElement("FIRST", arr(a[0]), del(a[1]), false, c), arrayArg("array"), delegateArg("handler")),
  ),
  fn(
    "LAST",
    overload((a) => arr(a[0]).at(-1) ?? Value.null(), arrayArg("array")),
    overload((a, c) => findElement("LAST", arr(a[0]), del(a[1]), true, c), arrayArg("array"), delegateArg("handler")),
  ),

  // Types
  fn(
    "ISINT",
    overload((a) => B(isWholeNumber(a[0]!)), anyArg("value")),
  ),
  fn(
    "ISEVEN",
    overload((a) => B(isWholeNumber(a[0]!) && a[0]!.raw % 2 === 0), anyArg("value")),
  ),
  fn(
    "ISODD",
    overload((a) => B(isWholeNumber(a[0]!) && Math.abs(a[0]!.raw % 2) === 1), anyArg("value")),
  ),

  // Statistics
  fn(
    "MEDIAN",
    overload((a) => median(arr(a[0]).map(num)), numberArrayArg("numbers")),
  ),
  fn(
    "VAR_P",
    overload((a) => variance(arr(a[0]), false, false), numberArrayArg("numbers")),
  ),
  fn(
    "VAR_S",
    overload((a) => variance(arr(a[0]), true, false), numberArrayArg("numbers")),
  ),
  fn(
    "STDEV_P",
    overload((a) => variance(arr(a[0]), false, true), numberArrayArg("numbers")),
  ),
  fn(
    "STDEV_S",
    overload((a) => variance(arr(a[0]), true, true), numberArrayArg("numbers")),
  ),

  // Objects
  fn(
    "MERGE",
    overload((a) => merge(obj(a[0]), obj(a[1])), objectArg("object1"), objectArg("object2")),
  ),
];
