/**
 * Expression (reference) tree nodes produced by the parser. Every operator is translated into a function call,
 * so the tree contains only literals, variables, constants, lambda parameters, calls and lambdas.
 *
 * @module
 */
import type { IValue } from "../../abstractions/primitives.js";
import type {
  ICallExpression,
  IConstantExpression,
  IExpressionNode,
  ILambdaExpression,
  ILiteralExpression,
  IParameterExpression,
  ISequence,
  IVariableExpression,
} from "../../abstractions/processing.js";
import { ExpressionKind, VariableScope } from "../../abstractions/processing.js";
import { VariableReference } from "../primitives/variable-reference.js";
import { buildPrimitiveMap } from "./results.js";

abstract class ExpressionNode {
  abstract readonly key: string;
  /** Set when the parsing queue of the sequence is built. */
  level = 0;

  get children(): readonly IExpressionNode[] {
    return [];
  }

  toString(): string {
    return this.key;
  }
}

export class LiteralNode extends ExpressionNode implements ILiteralExpression {
  readonly kind = ExpressionKind.Value;

  constructor(
    readonly value: IValue,
    readonly key: string,
  ) {
    super();
  }
}

export class VariableNode extends ExpressionNode implements IVariableExpression {
  readonly kind = ExpressionKind.Variable;

  constructor(
    readonly scope: VariableScope,
    readonly name: string,
  ) {
    super();
  }

  get key(): string {
    return (this.scope === VariableScope.Context ? "$" : "@") + this.name;
  }

  get reference(): VariableReference {
    return new VariableReference(this.scope, this.name);
  }
}

export class ConstantNode extends ExpressionNode implements IConstantExpression {
  readonly kind = ExpressionKind.Constant;

  constructor(readonly name: string) {
    super();
  }

  get key(): string {
    return this.name;
  }
}

export class ParameterNode extends ExpressionNode implements IParameterExpression {
  readonly kind = ExpressionKind.Parameter;

  constructor(readonly name: string) {
    super();
  }

  get key(): string {
    return this.name;
  }
}

export class CallNode extends ExpressionNode implements ICallExpression {
  readonly kind = ExpressionKind.FunctionCall;
  readonly key: string;
  readonly #arguments: readonly IExpressionNode[];

  constructor(
    readonly name: string,
    args: readonly IExpressionNode[],
  ) {
    super();
    this.#arguments = Object.freeze([...args]);
    this.key = `${name}(${args.map((a) => a.key).join(",")})`;
  }

  override get children(): readonly IExpressionNode[] {
    return this.#arguments;
  }
}

export class LambdaNode extends ExpressionNode implements ILambdaExpression {
  readonly kind = ExpressionKind.Lambda;
  readonly key: string;
  readonly parameters: readonly string[];
  readonly primitiveMap: ReadonlyMap<string, IExpressionNode>;

  constructor(
    parameters: readonly string[],
    readonly body: ISequence,
  ) {
    super();
    this.parameters = Object.freeze([...parameters]);
    this.key = `(${parameters.join(",")})=>${body.root.key}`;
    this.primitiveMap = buildPrimitiveMap([body]);
  }
}

/**
 * One top-level expression (or a lambda body) with its parsing queue: the nodes bottom-up, highest level first
 * and left to right within a level (docs/semantics/parsing.md). The root is last.
 */
export class Sequence implements ISequence {
  readonly queue: readonly IExpressionNode[];

  constructor(readonly root: IExpressionNode) {
    this.queue = Sequence.buildQueue(root);
  }

  private static buildQueue(root: IExpressionNode): IExpressionNode[] {
    const levels: IExpressionNode[][] = [];
    let current: IExpressionNode[] = [root];
    for (let level = 1; current.length > 0; level++) {
      for (const node of current) (node as ExpressionNode).level = level;
      levels.push(current);
      current = current.flatMap((node) => node.children);
    }
    return levels.reverse().flat();
  }
}
