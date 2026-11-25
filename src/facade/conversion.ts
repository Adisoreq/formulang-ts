/**
 * Conversion between FormuLang values and plain JavaScript values.
 *
 * @module
 */
import type { IFunction } from "../abstractions/functions.js";
import type { IError, IObject, IValue } from "../abstractions/primitives.js";
import { FunctionType, PrimitiveType } from "../abstractions/primitives.js";
import type { IContext } from "../abstractions/structures.js";
import { Errors } from "../core/errors.js";
import { ArgumentTemplate } from "../core/functions/argument-template.js";
import { FlFunction, FunctionOverload, type FunctionOptions } from "../core/functions/function.js";
import { FlError } from "../core/primitives/error.js";
import { FlObject } from "../core/primitives/object.js";
import { TypeNames } from "../core/primitives/types.js";
import { Value } from "../core/primitives/value.js";

/** A FormuLang Error as a plain JavaScript object. */
export class FormulaError implements IError {
  readonly code: number;
  readonly name: string;
  readonly message: string;

  constructor(error: IError) {
    this.code = error.code;
    this.name = error.name;
    this.message = error.message;
    Object.freeze(this);
  }

  isSuccess(): boolean {
    return this.code === 0;
  }

  isFailed(): boolean {
    return this.code !== 0;
  }

  /** `[NAME (code)] message` */
  toString(): string {
    return `[${this.name} (${this.code})] ${this.message}`;
  }
}

/** JavaScript representation of a FormuLang value. */
export type JsValue =
  | null
  | undefined
  | boolean
  | number
  | string
  | FormulaError
  | readonly JsValue[]
  | { readonly [key: string]: JsValue }
  | ((...args: unknown[]) => unknown);

/** Function of the host application callable from formulas. It receives and returns plain JavaScript values. */
export type HostFunction = (...args: JsValue[]) => unknown;

function isValue(value: unknown): value is IValue {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Partial<IValue>).primitiveType === PrimitiveType.Value &&
    "raw" in value &&
    "type" in value
  );
}

function isError(value: unknown): value is IError {
  return (
    value instanceof FlError ||
    value instanceof FormulaError ||
    (typeof value === "object" &&
      value !== null &&
      typeof (value as IError).code === "number" &&
      typeof (value as IError).isFailed === "function")
  );
}

/**
 * Wraps a JavaScript function as a named FormuLang function. It accepts any arguments; when one of them is an
 * Error, the function is not called and the Error is returned (like the overloads of the Core functions).
 * A thrown exception becomes an `OPERATION_ERROR`. Mark it with `{ sideEffectFree: true }` if it only computes its
 * result (see {@link FunctionOptions.sideEffectFree}).
 */
export function hostFunction(name: string, implementation: HostFunction, options: FunctionOptions = {}): FlFunction {
  return new FlFunction(
    name,
    [
      new FunctionOverload([ArgumentTemplate.any("arguments", { optional: true, multiple: true })], (args, context) => {
        const error = args.find((arg) => arg.type.base === TypeNames.Error);
        if (error !== undefined) return error;
        try {
          return fromJs(implementation(...args.map((arg) => toJs(arg, context))));
        } catch (exception) {
          const message = exception instanceof Error ? exception.message : String(exception);
          return Value.error(Errors.operationError(`"${name}" failed: ${message}`));
        }
      }),
    ],
    FunctionType.Function,
    options,
  );
}

/**
 * Converts a JavaScript value into a FormuLang value.
 *
 * | JavaScript | FormuLang |
 * | :-- | :-- |
 * | `null`, `undefined` | Null |
 * | `boolean` | Boolean |
 * | `number`, `bigint` | Number |
 * | `string` | Text |
 * | `Date` | Number (Unix time in milliseconds) |
 * | array | Array |
 * | `FormulaError`, `IError` | Error |
 * | function | Delegate (see {@link hostFunction}) |
 * | other object | Object (its own enumerable properties) |
 * | `IValue` | the value itself |
 *
 * @throws {TypeError} for a symbol.
 */
export function fromJs(value: unknown): IValue {
  if (isValue(value)) return value;
  switch (typeof value) {
    case "undefined":
      return Value.null();
    case "boolean":
      return Value.boolean(value);
    case "number":
      return Value.number(value);
    case "bigint":
      return Value.number(Number(value));
    case "string":
      return Value.text(value);
    case "function":
      return Value.delegate(hostFunction(value.name || "HOST_FUNCTION", value as HostFunction));
    case "symbol":
      throw new TypeError("A symbol cannot be converted into a FormuLang value.");
  }
  if (value === null) return Value.null();
  if (value instanceof Date) return Value.number(value.getTime());
  if (Array.isArray(value)) return Value.array(value.map(fromJs));
  if (isError(value)) return Value.error(value);
  const object = new FlObject();
  for (const [key, property] of Object.entries(value as object)) object.initVariable(key, fromJs(property));
  return Value.object(object);
}

/**
 * Converts a FormuLang value into a JavaScript value. An Object becomes a plain object, an Error a
 * {@link FormulaError}, Undefined `undefined`, and a Delegate a JavaScript function that invokes it in `context`
 * (a Delegate without a context cannot be called and is returned as `undefined`).
 */
export function toJs(value: IValue, context?: IContext): JsValue {
  switch (value.type.base) {
    case TypeNames.Null:
      return null;
    case TypeNames.Undefined:
      return undefined;
    case TypeNames.Boolean:
    case TypeNames.Number:
    case TypeNames.Text:
      return value.raw as boolean | number | string;
    case TypeNames.Error:
      return new FormulaError(value.raw as IError);
    case TypeNames.Array:
      return (value.raw as readonly IValue[]).map((element) => toJs(element, context));
    case TypeNames.Object: {
      const object = value.raw as IObject;
      const result: Record<string, JsValue> = {};
      for (const key of object.keys) {
        const property = object.getProperty(key);
        if (property !== undefined) result[key] = toJs(property.getValue(), context);
      }
      return result;
    }
    case TypeNames.Delegate: {
      if (context === undefined) return undefined;
      const fn = value.raw as IFunction;
      return (...args: unknown[]) => toJs(fn.invoke(args.map(fromJs), context), context);
    }
    default:
      return undefined;
  }
}
