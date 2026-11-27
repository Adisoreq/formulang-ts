import type { IArgumentTemplate, IFunction, IFunctionOverload, IProcedure } from "../../abstractions/functions.js";
import type { IError, IType, IValue } from "../../abstractions/primitives.js";
import { FunctionType, PrimitiveType } from "../../abstractions/primitives.js";
import type { IContext } from "../../abstractions/structures.js";
import { Errors } from "../errors.js";
import { TypeNames, Types } from "../primitives/types.js";
import { Value } from "../primitives/value.js";
import { matchesTemplates, validateTemplates } from "./argument-template.js";

/** Implementation of an overload. The arguments match the template of the overload. */
export type FunctionImplementation = (args: readonly IValue[], context: IContext) => IValue;

/** One overload of a named function: an argument template and an implementation. */
export class FunctionOverload implements IFunctionOverload {
  readonly template: readonly IArgumentTemplate[];
  readonly #implementation: FunctionImplementation;

  /** @throws {TypeError} if the template breaks the rules of argument collection templates. */
  constructor(template: readonly IArgumentTemplate[], implementation: FunctionImplementation) {
    const validation = validateTemplates(template);
    if (validation.isFailed()) throw new TypeError(validation.message);
    this.template = Object.freeze([...template]);
    this.#implementation = implementation;
  }

  invoke(parameters: readonly IValue[], context: IContext): IValue {
    return this.#implementation(parameters, context);
  }

  matches(parameters: readonly IValue[], context: IContext): boolean {
    return matchesTemplates(parameters, this.template, context.environment);
  }

  toString(): string {
    return `(${this.template.join(", ")})`;
  }
}

function firstError(values: readonly IValue[]): IValue | undefined {
  return values.find((value) => value.type.base === TypeNames.Error);
}

/** Options of a named function. */
export interface FunctionOptions {
  /**
   * The function only computes its result from its arguments: it changes nothing in the context, the environment or
   * the host application, so skipping a call whose result is discarded changes nothing either. The evaluator then
   * skips the branch of `IF` that is not selected (docs/standards/core/functions/IF.md). `false` by default, e.g. for a
   * function of the host application that records diagnostics.
   */
  readonly sideEffectFree?: boolean;
}

/**
 * Named function (docs/core/functions.md). A call is resolved to the first overload that matches the arguments
 * (docs/semantics/evaluation.md). If none matches, the call returns the leftmost Error argument, the first Error
 * element of an argument with an element type, or an `ARGUMENT_ERROR`.
 */
export class FlFunction implements IFunction {
  readonly primitiveType = PrimitiveType.Function;
  readonly overloads: readonly IFunctionOverload[];
  /** See {@link FunctionOptions.sideEffectFree}. */
  readonly sideEffectFree: boolean;

  constructor(
    readonly name: string,
    overloads: readonly IFunctionOverload[],
    readonly functionType: FunctionType = FunctionType.Function,
    options: FunctionOptions = {},
  ) {
    this.overloads = Object.freeze([...overloads]);
    this.sideEffectFree = functionType !== FunctionType.Procedure && options.sideEffectFree === true;
  }

  get type(): IType {
    return Types.Delegate;
  }

  get expression(): string {
    return this.name;
  }

  get canAccessValue(): boolean {
    return true;
  }

  get canUpdateValue(): IError {
    return Errors.invalidIdentifierError(`Function "${this.name}" cannot be redefined.`);
  }

  getValue(): IValue {
    return Value.delegate(this, this.name);
  }

  setValue(_value: IValue): IError {
    return this.canUpdateValue;
  }

  invoke(parameters: readonly IValue[], context: IContext): IValue {
    if (this.functionType === FunctionType.Procedure) {
      // A procedure is not executed when an argument is an Error (docs/standards/core/procedures/README.md)
      const error = firstError(parameters);
      if (error !== undefined) return error;
    }
    for (const overload of this.overloads) {
      if (overload.matches(parameters, context)) return overload.invoke(parameters, context);
    }
    const error = firstError(parameters) ?? this.#firstErrorElement(parameters);
    if (error !== undefined) return error;
    const types = parameters.map((p) => p.type.toString()).join(", ");
    return Value.error(
      Errors.argumentError(`No overload of "${this.name}" matches the arguments (${types}).`),
      this.name,
    );
  }

  /** The first Error element of an array argument whose template has an element type. */
  #firstErrorElement(parameters: readonly IValue[]): IValue | undefined {
    for (let i = 0; i < parameters.length; i++) {
      const raw = parameters[i]!.raw;
      if (!Array.isArray(raw)) continue;
      const elementTyped = this.overloads.some((o) => o.template[i]?.elementType !== undefined);
      const error = elementTyped ? firstError(raw as IValue[]) : undefined;
      if (error !== undefined) return error;
    }
    return undefined;
  }

  toString(): string {
    return `${this.name}(args) => any`;
  }
}

export interface ProcedureOptions {
  /** Number of arguments, used to parse a call without parentheses (`SET $x 100`). */
  readonly parameterCount: number;
  /** The first argument is the variable itself, not its value. */
  readonly takesVariable: boolean;
  /**
   * The only side effects of the procedure are writes to the memory of the context (`STORE`, `CLEAR`). They are
   * discarded in a branch of `IF` that is not selected, so the branch may still be skipped
   * (docs/standards/core/functions/IF.md, "Performance"). `false` by default.
   */
  readonly writesMemoryOnly?: boolean;
}

/** Named procedure (docs/standards/core/procedures/README.md). */
export class Procedure extends FlFunction implements IProcedure {
  declare readonly functionType: typeof FunctionType.Procedure;
  readonly parameterCount: number;
  readonly takesVariable: boolean;
  /** See {@link ProcedureOptions.writesMemoryOnly}. */
  readonly writesMemoryOnly: boolean;

  constructor(name: string, options: ProcedureOptions, overloads: readonly IFunctionOverload[]) {
    super(name, overloads, FunctionType.Procedure);
    this.parameterCount = options.parameterCount;
    this.takesVariable = options.takesVariable;
    this.writesMemoryOnly = options.writesMemoryOnly === true;
  }
}

/** Whether the function is a procedure. */
export function isProcedure(fn: IFunction): fn is IProcedure {
  return fn.functionType === FunctionType.Procedure;
}
