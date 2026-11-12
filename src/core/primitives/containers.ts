import type { IContainer, IError, IType, IValue } from "../../abstractions/primitives.js";
import { ContainerType, PrimitiveType } from "../../abstractions/primitives.js";
import { Errors } from "../errors.js";
import { Value } from "./value.js";

/** Named container of a value (docs/core/containers.md). */
export abstract class Container implements IContainer {
  readonly primitiveType = PrimitiveType.Container;
  #value: IValue;

  protected constructor(
    readonly name: string,
    value: IValue,
    readonly containerType: ContainerType,
    readonly mutable: boolean,
  ) {
    this.#value = value;
  }

  get type(): IType {
    return this.#value.type;
  }

  get expression(): string {
    return this.#value.expression;
  }

  /** `false` while the container has no value (Undefined). */
  get canAccessValue(): boolean {
    return !this.#value.type.isUndefined();
  }

  /** The stored value, or `UNDEFINED_ERROR` if the container has no value. */
  getValue(): IValue {
    if (this.#value.type.isUndefined()) {
      return Value.error(Errors.undefinedError(`Variable "${this.name}" has no value.`), this.name);
    }
    return this.#value;
  }

  abstract get canUpdateValue(): IError;
  abstract setValue(value: IValue): IError;

  protected store(value: IValue): void {
    this.#value = value;
  }

  protected get storedValue(): IValue {
    return this.#value;
  }

  toString(): string {
    return this.#value.toString();
  }
}

/** Mutable container. Once it has a value, the base type of the value cannot change. */
export class Variable extends Container {
  constructor(name: string, value: IValue = Value.undefined(name)) {
    super(name, value, ContainerType.Variable, true);
  }

  get canUpdateValue(): IError {
    return Errors.success();
  }

  /** Stores the value; `TYPE_ERROR` if the variable has a value of another base type (docs/standards/core/procedures/SET.md). */
  setValue(value: IValue): IError {
    const stored = this.storedValue;
    if (!stored.type.isUndefined() && stored.type.base !== value.type.base) {
      return Errors.typeError(
        `Trying to override ${stored.type.base.toUpperCase()} value with ${value.type.base.toUpperCase()}.`,
      );
    }
    this.store(value);
    return Errors.success();
  }
}

/** Immutable container. A formula can never change a constant; the host replaces it with `FlObject.setConstant`. */
export class Constant extends Container {
  constructor(name: string, value: IValue) {
    super(name, value, ContainerType.Constant, false);
  }

  get canUpdateValue(): IError {
    return Errors.environmentError(`'${this.name}' is a constant and cannot be changed.`);
  }

  setValue(_value: IValue): IError {
    return this.canUpdateValue;
  }
}

/** Constant whose value is computed every time it is read, e.g. `I` of the Iteration Context. */
export class ComputedConstant extends Constant {
  readonly #compute: () => IValue;
  readonly #type: IType;

  constructor(name: string, type: IType, compute: () => IValue) {
    super(name, new Value(null, type, name));
    this.#type = type;
    this.#compute = compute;
  }

  override get type(): IType {
    return this.#type;
  }

  override get canAccessValue(): boolean {
    return true;
  }

  override getValue(): IValue {
    return this.#compute();
  }

  override toString(): string {
    return this.getValue().toString();
  }
}
