/**
 * Contracts of functions, procedures, lambdas and argument templates.
 *
 * @see https://github.com/Adisoreq/FormuLang/blob/main/docs/implementation/argument_template.md
 * @module
 */
import type { FunctionType, IPrimitive, IType, IValue } from "./primitives.js";
import type { IContext } from "./structures.js";

/** Template of one argument of a function overload (docs/implementation/argument_template.md). */
export interface IArgumentTemplate {
  readonly name: string;
  /** Type of the argument. Ignored when {@link anyType} is set. */
  readonly type: IType;
  /** Base type of every element, if the type is Array (e.g. `Array<Number>`); `undefined` for no requirement. */
  readonly elementType: IType | undefined;
  /** The argument matches a value of any type, including an Error. */
  readonly anyType: boolean;
  /** The template is applied to the rest of the arguments (only the last template). */
  readonly multiple: boolean;
  /** The argument may be omitted. */
  readonly optional: boolean;
  /** `...name? <Type>` */
  toString(): string;
}

/** Something that can be called with arguments in the context of an execution. */
export interface IInvokable {
  /**
   * @param parameters Arguments of the call.
   * @param context Context of the current execution. Functions read environment variables from it
   * (e.g. `array_indexing`), because a formula can override them for one execution.
   */
  invoke(parameters: readonly IValue[], context: IContext): IValue;
}

/** One overload of a named function: an argument template and an implementation. */
export interface IFunctionOverload extends IInvokable {
  readonly template: readonly IArgumentTemplate[];
  matches(parameters: readonly IValue[], context: IContext): boolean;
}

/** Named function, procedure or lambda. Used as the raw value of a Delegate. */
export interface IFunction extends IPrimitive, IInvokable {
  readonly name: string;
  readonly functionType: FunctionType;
  /** Overloads of a named function. Empty for a lambda function. */
  readonly overloads: readonly IFunctionOverload[];
}

/** Named procedure (docs/standards/core/procedures/README.md). */
export interface IProcedure extends IFunction {
  readonly functionType: typeof FunctionType.Procedure;
  /** Number of arguments, used to parse a call without parentheses (`SET $x 100`). */
  readonly parameterCount: number;
  /** The first argument is the variable itself, not its value (`SET`, `INIT`, `COND_SET`). */
  readonly takesVariable: boolean;
}

/** Anonymous lambda function. It has no overloads: the number of arguments must equal the number of parameters. */
export interface ILambda extends IFunction {
  readonly functionType: typeof FunctionType.Lambda;
  readonly parameters: readonly string[];
}
