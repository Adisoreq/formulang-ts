/**
 * Contracts of the execution pipeline: validation, clean-up, tokenization, parsing and evaluation.
 *
 * @see https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/execution.md
 * @module
 */
import type { IError, IValue } from "./primitives.js";
import type { IContext, IEnvironment } from "./structures.js";

/** Type of a token (docs/semantics/token.md). */
export const TokenType = {
  None: "None",
  Operator: "Operator",
  Number: "Number",
  Text: "Text",
  Identifier: "Identifier",
} as const;
export type TokenType = (typeof TokenType)[keyof typeof TokenType];

/** Classification of an expression in the primitive map (docs/semantics/parsing.md, "Primitive classification"). */
export const ExpressionKind = {
  /** Literal value: number, text, `true`, `false`, `null`. */
  Value: "Value",
  /** Variable with a `$` (context) or `@` (environment) sigil. */
  Variable: "Variable",
  /** Identifier without a sigil or parentheses: a constant, or a named function used as a Delegate. */
  Constant: "Constant",
  /** Lambda parameter inside a lambda body. Unresolved until the lambda is invoked. */
  Parameter: "Parameter",
  /** Function or procedure call; every operator is translated into one. */
  FunctionCall: "FunctionCall",
  /** Lambda expression; its body is a separate tree. */
  Lambda: "Lambda",
} as const;
export type ExpressionKind = (typeof ExpressionKind)[keyof typeof ExpressionKind];

/** Scope of a variable: `$` (context) or `@` (environment). */
export const VariableScope = {
  Context: "Context",
  Environment: "Environment",
} as const;
export type VariableScope = (typeof VariableScope)[keyof typeof VariableScope];

/** Result of a stage. A stage never throws for a problem of the formula; it returns a failed result. */
export interface IOperationResult {
  /** `SUCCESS`, or the Error that stopped the stage. */
  readonly error: IError;
  readonly successful: boolean;
}

export interface IToken {
  readonly type: TokenType;
  readonly value: string;
}

// Stage 1: validation

export interface IValidationResult extends IOperationResult {
  /** Errors in the order of detection; empty if the formula is valid. {@link IOperationResult.error} is the first of them. */
  readonly errors: readonly IError[];
}

/** Validation stage: a fast, shallow check of the raw formula and the environment that reports every problem at once. */
export interface IValidator {
  validate(formula: string, environment: IEnvironment): IValidationResult;
}

// Stage 2: clean-up

export interface ICleanUpResult extends IOperationResult {
  readonly result: string;
}

export interface ICleaner {
  cleanUp(expression: string): ICleanUpResult;
}

// Stage 3: tokenization

export interface ITokenizationResult extends IOperationResult {
  readonly tokens: readonly IToken[];
}

export interface ITokenizer {
  tokenize(expression: string): ITokenizationResult;
}

// Stage 4: parsing

interface ExpressionNodeBase {
  /** Canonical form of the expression, e.g. `ADD(POW($a,2),POW($b,2))`. Key of the primitive map. */
  readonly key: string;
  readonly kind: ExpressionKind;
  /** Depth of the node: 1 for the root of a sequence. */
  readonly level: number;
  readonly children: readonly IExpressionNode[];
}

export interface ILiteralExpression extends ExpressionNodeBase {
  readonly kind: typeof ExpressionKind.Value;
  readonly value: IValue;
}

export interface IVariableExpression extends ExpressionNodeBase {
  readonly kind: typeof ExpressionKind.Variable;
  readonly scope: VariableScope;
  readonly name: string;
}

export interface IConstantExpression extends ExpressionNodeBase {
  readonly kind: typeof ExpressionKind.Constant;
  readonly name: string;
}

export interface IParameterExpression extends ExpressionNodeBase {
  readonly kind: typeof ExpressionKind.Parameter;
  readonly name: string;
}

export interface ICallExpression extends ExpressionNodeBase {
  readonly kind: typeof ExpressionKind.FunctionCall;
  /** Name of the called function or procedure. */
  readonly name: string;
}

export interface ILambdaExpression extends ExpressionNodeBase {
  readonly kind: typeof ExpressionKind.Lambda;
  readonly parameters: readonly string[];
  /** Body of the lambda: a separate tree with its own parsing queue. */
  readonly body: ISequence;
  /** Primitive map of the body. */
  readonly primitiveMap: ReadonlyMap<string, IExpressionNode>;
}

/** Node of an expression (reference) tree. The `kind` discriminates the node types. */
export type IExpressionNode =
  | ILiteralExpression
  | IVariableExpression
  | IConstantExpression
  | IParameterExpression
  | ICallExpression
  | ILambdaExpression;

/** One top-level expression of a formula (docs/core/formula.md, "Formula sequences"). */
export interface ISequence {
  readonly root: IExpressionNode;
  /** Parsing queue: the nodes ordered bottom-up (highest level first, left to right within a level). The root is last. */
  readonly queue: readonly IExpressionNode[];
}

export interface IParsingResult extends IOperationResult {
  /** Sequences in formula order, each with its own tree and parsing queue. */
  readonly sequences: readonly ISequence[];
  /**
   * Primitive map shared by the whole formula: every unique expression, by its canonical key.
   * Lambda bodies have their own maps and are not included.
   */
  readonly primitiveMap: ReadonlyMap<string, IExpressionNode>;
}

export interface IParser {
  parse(tokens: readonly IToken[]): IParsingResult;
}

// Stage 5: evaluation

export interface IEvaluationResult extends IOperationResult {
  /** Value of the last evaluated sequence, or the Error that aborted the execution. */
  readonly value: IValue;
}

/** Evaluation stage: resolves the parsed sequences into values, in the order of their parsing queues. */
export interface IEvaluator {
  evaluate(formula: IParsingResult, context: IContext): IEvaluationResult;
}

// Finalization

/** Result of the whole execution, returned by finalization (docs/semantics/execution.md). */
export interface IExecutionResult extends IOperationResult {
  /** Result of the formula. If the execution was aborted, the Error that aborted it. */
  readonly value: IValue;
  /** All errors found by validation; empty if validation passed. */
  readonly validationErrors: readonly IError[];
  /** Context the formula was executed in; keep it to execute the next formula in a persistent context. */
  readonly context: IContext;
}
