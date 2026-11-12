/**
 * Contracts of the FormuLang primitives: values, containers and types.
 *
 * @see https://github.com/Adisoreq/FormuLang/blob/main/docs/core/primitives.md
 * @module
 */

/** Kind of a primitive (docs/core/primitives.md). */
export const PrimitiveType = {
  /** Literal value, such as a number or a text. */
  Value: "Value",
  /** Container of a value: a variable or a constant. */
  Container: "Container",
  /** Structural relation transforming an input set into a determined output. */
  Function: "Function",
} as const;
export type PrimitiveType = (typeof PrimitiveType)[keyof typeof PrimitiveType];

/** Kind of a container (docs/core/containers.md). */
export const ContainerType = {
  /** Mutable value container. */
  Variable: "Variable",
  /** Immutable value container. */
  Constant: "Constant",
} as const;
export type ContainerType = (typeof ContainerType)[keyof typeof ContainerType];

/** Kind of a function (docs/core/functions.md). */
export const FunctionType = {
  /** A standard function that takes arguments and returns a value. */
  Function: "Function",
  /** Function that operates on the context and returns an Error (`SUCCESS` when it succeeds). */
  Procedure: "Procedure",
  /** Temporary anonymous function created by a lambda expression. */
  Lambda: "Lambda",
} as const;
export type FunctionType = (typeof FunctionType)[keyof typeof FunctionType];

/**
 * Type of a primitive: a base type (`Number`, `Object`, ...) and an optional extended type (`Stock.Candle`).
 * An extended type always derives from `Object` (docs/core/types.md).
 */
export interface IType {
  readonly base: string;
  readonly extended: string | undefined;
  isNull(): boolean;
  isUndefined(): boolean;
  /** Null, Undefined, Boolean, Number or Text (passed by value). */
  isSimple(): boolean;
  /** Error, Array, Object or Delegate (passed by reference). */
  isComplex(): boolean;
  hasExtension(): boolean;
  /** `Number`, `Object<Stock.Candle>` */
  toString(): string;
}

/** Error value: a code, a name and details. Code `0` (`SUCCESS`) is the only Error that does not abort an execution. */
export interface IError {
  readonly code: number;
  readonly name: string;
  readonly message: string;
  isSuccess(): boolean;
  isFailed(): boolean;
  /** `[NAME (code)] message` */
  toString(): string;
}

/** Root of everything that holds or produces a value. */
export interface IPrimitive {
  readonly primitiveType: PrimitiveType;
  readonly type: IType;
  /** Canonical expression of the primitive, e.g. `"text"` or `$x`. */
  readonly expression: string;
  readonly canAccessValue: boolean;
  /** The value, or an Error value when it cannot be read (e.g. `UNDEFINED_ERROR`). */
  getValue(): IValue;
  /** `SUCCESS` if the value can be changed, otherwise the Error that a change would return. */
  readonly canUpdateValue: IError;
  setValue(value: IValue): IError;
}

/**
 * A value. `raw` holds the JavaScript representation of the value:
 *
 * | Base type | `raw` |
 * | :-- | :-- |
 * | Null, Undefined | `null` |
 * | Boolean | `boolean` |
 * | Number | `number` |
 * | Text | `string` |
 * | Error | {@link IError} |
 * | Array | `readonly IValue[]` |
 * | Object | {@link IObject} |
 * | Delegate | `IFunction` |
 */
export interface IValue extends IPrimitive {
  readonly raw: unknown;
}

/** Named container of a value: a variable or a constant. */
export interface IContainer extends IPrimitive {
  readonly name: string;
  readonly containerType: ContainerType;
  readonly mutable: boolean;
}

/** Ordered set of named containers. Objects, contexts and environments are objects. */
export interface IObject {
  /** Keys in the order in which they were defined (docs/standards/core/functions/KEYS.md). */
  readonly keys: readonly string[];
  isEmpty(): boolean;
  hasKey(key: string): boolean;
  /** The container stored under the key, or `undefined` if there is none. */
  getProperty(key: string): IContainer | undefined;
  /** Changes the value of an existing container; `INVALID_KEY_ERROR` if the key does not exist. */
  setProperty(key: string, value: IValue): IError;
  /** Adds a constant; `false` if the key already exists. */
  initConstant(key: string, value: IValue): boolean;
  /** Adds a variable; `false` if the key already exists. */
  initVariable(key: string, value: IValue): boolean;
}
