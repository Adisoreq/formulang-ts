import type { IError, IValue } from "../../abstractions/primitives.js";
import type {
  ICleaner,
  ICleanUpResult,
  IEvaluator,
  IParser,
  IParsingResult,
  IPreparedFormula,
  IToken,
  ITokenizer,
  IValidator,
} from "../../abstractions/processing.js";
import type { IContext, IEnvironment } from "../../abstractions/structures.js";
import { FlObject } from "../primitives/object.js";
import { isFailure, Value } from "../primitives/value.js";
import { Context, type IterationContext, type TimeContext } from "../structures/context.js";
import { ContextMemory } from "../structures/memory.js";
import { Cleaner, type CleanUpPositions } from "./cleaner.js";
import { Evaluator } from "./evaluator.js";
import { FrameRunner } from "./frame-runner.js";
import { MetadataResult, readMetadata } from "./metadata.js";
import { Parser } from "./parser.js";
import { ExecutionResult, IterationExecutionResult, PreparedFormula } from "./results.js";
import { Token, Tokenizer } from "./tokenizer.js";
import { Validator } from "./validator.js";
import { metadataWarnings, sequenceWarnings, sortWarnings } from "./warnings.js";

function isContext(target: IEnvironment | IContext): target is IContext {
  return "environmentVariables" in target && typeof (target as IContext).preExecute === "function";
}

/** Parser of an environment, kept while the environment has the same functions. */
interface CachedParser {
  readonly functionCount: number;
  readonly parser: IParser;
}

/** A formula text, or a formula prepared by {@link Executor.prepare}. */
export type FormulaSource = string | IPreparedFormula;

/**
 * Runs the whole execution (docs/semantics/execution.md): pre-execution, validation, metadata reading, clean-up,
 * tokenization, parsing, evaluation and finalization. The pipeline stops at the first stage that fails.
 *
 * The steps up to the parsing are the **preparation** ({@link prepare}), which gives a prepared formula; a **hot
 * execution** evaluates a prepared formula again without preparing it ({@link evaluate}, and every iteration of
 * {@link executeIterations}). It gives the same result as a cold execution.
 *
 * Every stage can be replaced (`withValidator`, `withCleaner`, ...). Without a parser of its own the executor
 * uses a {@link Parser} for the environment of the execution.
 */
export class Executor {
  #validator: IValidator | undefined = new Validator();
  #cleaner: ICleaner = new Cleaner();
  #tokenizer: ITokenizer = new Tokenizer();
  #parser: IParser | undefined;
  #evaluator: IEvaluator = new Evaluator();
  readonly #parsers = new WeakMap<IEnvironment, CachedParser>();
  // Contexts whose environment was checked before their first hot execution
  readonly #checkedContexts = new WeakSet<IContext>();

  static create(): Executor {
    return new Executor();
  }

  /** Replaces the validator; `undefined` skips validation. */
  withValidator(validator: IValidator | undefined): this {
    this.#validator = validator;
    return this;
  }

  withCleaner(cleaner: ICleaner): this {
    this.#cleaner = cleaner;
    return this;
  }

  withTokenizer(tokenizer: ITokenizer): this {
    this.#tokenizer = tokenizer;
    return this;
  }

  /** Replaces the parser; `undefined` uses a parser for the environment of each execution. */
  withParser(parser: IParser | undefined): this {
    this.#parser = parser;
    return this;
  }

  withEvaluator(evaluator: IEvaluator): this {
    this.#evaluator = evaluator;
    return this;
  }

  /**
   * Executes a formula (a cold execution). With an environment, the formula runs in a new disposable Default
   * Context; with a context, it runs in that context (e.g. a persistent one, which keeps its variables for the next
   * execution). The result has the warnings of the preparation.
   */
  execute(formula: string, target: IEnvironment | IContext): ExecutionResult {
    const context = isContext(target) ? target : Context.create(target);
    context.preExecute();
    const prepared = this.prepare(formula, context);
    return prepared instanceof ExecutionResult ? prepared : this.#evaluate(prepared, context, prepared.warnings);
  }

  /**
   * Evaluates a prepared formula in a context (a hot execution): the evaluation and the finalization, after the
   * pre-execution of the context. The checks of the environment are done once for every context; a formula that was
   * prepared for another environment, or before the functions of the environment changed, is prepared again.
   */
  evaluate(formula: IPreparedFormula, context: IContext): ExecutionResult {
    context.preExecute();
    const prepared = this.#preparedFor(formula, context);
    return prepared instanceof ExecutionResult ? prepared : this.#evaluate(prepared, context);
  }

  /**
   * Executes a formula once per iteration of an Iteration Context. The formula is prepared (validated, cleaned
   * up, tokenized and parsed) once; a formula that does not parse fails once. By default the iterations stop at
   * the first Error; with `stopOnError = false` the next iteration gets `null` as `PREV` (conformance I14).
   *
   * The first iteration starts with an empty `HISTORY` and an empty memory.
   */
  executeIterations(formula: FormulaSource, context: IterationContext, stopOnError = true): IterationExecutionResult {
    if (context.count === 0) return new IterationExecutionResult([]);
    context.beginIteration(0);
    const prepared = this.#preparedFor(formula, context);
    if (prepared instanceof ExecutionResult) return new IterationExecutionResult([prepared]);
    return this.#iterate(prepared, context, 0, stopOnError);
  }

  /**
   * Continues the iterations of a context after the last iteration executed by {@link executeIterations} or by
   * this method (docs/core/context.md, "Resumed iterations"), e.g. after the host application added elements to the
   * collection (`IterationContext.extend`, `StockContext.appendCandles`). `PREV`, `HISTORY` and the memory of the
   * executed iterations are kept, so the results are the same as when all the iterations are executed again. Without
   * executed iterations it is {@link executeIterations}.
   *
   * @returns The results of the resumed iterations only.
   */
  resumeIterations(formula: FormulaSource, context: IterationContext, stopOnError = true): IterationExecutionResult {
    const start = context.completedIterations;
    if (start === 0) return this.executeIterations(formula, context, stopOnError);
    if (start >= context.count) return new IterationExecutionResult([]);
    const prepared = this.#preparedFor(formula, context);
    if (prepared instanceof ExecutionResult) return new IterationExecutionResult([prepared]);
    return this.#iterate(prepared, context, start, stopOnError);
  }

  #iterate(
    prepared: IParsingResult,
    context: IterationContext,
    start: number,
    stopOnError: boolean,
  ): IterationExecutionResult {
    const results: ExecutionResult[] = [];
    let previous: IValue | undefined = start === 0 ? undefined : context.lastResult;
    for (let i = start; i < context.count; i++) {
      if (i > 0) context.beginIteration(i, previous);
      const result = this.#evaluate(prepared, context);
      context.completeIteration(result.value);
      results.push(result);
      if (!result.successful && stopOnError) break;
      previous = result.value;
    }
    return new IterationExecutionResult(results);
  }

  /**
   * Prepares the execution of a formula in the frames of a Time Context (docs/core/context.md, "Time Context").
   * The formula is validated, cleaned up, tokenized and parsed only once; every `FrameRunner.nextFrame` executes
   * one frame.
   */
  createFrameRunner(formula: FormulaSource, context: TimeContext): FrameRunner {
    context.beginFrame(0, 0, 0);
    const prepared = this.#preparedFor(formula, context);
    return prepared instanceof ExecutionResult
      ? new FrameRunner((parsing, c) => this.#evaluate(parsing, c), context, undefined, prepared)
      : new FrameRunner((parsing, c) => this.#evaluate(parsing, c), context, prepared, undefined);
  }

  /**
   * Executes the formula once for every frame (time and delta in seconds, optional `NOW` in milliseconds). The
   * formula is parsed only once. By default the frames stop at the first Error; with `stopOnError = false` every
   * frame is executed.
   */
  executeFrames(
    formula: FormulaSource,
    context: TimeContext,
    frames: Iterable<{ readonly timeSeconds: number; readonly deltaSeconds: number; readonly now?: number }>,
    stopOnError = true,
  ): IterationExecutionResult {
    const runner = this.createFrameRunner(formula, context);
    const results: ExecutionResult[] = [];
    for (const frame of frames) {
      const result = runner.nextFrame(frame.timeSeconds, frame.deltaSeconds, frame.now);
      results.push(result);
      if (runner.preparationError !== undefined || (!result.successful && stopOnError)) break;
    }
    return new IterationExecutionResult(results);
  }

  /**
   * The preparation (docs/semantics/execution.md, "Execution modes"): validation, metadata reading, clean-up,
   * tokenization and parsing. Returns the prepared formula, with its metadata and warnings, or the failed result of
   * the stage that stopped. A prepared formula can be evaluated many times with {@link evaluate}.
   */
  prepare(formula: string, context: IContext): PreparedFormula | ExecutionResult {
    const environment = context.environment;
    // 1. Validation
    if (this.#validator !== undefined) {
      const validation = this.#validator.validate(formula, environment);
      const first = validation.errors[0];
      if (first !== undefined) return new ExecutionResult(Value.error(first, formula), validation.errors, context);
    }
    this.#checkedContexts.add(context);
    // 2. Metadata reading
    const metadata = readMetadata(formula);
    if (!metadata.successful) return fail(metadata.error, formula, context);
    // 3. Clean-up
    let cleanUp: ICleanUpResult;
    let positions: CleanUpPositions | undefined;
    if (this.#cleaner instanceof Cleaner) {
      ({ result: cleanUp, positions } = this.#cleaner.cleanUpWithPositions(metadata.formula));
    } else {
      cleanUp = this.#cleaner.cleanUp(metadata.formula);
    }
    if (!cleanUp.successful) return fail(cleanUp.error, formula, context);
    // 4. Tokenization
    const tokenization = this.#tokenizer.tokenize(cleanUp.result);
    if (!tokenization.successful) return fail(tokenization.error, formula, context);
    const tokens = positions === undefined ? tokenization.tokens : originalPositions(tokenization.tokens, positions);
    // 5. Parsing
    const parsing = this.#parserFor(environment).parse(tokens);
    if (!parsing.successful) return fail(parsing.error, formula, context);
    // Warnings
    const warnings = sequenceWarnings(parsing, environment);
    if (metadata.position !== undefined)
      warnings.push(...metadataWarnings(metadata.metadata, metadata.position, context));
    return new PreparedFormula(
      formula,
      parsing,
      metadata.metadata,
      sortWarnings(warnings),
      environment,
      environment.functions.length,
    );
  }

  /**
   * The validation and the metadata reading only (docs/core/metadata.md, "Metadata reading"), e.g. to show the
   * parameters of a formula in an editor. Without an environment only the metadata reading is done.
   */
  readMetadata(formula: string, environment?: IEnvironment): MetadataResult {
    if (this.#validator !== undefined && environment !== undefined) {
      const first = this.#validator.validate(formula, environment).errors[0];
      if (first !== undefined) return new MetadataResult(Value.object(new FlObject()), formula, undefined, first);
    }
    return readMetadata(formula);
  }

  /**
   * The prepared formula for the context: the given one (after the checks of the environment, once for every
   * context), or a new one if it was prepared for another environment.
   */
  #preparedFor(formula: FormulaSource, context: IContext): IParsingResult | ExecutionResult {
    if (typeof formula === "string") return this.prepare(formula, context);
    if (formula instanceof PreparedFormula && !formula.isPreparedFor(context.environment)) {
      return this.prepare(formula.formula, context);
    }
    if (!this.#checkedContexts.has(context)) {
      const validator = this.#validator;
      if (validator instanceof Validator) {
        const validation = validator.validateEnvironment(context.environment);
        const first = validation.errors[0];
        if (first !== undefined) {
          return new ExecutionResult(Value.error(first, formula.formula), validation.errors, context);
        }
      } else if (validator !== undefined) {
        return this.prepare(formula.formula, context);
      }
      this.#checkedContexts.add(context);
    }
    return formula;
  }

  #parserFor(environment: IEnvironment): IParser {
    if (this.#parser !== undefined) return this.#parser;
    const functionCount = environment.functions.length;
    const cached = this.#parsers.get(environment);
    if (cached !== undefined && cached.functionCount === functionCount) return cached.parser;
    const parser = Parser.forEnvironment(environment);
    this.#parsers.set(environment, { functionCount, parser });
    return parser;
  }

  // 6. Evaluation and 7. finalization; the writes to the memory are applied if the result is not an Error
  #evaluate(parsing: IParsingResult, context: IContext, warnings?: PreparedFormula["warnings"]): ExecutionResult {
    let value = this.#evaluator.evaluate(parsing, context).value;
    if (context instanceof Context) value = context.finalizeResult(value);
    const memory = context.memory;
    if (memory instanceof ContextMemory) {
      if (isFailure(value)) memory.rollback();
      else memory.commit();
    }
    return new ExecutionResult(value, [], context, warnings);
  }
}

function fail(error: IError, formula: string, context: IContext): ExecutionResult {
  return new ExecutionResult(Value.error(error, formula), [], context);
}

/** The tokens with the positions of their first characters in the original formula. */
function originalPositions(tokens: readonly IToken[], positions: CleanUpPositions): IToken[] {
  return tokens.map((token) => {
    if (token.line === undefined || token.column === undefined) return token;
    const position = positions.at(token.line, token.column);
    return position === undefined ? token : new Token(token.type, token.value, position.line, position.column);
  });
}
