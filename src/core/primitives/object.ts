import type { IContainer, IError, IObject, IValue } from "../../abstractions/primitives.js";
import { Errors } from "../errors.js";
import { objectToString } from "../serialization/serializer.js";
import { Constant, type Container, Variable } from "./containers.js";

/**
 * Ordered set of named containers: the raw value of an Object, and the base of contexts and environments.
 * Keys keep the order in which they were defined (docs/standards/core/functions/KEYS.md).
 */
export class FlObject implements IObject {
  readonly #properties = new Map<string, Container>();

  get keys(): readonly string[] {
    return [...this.#properties.keys()];
  }

  isEmpty(): boolean {
    return this.#properties.size === 0;
  }

  hasKey(key: string): boolean {
    return this.#properties.has(key);
  }

  getProperty(key: string): IContainer | undefined {
    return this.#properties.get(key);
  }

  setProperty(key: string, value: IValue): IError {
    const container = this.#properties.get(key);
    if (container === undefined) return Errors.invalidKeyError(`Key '${key}' does not exist.`);
    return container.setValue(value);
  }

  initConstant(key: string, value: IValue): boolean {
    return this.#init(new Constant(key, value));
  }

  initVariable(key: string, value: IValue): boolean {
    return this.#init(new Variable(key, value));
  }

  /** Adds or replaces a constant. For the host application only: a formula can never change a constant. */
  setConstant(key: string, value: IValue): void {
    this.setContainer(new Constant(key, value));
  }

  /** Adds or replaces a container; a replaced key keeps its position. */
  setContainer(container: Container): void {
    this.#properties.set(container.name, container);
  }

  removeProperty(key: string): boolean {
    return this.#properties.delete(key);
  }

  #init(container: Container): boolean {
    if (this.#properties.has(container.name)) return false;
    this.#properties.set(container.name, container);
    return true;
  }

  /** `{ key: value }` */
  toString(): string {
    return objectToString(this);
  }

  /** Creates an object with variables from the entries. */
  static from(entries: Iterable<readonly [string, IValue]>): FlObject {
    const object = new FlObject();
    for (const [key, value] of entries) object.initVariable(key, value);
    return object;
  }
}
