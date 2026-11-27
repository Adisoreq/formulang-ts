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
import type { IContext, IEnvironment } from "../../abstractions/structures.js";
import { Errors } from "../errors.js";
import { FlFunction, Procedure, isProcedure } from "../functions/function.js";
import { TypeNames, Types } from "../primitives/types.js";
import { Value, isFailure } from "../primitives/value.js";
import { VariableReference } from "../primitives/variable-reference.js";
import { suppressErrors } from "../structures/context-variables.js";
import { ContextMemory } from "../structures/memory.js";
import { EvaluationResult } from "./results.js";

/**
 * Writes to the memory of the context (core-1.2) made while a sequence is evaluated: the range of the collected
 * writes made by every call node, so the writes of the nodes that are not on the selected path can be discarded.
 */
class WriteTracker {
  writes: Map<IExpressionNode, readonly [number, number]> | undefined;

  constructor(readonly memory: ContextMemory) {}
}

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
    const memory = scope.context.memory;
    const tracker = memory instanceof ContextMemory ? new WriteTracker(memory) : undefined;
    let value: IValue;
    if (skipsBranches(sequence, scope.context.environment)) {
      value = this.#evaluateSelected(sequence.root, sequence, results, scope, isFormulaSequence, tracker);
    } else {
      for (const node of sequence.queue) {
        const declaration = isFormulaSequence && node === sequence.root;
        results.set(node, this.#evaluateNode(node, results, scope, declaration, tracker));
      }
      value = results.get(sequence.root)!;
    }
    if (tracker?.writes !== undefined) discardUnselectedWrites(sequence.root, results, tracker);
    return value;
  }

  /**
   * Evaluates a node after its children, top-down, and only the selected branch of an `IF` whose condition is a
   * Boolean. A condition of another type goes to `IF` with both branches, as in the queue.
   */
  #evaluateSelected(
    node: IExpressionNode,
    sequence: ISequence,
    results: Map<IExpressionNode, IValue>,
    scope: Scope,
    isFormulaSequence: boolean,
    tracker: WriteTracker | undefined,
  ): IValue {
    const known = results.get(node);
    if (known !== undefined) return known;
    if (node.kind === ExpressionKind.FunctionCall && node.name === IF_NAME && node.children.length === 3) {
      const condition = this.#evaluateSelected(node.children[0]!, sequence, results, scope, isFormulaSequence, tracker);
      if (condition.type.base === TypeNames.Boolean) {
        // IF(true, then, else) returns then, IF(false, then, else) returns else, unchanged
        const selected = node.children[condition.raw === true ? 1 : 2]!;
        const value = this.#evaluateSelected(selected, sequence, results, scope, isFormulaSequence, tracker);
        results.set(node, value);
        return value;
      }
    }
    for (const child of node.children) {
      this.#evaluateSelected(child, sequence, results, scope, isFormulaSequence, tracker);
    }
    const value = this.#evaluateNode(node, results, scope, isFormulaSequence && node === sequence.root, tracker);
    results.set(node, value);
    return value;
  }

  #evaluateNode(
    node: IExpressionNode,
    results: ReadonlyMap<IExpressionNode, IValue>,
    scope: Scope,
    root: boolean,
    tracker: WriteTracker | undefined,
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
        return call(node, results, scope.context, tracker);
    }
  }
}

// Memory writes on the selected path only (docs/core/context.md, "Memory", rule 2)
//
// All the arguments of IF, AND and OR are computed before the call, so a STORE or CLEAR in a branch of IF that is not
// selected, or in an argument of AND / OR after the deciding one, is executed too. Its write is collected with the
// call node that made it (also through a lambda invoked by the call), and discarded when the sequence is complete.

const AND_NAME = "AND";
const OR_NAME = "OR";

function discardUnselectedWrites(
  root: IExpressionNode,
  results: ReadonlyMap<IExpressionNode, IValue>,
  tracker: WriteTracker,
): void {
  const selected = new Set<IExpressionNode>();
  markSelected(root, results, selected);
  for (const [node, [from, to]] of tracker.writes!) {
    if (!selected.has(node)) tracker.memory.discard(from, to);
  }
}

/**
 * Marks the nodes on the selected path: the condition of `IF` and its selected branch (none for a condition that is
 * not a Boolean, because `IF` then selects no branch), the arguments of `AND` / `OR` up to the deciding one, and
 * every child of the other nodes.
 */
function markSelected(
  node: IExpressionNode,
  results: ReadonlyMap<IExpressionNode, IValue>,
  selected: Set<IExpressionNode>,
): void {
  selected.add(node);
  if (node.kind !== ExpressionKind.FunctionCall) return;
  const children = node.children;
  if (node.name === IF_NAME && children.length === 3) {
    markSelected(children[0]!, results, selected);
    const condition = results.get(children[0]!);
    if (condition?.type.base === TypeNames.Boolean) {
      markSelected(children[condition.raw === true ? 1 : 2]!, results, selected);
    }
    return;
  }
  if ((node.name === AND_NAME || node.name === OR_NAME) && children.length >= 2) {
    const deciding = node.name === OR_NAME;
    for (const child of children) {
      markSelected(child, results, selected);
      const value = results.get(child);
      if (value?.type.base === TypeNames.Boolean && value.raw === deciding) return;
    }
    return;
  }
  for (const child of children) markSelected(child, results, selected);
}

// Skipping the branch of IF that is not selected (an optimization with the same result)
//
// IF receives both branches computed (docs/standards/core/functions/IF.md), so a branch that is not selected is
// computed only for its side effects, and its value (even an Error) is discarded. In a sequence where every function
// is side-effect free, the branch has no effects either, so it can be skipped, and the order of the nodes cannot
// change a result. Only these sequences are evaluated top-down; the others follow the queue.

const IF_NAME = "IF";

const branchAnalyses = new WeakMap<ISequence, { readonly environment: IEnvironment; readonly skips: boolean }>();

/**
 * Whether the sequence has an `IF` and only side-effect-free functions, apart from an assignment at its root
 * (e.g. `$x = IF(...)`). The result is stored for every sequence and environment.
 */
function skipsBranches(sequence: ISequence, environment: IEnvironment): boolean {
  const known = branchAnalyses.get(sequence);
  if (known?.environment === environment) return known.skips;
  const state = { hasIf: false };
  const root = sequence.root;
  const rootFunction = root.kind === ExpressionKind.FunctionCall ? environment.getFunction(root.name) : undefined;
  const pure =
    root.kind === ExpressionKind.FunctionCall &&
    rootFunction !== undefined &&
    isProcedure(rootFunction) &&
    rootFunction.takesVariable &&
    root.children[0]?.kind === ExpressionKind.Variable
      ? root.children.slice(1).every((child) => isSideEffectFree(child, environment, state))
      : isSideEffectFree(root, environment, state);
  const skips = pure && state.hasIf;
  branchAnalyses.set(sequence, { environment, skips });
  return skips;
}

function isSideEffectFree(node: IExpressionNode, environment: IEnvironment, state: { hasIf: boolean }): boolean {
  switch (node.kind) {
    case ExpressionKind.Value:
    case ExpressionKind.Variable:
    case ExpressionKind.Constant:
    case ExpressionKind.Parameter:
      return true;
    case ExpressionKind.Lambda:
      return isSideEffectFree(node.body.root, environment, state);
    case ExpressionKind.FunctionCall: {
      const fn = environment.getFunction(node.name);
      // STORE and CLEAR are allowed: their writes in a branch that is not selected are discarded anyway
      if (!(fn instanceof FlFunction) || !(fn.sideEffectFree || (fn instanceof Procedure && fn.writesMemoryOnly))) {
        return false;
      }
      if (node.name === IF_NAME) state.hasIf = true;
      return node.children.every(
        // A delegate argument is invoked by the function: it must be a lambda (checked as a node) or a side-effect-free
        // named function, not a delegate from a variable whose body is not known here
        (child, i) =>
          (!takesDelegate(fn, i) || isKnownDelegate(child, environment)) && isSideEffectFree(child, environment, state),
      );
    }
  }
}

function takesDelegate(fn: FlFunction, position: number): boolean {
  return fn.overloads.some((overload) => {
    const template = overload.template;
    const last = template[template.length - 1];
    const at = template[position] ?? (last?.multiple ? last : undefined);
    return at !== undefined && !at.anyType && at.type.base === TypeNames.Delegate;
  });
}

function isKnownDelegate(node: IExpressionNode, environment: IEnvironment): boolean {
  if (node.kind === ExpressionKind.Lambda || node.kind === ExpressionKind.Value) return true;
  if (node.kind !== ExpressionKind.Constant) return false;
  const fn = environment.getFunction(node.name);
  return fn === undefined || (fn instanceof FlFunction && fn.sideEffectFree);
}

function call(
  node: ICallExpression,
  results: ReadonlyMap<IExpressionNode, IValue>,
  context: IContext,
  tracker: WriteTracker | undefined,
): IValue {
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
  if (tracker === undefined) return fn.invoke(args, context);
  const before = tracker.memory.pendingCount;
  const value = fn.invoke(args, context);
  const after = tracker.memory.pendingCount;
  if (after > before) (tracker.writes ??= new Map()).set(node, [before, after]);
  return value;
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

/** Maximum number of lambda invocations running one inside another (docs/semantics/evaluation.md). */
export const MAX_INVOCATION_DEPTH = 256;

// Lambda invocations running one inside another; JavaScript runs one execution at a time on a thread
let invocationDepth = 0;

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
    // docs/semantics/evaluation.md, "Invocation depth": a deeper invocation is an OPERATION_ERROR, never a stack overflow
    if (invocationDepth >= MAX_INVOCATION_DEPTH) {
      return Value.error(
        Errors.operationError(
          `Lambda invocations are nested more than ${MAX_INVOCATION_DEPTH} deep (a recursion that does not stop?).`,
        ),
        this.name,
      );
    }
    const bindings = new Map(this.parameters.map((name, i) => [name, parameters[i]!] as const));
    invocationDepth++;
    try {
      return this.evaluator.evaluateSequence(
        this.node.body,
        new Scope(this.scope.context, bindings, this.scope),
        false,
      );
    } catch (error) {
      // A small stack (e.g. a worker) could overflow before the limit: an Error is still better than an exception
      if (error instanceof RangeError) {
        return Value.error(Errors.operationError("Lambda invocations are nested too deep for the stack."), this.name);
      }
      throw error;
    } finally {
      invocationDepth--;
    }
  }

  toString(): string {
    return `(${this.parameters.join(", ")}) => any`;
  }
}
