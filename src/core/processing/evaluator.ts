import type { IFunctionOverload, ILambda } from "../../abstractions/functions.js";
import type { IError, IType, IValue } from "../../abstractions/primitives.js";
import { ContainerType, FunctionType, PrimitiveType } from "../../abstractions/primitives.js";
import type {
  ICallExpression,
  IEvaluator,
  IExpressionNode,
  ILambdaExpression,
  IParsingResult,
  ISequence,
  IVariableExpression,
} from "../../abstractions/processing.js";
import { ExpressionKind, VariableScope } from "../../abstractions/processing.js";
import type { IContext } from "../../abstractions/structures.js";
import { Errors } from "../errors.js";
import { isProcedure } from "../functions/function.js";
import { Types } from "../primitives/types.js";
import { Value, isFailure } from "../primitives/value.js";
import { VariableReference } from "../primitives/variable-reference.js";
import { suppressErrors } from "../structures/context-variables.js";
import { EvaluationResult } from "./results.js";

/** Parameters of the lambdas being invoked; a lambda body can read the parameters of enclosing lambdas. */
class Scope {
  constructor(
    readonly context: IContext,
    private readonly parameters: ReadonlyMap<string, IValue> | undefined,
    private readonly parent: Scope | undefined,
  ) {}

  lookup(name: string): IValue | undefined {
    return this.parameters?.get(name) ?? this.parent?.lookup(name);
  }
}

/**
 * Evaluation stage (docs/semantics/evaluation.md): traverses the parsing queue of every sequence bottom-up.
 * An Error at the root of a sequence aborts the execution, unless `@suppress_errors` is `true`; then the result
 * of the sequence is `null`. The result of the formula is the value of the last sequence.
 *
 * The values computed during evaluation are kept per node of the current queue (conformance D2).
 */
export class Evaluator implements IEvaluator {
  evaluate(formula: IParsingResult, context: IContext): EvaluationResult {
    let last: IValue = Value.success();
    for (const sequence of formula.sequences) {
      let result = this.evaluateSequence(sequence, new Scope(context, undefined, undefined), true);
      if (isFailure(result)) {
        if (!suppressErrors(context)) return new EvaluationResult(result, result.raw as IError);
        result = Value.null();
      }
      last = result;
    }
    return new EvaluationResult(last);
  }

  /** @internal Evaluates a sequence of the formula or a lambda body. */
  evaluateSequence(sequence: ISequence, scope: Scope, isFormulaSequence: boolean): IValue {
    const results = new Map<IExpressionNode, IValue>();
    for (const node of sequence.queue) {
      const declaration = isFormulaSequence && node === sequence.root;
      results.set(node, this.#evaluateNode(node, results, scope, declaration));
    }
    return results.get(sequence.root)!;
  }

  #evaluateNode(
    node: IExpressionNode,
    results: ReadonlyMap<IExpressionNode, IValue>,
    scope: Scope,
    root: boolean,
  ): IValue {
    switch (node.kind) {
      case ExpressionKind.Value:
        return node.value;
      case ExpressionKind.Variable:
        return root && node.scope === VariableScope.Context
          ? readOrDeclare(node.name, scope.context)
          : readVariable(node, scope.context);
      case ExpressionKind.Constant:
        return readConstant(node.name, scope.context);
      case ExpressionKind.Parameter:
        return (
          scope.lookup(node.name) ??
          Value.error(Errors.unknownSymbolError(`Lambda parameter "${node.name}" has no value.`), node.name)
        );
      case ExpressionKind.Lambda:
        return Value.delegate(new Lambda(node, this, scope), node.key);
      case ExpressionKind.FunctionCall:
        return call(node, results, scope.context);
    }
  }
}

function call(node: ICallExpression, results: ReadonlyMap<IExpressionNode, IValue>, context: IContext): IValue {
  const fn = context.environment.getFunction(node.name);
  if (fn === undefined) {
    return Value.error(Errors.unknownSymbolError(`Function "${node.name}" is not defined.`), node.key);
  }
  const takesVariable = isProcedure(fn) && fn.takesVariable;
  const args = node.children.map((child, i) =>
    // The variable argument of SET, INIT and COND_SET is the variable itself, not its value
    i === 0 && takesVariable && child.kind === ExpressionKind.Variable
      ? new VariableReference(child.scope, child.name).toValue()
      : results.get(child)!,
  );
  return fn.invoke(args, context);
}

// Reading variables (docs/semantics/evaluation.md, "Direct extraction")

/** A `$x` that is a whole sequence: reads the variable, or declares it without a value. */
function readOrDeclare(name: string, context: IContext): IValue {
  const container = context.getProperty(name);
  if (container !== undefined) return container.getValue();
  if (context.environment.hasKey(name) || context.environmentVariables.hasKey(name)) {
    return Value.error(
      Errors.invalidIdentifierError(`"${name}" symbol is already defined by environment.`),
      "$" + name,
    );
  }
  context.initVariable(name, Value.undefined("$" + name));
  return Value.success("$" + name);
}

function readVariable(node: IVariableExpression, context: IContext): IValue {
  if (node.scope === VariableScope.Environment) {
    return (
      context.environmentVariables.getProperty(node.name)?.getValue() ??
      Value.error(Errors.environmentError(`Environment variable "${node.name}" is not defined.`), "@" + node.name)
    );
  }
  return (
    context.getProperty(node.name)?.getValue() ??
    Value.error(Errors.unknownSymbolError(`Variable "${node.name}" is not defined.`), "$" + node.name)
  );
}

/** A context constant, an environment constant, or a named function used as a Delegate (conformance I9). */
function readConstant(name: string, context: IContext): IValue {
  const own = context.getProperty(name);
  if (own?.containerType === ContainerType.Constant) return own.getValue();
  const environment = context.environment.getProperty(name);
  if (environment?.containerType === ContainerType.Constant) return environment.getValue();
  const fn = context.environment.getFunction(name);
  if (fn !== undefined) return Value.delegate(fn, name);
  return Value.error(Errors.unknownSymbolError(`Constant "${name}" is not defined.`), name);
}

/**
 * Delegate created by a lambda expression. It captures the scope it was created in, so its body can read
 * context variables and the parameters of enclosing lambdas (conformance I12).
 */
export class Lambda implements ILambda {
  readonly primitiveType = PrimitiveType.Function;
  readonly functionType = FunctionType.Lambda;
  readonly overloads: readonly IFunctionOverload[] = [];

  /** @internal */
  constructor(
    private readonly node: ILambdaExpression,
    private readonly evaluator: Evaluator,
    private readonly scope: Scope,
  ) {}

  get name(): string {
    return this.node.key;
  }

  get expression(): string {
    return this.node.key;
  }

  get type(): IType {
    return Types.Delegate;
  }

  get parameters(): readonly string[] {
    return this.node.parameters;
  }

  get canAccessValue(): boolean {
    return true;
  }

  get canUpdateValue(): IError {
    return Errors.operationError("A lambda function cannot be changed.");
  }

  getValue(): IValue {
    return Value.delegate(this, this.name);
  }

  setValue(_value: IValue): IError {
    return this.canUpdateValue;
  }

  /** Evaluates the body with the arguments bound to the parameters; `ARGUMENT_ERROR` for a wrong count. */
  invoke(parameters: readonly IValue[], _context: IContext): IValue {
    const expected = this.parameters.length;
    if (parameters.length !== expected) {
      return Value.error(
        Errors.argumentError(`The lambda expects ${expected} argument(s), but ${parameters.length} were given.`),
        this.name,
      );
    }
    const bindings = new Map(this.parameters.map((name, i) => [name, parameters[i]!] as const));
    return this.evaluator.evaluateSequence(this.node.body, new Scope(this.scope.context, bindings, this.scope), false);
  }

  toString(): string {
    return `(${this.parameters.join(", ")}) => any`;
  }
}
