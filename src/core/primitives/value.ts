import type { IFunction } from "../../abstractions/functions.js";
import type { IError, IObject, IType, IValue } from "../../abstractions/primitives.js";
import { PrimitiveType } from "../../abstractions/primitives.js";
import { Errors } from "../errors.js";
import { numberToString, serialize, textToLiteral } from "../serialization/serializer.js";
import { TypeNames, Types } from "./types.js";

/**
 * Immutable value. Create values with the static factories (`Value.number(5)`, `Value.text("a")`, ...).
 * A value is changed only through the container that stores it.
 */
export class Value implements IValue {
  readonly primitiveType = PrimitiveType.Value;
  // Expression of a Number made by Value.number without one is formatted when it is first read: most numbers
  // computed by a formula are never shown, and formatting every one of them was a large part of the execution time
  #expression: string | undefined;

  constructor(
    readonly raw: unknown,
    readonly type: IType,
    expression: string = "",
  ) {
    this.#expression = expression;
    Object.freeze(this);
  }

  get expression(): string {
    return (this.#expression ??= numberToString(this.raw as number));
  }

  get canAccessValue(): boolean {
    return true;
  }

  get canUpdateValue(): IError {
    return Errors.operationError("A value cannot be changed; store it in a variable instead.");
  }

  getValue(): IValue {
    return this;
  }

  setValue(_value: IValue): IError {
    return this.canUpdateValue;
  }

  /** Whether the base type of the value is `base`. */
  is(base: string): boolean {
    return this.type.base === base;
  }

  asBoolean(): boolean | undefined {
    return typeof this.raw === "boolean" ? this.raw : undefined;
  }

  asNumber(): number | undefined {
    return typeof this.raw === "number" ? this.raw : undefined;
  }

  asText(): string | undefined {
    return typeof this.raw === "string" ? this.raw : undefined;
  }

  asError(): IError | undefined {
    return this.type.base === TypeNames.Error ? (this.raw as IError) : undefined;
  }

  asArray(): readonly IValue[] | undefined {
    return this.type.base === TypeNames.Array ? (this.raw as readonly IValue[]) : undefined;
  }

  asObject(): IObject | undefined {
    return this.type.base === TypeNames.Object ? (this.raw as IObject) : undefined;
  }

  asDelegate(): IFunction | undefined {
    return this.type.base === TypeNames.Delegate ? (this.raw as IFunction) : undefined;
  }

  /** Serialization with the default options (docs/standards/core/semantics/serialization.md). */
  toString(): string {
    return serialize(this);
  }

  // Factories

  static null(expression = "null"): Value {
    return new Value(null, Types.Null, expression);
  }

  /** State of a declared variable without a value. It is never the value of an expression. */
  static undefined(expression = ""): Value {
    return new Value(null, Types.Undefined, expression);
  }

  static boolean(value: boolean, expression: string = value ? "true" : "false"): Value {
    return new Value(value, Types.Boolean, expression);
  }

  static number(value: number, expression?: string): Value {
    const result = new Value(value, Types.Number, expression);
    if (expression === undefined) result.#expression = undefined;
    return result;
  }

  static text(value: string, expression: string = textToLiteral(value)): Value {
    return new Value(value, Types.Text, expression);
  }

  static error(error: IError, expression = ""): Value {
    return new Value(error, Types.Error, expression);
  }

  /** The `SUCCESS` Error, returned by procedures. */
  static success(expression = ""): Value {
    return Value.error(Errors.success(), expression);
  }

  static array(values: Iterable<IValue>, expression = ""): Value {
    return new Value(Object.freeze([...values]), Types.Array, expression);
  }

  /** An Object, optionally of an extended type (e.g. `Stock.Candle`). */
  static object(value: IObject, extendedType?: string, expression = ""): Value {
    const type = extendedType === undefined ? Types.Object : Types.of(TypeNames.Object, extendedType);
    return new Value(value, type, expression);
  }

  static delegate(fn: IFunction, expression: string = fn.name): Value {
    return new Value(fn, Types.Delegate, expression);
  }
}

/** Whether the value is an Error (also `SUCCESS`). */
export function isError(value: IValue): boolean {
  return value.type.base === TypeNames.Error;
}

/** Whether the value is an Error other than `SUCCESS`. */
export function isFailure(value: IValue): boolean {
  return value.type.base === TypeNames.Error && (value.raw as IError).isFailed();
}
