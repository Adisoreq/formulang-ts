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
  /** Line of the first character of the token (from 1), if the tokenizer records positions. */
  readonly line?: number | undefined;
  /** Column of the first character of the token (from 1), if the tokenizer records positions. */
  readonly column?: number | undefined;
}

/** Codes of the warnings of the Core standard (docs/standards/core/semantics/warnings.md, since `core-1.2`). */
export const WarningCode = {
  /** A sequence that is not the last one computes a value that is discarded. */
  UnusedValue: "UNUSED_VALUE",
  /** A sequence that starts with `-` or `!` on the line after another sequence. */
  ContinuedLine: "CONTINUED_LINE",
  /** A known key of the metadata has a value of a wrong type. */
  MetadataType: "METADATA_TYPE",
  /** The `context` of the metadata is not the context type of the execution, nor one of its base types. */
  MetadataContext: "METADATA_CONTEXT",
} as const;
export type WarningCode = (typeof WarningCode)[keyof typeof WarningCode];

/**
 * A message about a formula that is valid, but probably not what the author meant. A warning never changes the
 * result of a formula (docs/standards/core/semantics/warnings.md).
 */
export interface IWarning {
  /** Code of the warning; the Core standard defines the {@link WarningCode}s. */
  readonly code: string;
  readonly message: string;
  /** Line of the original formula text, from 1. */
  readonly line: number;
  /** Column of the original formula text (in Unicode code points), from 1. */
  readonly column: number;
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

// Preparation (docs/semantics/execution.md, "Execution modes", since core-1.2)

/** Result of the metadata reading (docs/core/metadata.md, "Metadata reading"). */
export interface IMetadataResult extends IOperationResult {
  /** The metadata Object; `{ }` for a formula without a metadata block, or after an Error. */
  readonly metadata: IValue;
  /** The formula with the metadata block replaced by white space, so the positions of the rest do not change. */
  readonly formula: string;
}

/**
 * A **prepared formula**: the result of the preparation (validation, metadata reading, clean-up, tokenization and
 * parsing). A hot execution evaluates it again without preparing the formula.
 */
export interface IPreparedFormula extends IParsingResult {
  /** The formula text that was prepared. */
  readonly formula: string;
  /** The metadata Object of the formula (`{ }` without a metadata block). */
  readonly metadata: IValue;
  /** Warnings of the preparation, in the order of their positions. */
  readonly warnings: readonly IWarning[];
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
