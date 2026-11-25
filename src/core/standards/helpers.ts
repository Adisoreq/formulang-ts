/**
 * Building blocks of the function definitions of a standard.
 *
 * @module
 */
import type { IArgumentTemplate, IFunction, ILambda } from "../../abstractions/functions.js";
import type { IError, IObject, IValue } from "../../abstractions/primitives.js";
import { FunctionType } from "../../abstractions/primitives.js";
import type { IContext } from "../../abstractions/structures.js";
import { Errors } from "../errors.js";
import { ArgumentTemplate } from "../functions/argument-template.js";
import { FlFunction, FunctionOverload, type FunctionImplementation } from "../functions/function.js";
import { TypeNames, Types } from "../primitives/types.js";
import { Value } from "../primitives/value.js";
import { numberToString } from "../serialization/serializer.js";
import { arrayIndexing } from "../structures/context-variables.js";

// Definitions

/** A Core function: every one only computes its result (procedures are defined separately). */
export function fn(name: string, ...overloads: FunctionOverload[]): FlFunction {
  return new FlFunction(name, overloads, FunctionType.Function, { sideEffectFree: true });
}

export function overload(implementation: FunctionImplementation, ...template: IArgumentTemplate[]): FunctionOverload {
  return new FunctionOverload(template, implementation);
}

export const numberArg = (name: string): ArgumentTemplate => ArgumentTemplate.of(name, Types.Number);
export const booleanArg = (name: string): ArgumentTemplate => ArgumentTemplate.of(name, Types.Boolean);
export const textArg = (name: string, optional = false): ArgumentTemplate =>
  ArgumentTemplate.of(name, Types.Text, { optional });
export const arrayArg = (name: string): ArgumentTemplate => ArgumentTemplate.of(name, Types.Array);
export const numberArrayArg = (name: string): ArgumentTemplate => ArgumentTemplate.arrayOf(name, Types.Number);
export const objectArg = (name: string): ArgumentTemplate => ArgumentTemplate.of(name, Types.Object);
export const delegateArg = (name: string): ArgumentTemplate => ArgumentTemplate.of(name, Types.Delegate);
export const anyArg = (name: string): ArgumentTemplate => ArgumentTemplate.any(name);

// Argument access: the overload guarantees the type

export const num = (value: IValue | undefined): number => value!.raw as number;
export const bool = (value: IValue | undefined): boolean => value!.raw as boolean;
export const txt = (value: IValue | undefined): string => value!.raw as string;
export const arr = (value: IValue | undefined): readonly IValue[] => value!.raw as readonly IValue[];
export const obj = (value: IValue | undefined): IObject => value!.raw as IObject;
export const del = (value: IValue | undefined): IFunction => value!.raw as IFunction;

export function isWhole(value: number): boolean {
  return Number.isFinite(value) && Math.floor(value) === value;
}

export function isError(value: IValue): boolean {
  return value.type.base === TypeNames.Error;
}

// Results

/** A Number result; `OPERATION_ERROR` if it is not finite. `-0` becomes `0`. */
export function N(value: number): IValue {
  if (!Number.isFinite(value)) return operationError("The result is not a finite number.");
  const normalized = value === 0 ? 0 : value;
  return Value.number(normalized);
}

export const B = (value: boolean): IValue => Value.boolean(value);
export const T = (value: string): IValue => Value.text(value);
export const A = (values: Iterable<IValue>): IValue => Value.array(values);
export const success = (): IValue => Value.success();
export const errorValue = (error: IError): IValue => Value.error(error);
export const operationError = (message: string): IValue => Value.error(Errors.operationError(message));
export const argumentError = (message: string): IValue => Value.error(Errors.argumentError(message));
export const invalidIndexError = (message: string): IValue => Value.error(Errors.invalidIndexError(message));

// Delegates

/** `ARGUMENT_ERROR` if the handler is a lambda with a number of parameters that is not allowed. */
export function checkHandler(handler: IFunction, functionName: string, ...allowed: number[]): IValue | undefined {
  const counts = allowed.length === 0 ? [1] : allowed;
  const parameters = parameterCount(handler);
  if (parameters !== undefined && !counts.includes(parameters)) {
    const text = counts.length === 1 ? `exactly ${counts[0]}` : counts.join(" or ");
    return argumentError(`The lambda passed to "${functionName}" must have ${text} parameter(s).`);
  }
  return undefined;
}

/** The number of parameters of a lambda; `undefined` for a named function. */
export function parameterCount(fn: IFunction): number | undefined {
  return fn.functionType === FunctionType.Lambda ? (fn as ILambda).parameters.length : undefined;
}

export function call(fn: IFunction, context: IContext, ...args: IValue[]): IValue {
  return fn.invoke(args, context);
}

// Indices

export { arrayIndexing };

/** Zero-based index of an element, following `@array_indexing`, or an `INVALID_INDEX_ERROR`. */
export function resolveIndex(index: number, length: number, context: IContext): number | IValue {
  const zeroBased = index - arrayIndexing(context);
  if (!isWhole(zeroBased) || zeroBased < 0 || zeroBased >= length) {
    return invalidIndexError(`Index ${numberToString(index)} is not a valid index of the array.`);
  }
  return zeroBased;
}

// Comparison

/** Equality of `EQU` (docs/standards/core/functions/EQU.md): structural for arrays and objects. */
export function valuesEqual(a: IValue, b: IValue): boolean {
  if (a.type.base !== b.type.base) return false;
  switch (a.type.base) {
    case TypeNames.Null:
      return true;
    case TypeNames.Boolean:
    case TypeNames.Number:
    case TypeNames.Text:
      return a.raw === b.raw;
    case TypeNames.Array: {
      const x = arr(a);
      const y = arr(b);
      return x.length === y.length && x.every((element, i) => valuesEqual(element, y[i]!));
    }
    case TypeNames.Object: {
      const o1 = obj(a);
      const o2 = obj(b);
      const k1 = [...o1.keys].sort();
      const k2 = [...o2.keys].sort();
      return (
        a.type.extended === b.type.extended &&
        k1.length === k2.length &&
        k1.every((key, i) => key === k2[i]) &&
        k1.every((key) => valuesEqual(o1.getProperty(key)!.getValue(), o2.getProperty(key)!.getValue()))
      );
    }
    case TypeNames.Delegate:
      return a.raw === b.raw;
    case TypeNames.Error: {
      const e1 = a.raw as IError;
      const e2 = b.raw as IError;
      return e1.code === e2.code && e1.message === e2.message;
    }
    default:
      return false;
  }
}
