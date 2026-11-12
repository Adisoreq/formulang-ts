import type { IError, IValue } from "../../abstractions/primitives.js";
import type {
  ICleanUpResult,
  IEvaluationResult,
  IExecutionResult,
  IExpressionNode,
  IParsingResult,
  ISequence,
  IToken,
  ITokenizationResult,
  IValidationResult,
} from "../../abstractions/processing.js";
import type { IContext } from "../../abstractions/structures.js";
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

export class ParsingResult extends OperationResult implements IParsingResult {
  readonly sequences: readonly ISequence[];
  readonly primitiveMap: ReadonlyMap<string, IExpressionNode>;

  constructor(
    sequences: readonly ISequence[],
    readonly error: IError = Errors.success(),
  ) {
    super();
    this.sequences = Object.freeze([...sequences]);
    this.primitiveMap = buildPrimitiveMap(this.sequences);
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

/** Result of an execution (finalization, docs/semantics/finalization.md). */
export class ExecutionResult extends OperationResult implements IExecutionResult {
  /** The Error that aborted the execution, or `SUCCESS`. */
  readonly error: IError;
  readonly validationErrors: readonly IError[];

  constructor(
    readonly value: IValue,
    validationErrors: readonly IError[],
    readonly context: IContext,
  ) {
    super();
    this.validationErrors = Object.freeze([...validationErrors]);
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
