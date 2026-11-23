import type { IFunction } from "../../abstractions/functions.js";
import type { IValue } from "../../abstractions/primitives.js";
import { ContainerType } from "../../abstractions/primitives.js";
import type { IEnvironment, IStandard } from "../../abstractions/structures.js";
import { FlObject } from "../primitives/object.js";
import { TypeNames } from "../primitives/types.js";
import { Value } from "../primitives/value.js";
import { numberToString, SerializationVariables } from "../serialization/serializer.js";
import { CoreStandard } from "../standards/core-standard.js";
import { AbstractTree } from "./abstract-tree.js";
import { EnvironmentConstants, EnvironmentVariables } from "./context-variables.js";
import { standardIdentifier } from "./standard.js";

/**
 * Environment of the Core standard (docs/core/environment.md): the supported standards with their functions and
 * extended types, the environment constants and the default values of the environment variables.
 *
 * A formula never changes the environment: it changes the copies of the environment variables in its context.
 */
export class Environment extends FlObject implements IEnvironment {
  /**
   * Clock of the `NOW` constant: Unix time in milliseconds, UTC. Every pre-execution reads it once
   * (docs/semantics/pre-execution.md), so `NOW` does not change during an execution. `undefined`: `NOW` is the
   * value of the environment constant, set by the host application with {@link setNow}.
   */
  clock: (() => number) | undefined = Date.now;

  readonly #standards: string[] = [];
  readonly #extendedTypes: string[] = [];
  readonly #typeTree = new AbstractTree<string>(TypeNames.Object, TypeNames.Object);
  readonly #functions = new Map<string, IFunction>();

  protected constructor() {
    super();
  }

  /**
   * An environment that supports the Core standard: its functions and procedures, the constants `STANDARDS`,
   * `E`, `PI`, `PHI`, `NOW`, `TRUE`, `FALSE` and `NULL`, the variables `array_indexing`, `suppress_errors` and
   * `time_offset`, and the serialization variables.
   */
  static create(): Environment {
    const environment = new Environment();
    // Constants
    environment.initConstant("STANDARDS", Value.array([], "STANDARDS"));
    environment.initConstant("E", Value.number(Math.E, "E"));
    environment.initConstant("PI", Value.number(Math.PI, "PI"));
    environment.initConstant("PHI", Value.number((1 + Math.sqrt(5)) / 2, "PHI"));
    environment.initConstant(EnvironmentConstants.now, nowValue(Date.now()));
    // Keyword constants
    environment.initConstant("TRUE", Value.boolean(true, "TRUE"));
    environment.initConstant("FALSE", Value.boolean(false, "FALSE"));
    environment.initConstant("NULL", Value.null("NULL"));
    // Variables
    environment.initVariable(EnvironmentVariables.arrayIndexing, Value.number(0, "0"));
    environment.initVariable(EnvironmentVariables.suppressErrors, Value.boolean(false, "false"));
    environment.initVariable(EnvironmentVariables.timeOffset, Value.number(0, "0"));
    // Serialization variables
    environment.initVariable(SerializationVariables.decimalPlace, Value.number(-1, "-1"));
    environment.initVariable(SerializationVariables.splitArray, Value.boolean(false, "false"));
    environment.initVariable(SerializationVariables.splitObject, Value.boolean(false, "false"));
    environment.initVariable(SerializationVariables.includeObjectClass, Value.boolean(false, "false"));
    environment.initVariable(SerializationVariables.maxArrayPreview, Value.number(-1, "-1"));

    environment.registerStandard(CoreStandard.instance);
    return environment;
  }

  /**
   * Pins the `NOW` constant to a point in time (Unix time in milliseconds, UTC) and stops reading the clock
   * ({@link clock} becomes `undefined`), e.g. for deterministic tests.
   */
  setNow(unixTimeMilliseconds: number): void {
    this.clock = undefined;
    this.setConstant(EnvironmentConstants.now, nowValue(unixTimeMilliseconds));
  }

  /**
   * The value of `NOW` for a new execution: the current time of the {@link clock}, or the value of the `NOW`
   * constant of the environment. `undefined` if the environment has neither.
   */
  static readNow(environment: IEnvironment): IValue | undefined {
    if (environment instanceof Environment && environment.clock !== undefined) return nowValue(environment.clock());
    const container = environment.getProperty(EnvironmentConstants.now);
    return container?.containerType === ContainerType.Constant && container.canAccessValue
      ? container.getValue()
      : undefined;
  }

  get standards(): readonly string[] {
    return [...this.#standards];
  }

  supports(standard: string): boolean {
    return this.#standards.includes(standard);
  }

  get extendedTypes(): readonly string[] {
    return [...this.#extendedTypes];
  }

  get extendedTypeTree(): AbstractTree<string> {
    return this.#typeTree;
  }

  get functions(): readonly IFunction[] {
    return [...this.#functions.values()];
  }

  getFunction(name: string): IFunction | undefined {
    return this.#functions.get(name);
  }

  /**
   * Adds a standard: its extended types, its functions, and its identifier (`<id>-<version>`) to `STANDARDS`.
   * A string adds only the identifier.
   *
   * @throws {Error} if a function or an extended type of the standard is already defined.
   */
  registerStandard(standard: IStandard | string): void {
    if (typeof standard === "string") {
      if (this.#standards.includes(standard)) return;
      this.#standards.push(standard);
      const identifiers = this.#standards.map((s) => Value.text(s));
      this.setConstant("STANDARDS", Value.array(identifiers, "STANDARDS"));
      return;
    }
    for (const type of standard.extendedTypes) {
      const parent = standard.extendedTypeTree.getNode(type)?.parent?.key;
      this.registerExtendedType(type, parent === undefined || parent === TypeNames.Object ? undefined : parent);
    }
    for (const fn of standard.namedFunctions) this.registerFunction(fn);
    this.registerStandard(standardIdentifier(standard));
  }

  /** @throws {Error} if a function with the same name is already defined. */
  registerFunction(fn: IFunction): void {
    if (this.#functions.has(fn.name)) throw new Error(`Function "${fn.name}" is already defined.`);
    this.#functions.set(fn.name, fn);
  }

  /**
   * Adds an extended type, derived from `parentType` (default: `Object`). Parents are registered before children.
   *
   * @throws {Error} if the type already exists or the parent does not exist.
   */
  registerExtendedType(extendedType: string, parentType?: string): void {
    this.#typeTree.addNode(extendedType, extendedType, parentType ?? TypeNames.Object);
    this.#extendedTypes.push(extendedType);
  }
}

/** A `NOW` value: Unix time in milliseconds. */
export function nowValue(unixTimeMilliseconds: number): IValue {
  return Value.number(unixTimeMilliseconds, numberToString(unixTimeMilliseconds));
}
