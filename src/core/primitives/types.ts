import type { IType } from "../../abstractions/primitives.js";

/** Names of the base types (docs/standards/core/types/README.md). */
export const TypeNames = {
  Null: "Null",
  Undefined: "Undefined",
  Boolean: "Boolean",
  Number: "Number",
  Text: "Text",
  Error: "Error",
  Array: "Array",
  Object: "Object",
  Delegate: "Delegate",
  /**
   * Pseudo-type of a variable reference: the first argument of `SET`, `INIT` and `COND_SET`.
   * It is not a type of the language and never becomes the value of an expression.
   */
  Variable: "Variable",
} as const;
export type TypeName = (typeof TypeNames)[keyof typeof TypeNames];

const SIMPLE: ReadonlySet<string> = new Set([
  TypeNames.Null,
  TypeNames.Undefined,
  TypeNames.Boolean,
  TypeNames.Number,
  TypeNames.Text,
]);
const COMPLEX: ReadonlySet<string> = new Set([TypeNames.Error, TypeNames.Array, TypeNames.Object, TypeNames.Delegate]);

/** Immutable {@link IType}. Create types with {@link Types}. */
class FlType implements IType {
  constructor(
    readonly base: string,
    readonly extended: string | undefined,
  ) {
    Object.freeze(this);
  }

  isNull(): boolean {
    return this.base === TypeNames.Null;
  }

  isUndefined(): boolean {
    return this.base === TypeNames.Undefined;
  }

  isSimple(): boolean {
    return SIMPLE.has(this.base);
  }

  isComplex(): boolean {
    return COMPLEX.has(this.base);
  }

  hasExtension(): boolean {
    return this.extended !== undefined;
  }

  toString(): string {
    return this.extended !== undefined ? `${this.base}<${this.extended}>` : this.base;
  }
}

/** Factory of types. */
export const Types = {
  Null: new FlType(TypeNames.Null, undefined) as IType,
  Undefined: new FlType(TypeNames.Undefined, undefined) as IType,
  Boolean: new FlType(TypeNames.Boolean, undefined) as IType,
  Number: new FlType(TypeNames.Number, undefined) as IType,
  Text: new FlType(TypeNames.Text, undefined) as IType,
  Error: new FlType(TypeNames.Error, undefined) as IType,
  Array: new FlType(TypeNames.Array, undefined) as IType,
  Object: new FlType(TypeNames.Object, undefined) as IType,
  Delegate: new FlType(TypeNames.Delegate, undefined) as IType,
  Variable: new FlType(TypeNames.Variable, undefined) as IType,

  /** A type with an optional extended type, e.g. `Types.of("Object", "Stock.Candle")`. */
  of(base: string, extended?: string): IType {
    return new FlType(base, extended);
  },

  /** The same base type and the same extended type. */
  areEqual(a: IType, b: IType): boolean {
    return a.base === b.base && a.extended === b.extended;
  },
} as const;
