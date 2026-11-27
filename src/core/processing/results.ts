import type { IError, IValue } from "../../abstractions/primitives.js";
import type {
  ICleanUpResult,
  IEvaluationResult,
  IExecutionResult,
  IExpressionNode,
  IParsingResult,
  IPreparedFormula,
  ISequence,
  IToken,
  ITokenizationResult,
  IValidationResult,
  IWarning,
} from "../../abstractions/processing.js";
import type { IContext, IEnvironment } from "../../abstractions/structures.js";

const NO_WARNINGS: readonly IWarning[] = Object.freeze([]);
import { Errors } from "../errors.js";
import { TypeNames } from "../primitives/types.js";
import { SerializationOptions, serialize } from "../serialization/serializer.js";

/** Base of the stage results: `successful` is derived from `error`. */
abstract class OperationResult {
  abstract readonly error: IError;

  get successful(): boolean {
    return this.error.isSuccess();
  }
}

export class ValidationResult extends OperationResult implements IValidationResult {
  readonly errors: readonly IError[];

  constructor(errors: readonly IError[]) {
    super();
    this.errors = Object.freeze([...errors]);
  }

  get error(): IError {
    return this.errors[0] ?? Errors.success();
  }
}

export class CleanUpResult extends OperationResult implements ICleanUpResult {
  constructor(
    readonly result: string,
    readonly error: IError = Errors.success(),
  ) {
    super();
  }
}

export class TokenizationResult extends OperationResult implements ITokenizationResult {
  readonly tokens: readonly IToken[];

  constructor(
    tokens: readonly IToken[],
    readonly error: IError = Errors.success(),
  ) {
    super();
    this.tokens = Object.freeze([...tokens]);
  }
}

/** Primitive map: every unique expression of the sequences, by its canonical key (the first node wins). */
export function buildPrimitiveMap(sequences: readonly ISequence[]): ReadonlyMap<string, IExpressionNode> {
  const map = new Map<string, IExpressionNode>();
  for (const sequence of sequences) {
    for (const node of sequence.queue) if (!map.has(node.key)) map.set(node.key, node);
  }
  return map;
}

/** @internal Tokens around the beginning of a sequence, for the warnings of the preparation. */
export interface SequenceStart {
  /** The first token of the sequence. */
  readonly first: IToken;
  /** The separator before the sequence (`\n` or `;`); `undefined` for the first sequence. */
  readonly separator: IToken | undefined;
  /** The last token of the previous sequence. */
  readonly previousLast: IToken | undefined;
  /** Line of the first token. */
  readonly line: number;
}

export class ParsingResult extends OperationResult implements IParsingResult {
  readonly sequences: readonly ISequence[];
  readonly primitiveMap: ReadonlyMap<string, IExpressionNode>;
  /** @internal The beginnings of the sequences, in their order; `undefined` if the parser does not record them. */
  readonly starts: readonly SequenceStart[] | undefined;

  constructor(
    sequences: readonly ISequence[],
    readonly error: IError = Errors.success(),
    starts?: readonly SequenceStart[],
  ) {
    super();
    this.sequences = Object.freeze([...sequences]);
    this.primitiveMap = buildPrimitiveMap(this.sequences);
    this.starts = starts;
  }

  static failed(error: IError): ParsingResult {
    return new ParsingResult([], error);
  }
}

export class EvaluationResult extends OperationResult implements IEvaluationResult {
  constructor(
    readonly value: IValue,
    readonly error: IError = Errors.success(),
  ) {
    super();
  }
}

/**
 * A prepared formula (docs/semantics/execution.md, "Execution modes"): the parsed sequences, the metadata and the
 * warnings of the preparation. A hot execution evaluates it without preparing the formula again
 * (`Executor.evaluate`, `Executor.executeIterations`), as long as the functions of the environment do not change.
 */
export class PreparedFormula implements IPreparedFormula {
  readonly warnings: readonly IWarning[];

  /** @internal */
  constructor(
    readonly formula: string,
    readonly parsing: IParsingResult,
    readonly metadata: IValue,
    warnings: readonly IWarning[],
    /** @internal Environment the formula was prepared for. */
    readonly environment: IEnvironment,
    /** @internal Number of the functions of the environment when the formula was prepared. */
    readonly functionCount: number,
  ) {
    this.warnings = Object.freeze([...warnings]);
  }

  get sequences(): readonly ISequence[] {
    return this.parsing.sequences;
  }

  get primitiveMap(): ReadonlyMap<string, IExpressionNode> {
    return this.parsing.primitiveMap;
  }

  get error(): IError {
    return this.parsing.error;
  }

  get successful(): boolean {
    return this.parsing.successful;
  }

  /** Whether the formula can be evaluated in an environment without being prepared again. */
  isPreparedFor(environment: IEnvironment): boolean {
    return environment === this.environment && environment.functions.length === this.functionCount;
  }
}

/** Result of an execution (finalization, docs/semantics/finalization.md). */
export class ExecutionResult extends OperationResult implements IExecutionResult {
  /** The Error that aborted the execution, or `SUCCESS`. */
  readonly error: IError;
  readonly validationErrors: readonly IError[];
  /** Warnings of the preparation of the formula (since `core-1.2`); they never change the result. */
  readonly warnings: readonly IWarning[];

  constructor(
    readonly value: IValue,
    validationErrors: readonly IError[],
    readonly context: IContext,
    warnings: readonly IWarning[] = NO_WARNINGS,
  ) {
    super();
    this.validationErrors = Object.freeze([...validationErrors]);
    this.warnings = warnings.length === 0 ? NO_WARNINGS : Object.freeze([...warnings]);
    const raw = value.raw as IError | undefined;
    this.error = value.type.base === TypeNames.Error && raw !== undefined && raw.isFailed() ? raw : Errors.success();
  }

  /** The result serialized with the serialization variables of the execution (e.g. `@decimal_place`). */
  override toString(): string {
    return serialize(this.value, SerializationOptions.fromContext(this.context));
  }
}

/** Results of the iterations of an Iteration Context. */
export class IterationExecutionResult {
  readonly results: readonly ExecutionResult[];

  constructor(results: readonly ExecutionResult[]) {
    this.results = Object.freeze([...results]);
  }

  get values(): readonly IValue[] {
    return this.results.map((result) => result.value);
  }

  /** The Error of the first failed iteration, or `SUCCESS`. */
  get error(): IError {
    return this.results.find((result) => !result.successful)?.error ?? Errors.success();
  }

  get successful(): boolean {
    return this.error.isSuccess();
  }
}
