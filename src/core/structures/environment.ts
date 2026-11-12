import type { IFunction } from "../../abstractions/functions.js";
import type { IEnvironment, IStandard } from "../../abstractions/structures.js";
import { FlObject } from "../primitives/object.js";
import { TypeNames } from "../primitives/types.js";
import { Value } from "../primitives/value.js";
import { SerializationVariables } from "../serialization/serializer.js";
import { CoreStandard } from "../standards/core-standard.js";
import { AbstractTree } from "./abstract-tree.js";
import { EnvironmentVariables } from "./context-variables.js";
import { standardIdentifier } from "./standard.js";

/**
 * Environment of the Core standard (docs/core/environment.md): the supported standards with their functions and
 * extended types, the environment constants and the default values of the environment variables.
 *
 * A formula never changes the environment: it changes the copies of the environment variables in its context.
 */
export class Environment extends FlObject implements IEnvironment {
  readonly #standards: string[] = [];
  readonly #extendedTypes: string[] = [];
  readonly #typeTree = new AbstractTree<string>(TypeNames.Object, TypeNames.Object);
  readonly #functions = new Map<string, IFunction>();

  protected constructor() {
    super();
  }

  /**
   * An environment that supports the Core standard: its functions and procedures, the constants `STANDARDS`,
   * `E`, `PI`, `PHI`, `TRUE`, `FALSE` and `NULL`, the variables `array_indexing` and `suppress_errors`, and the
   * serialization variables.
   */
  static create(): Environment {
    const environment = new Environment();
    // Constants
    environment.initConstant("STANDARDS", Value.array([], "STANDARDS"));
    environment.initConstant("E", Value.number(Math.E, "E"));
    environment.initConstant("PI", Value.number(Math.PI, "PI"));
    environment.initConstant("PHI", Value.number((1 + Math.sqrt(5)) / 2, "PHI"));
    // Keyword constants
    environment.initConstant("TRUE", Value.boolean(true, "TRUE"));
    environment.initConstant("FALSE", Value.boolean(false, "FALSE"));
    environment.initConstant("NULL", Value.null("NULL"));
    // Variables
    environment.initVariable(EnvironmentVariables.arrayIndexing, Value.number(0, "0"));
    environment.initVariable(EnvironmentVariables.suppressErrors, Value.boolean(false, "false"));
    // Serialization variables
    environment.initVariable(SerializationVariables.decimalPlace, Value.number(-1, "-1"));
    environment.initVariable(SerializationVariables.splitArray, Value.boolean(false, "false"));
    environment.initVariable(SerializationVariables.splitObject, Value.boolean(false, "false"));
    environment.initVariable(SerializationVariables.includeObjectClass, Value.boolean(false, "false"));
    environment.initVariable(SerializationVariables.maxArrayPreview, Value.number(-1, "-1"));

    environment.registerStandard(CoreStandard.instance);
    return environment;
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
