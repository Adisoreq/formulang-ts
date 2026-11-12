import type { IError, IValue } from "../../abstractions/primitives.js";
import type {
  ICleaner,
  IEvaluator,
  IParser,
  IParsingResult,
  ITokenizer,
  IValidator,
} from "../../abstractions/processing.js";
import type { IContext, IEnvironment } from "../../abstractions/structures.js";
import { Value } from "../primitives/value.js";
import { Context, type IterationContext } from "../structures/context.js";
import { Cleaner } from "./cleaner.js";
import { Evaluator } from "./evaluator.js";
import { Parser } from "./parser.js";
import { ExecutionResult, IterationExecutionResult } from "./results.js";
import { Tokenizer } from "./tokenizer.js";
import { Validator } from "./validator.js";

function isContext(target: IEnvironment | IContext): target is IContext {
  return "environmentVariables" in target && typeof (target as IContext).preExecute === "function";
}

/** Parser of an environment, kept while the environment has the same functions. */
interface CachedParser {
  readonly functionCount: number;
  readonly parser: IParser;
}

/**
 * Runs the whole execution (docs/semantics/execution.md): pre-execution, validation, clean-up, tokenization,
 * parsing, evaluation and finalization. The pipeline stops at the first stage that fails.
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
   * Executes a formula. With an environment, the formula runs in a new disposable Default Context; with a
   * context, it runs in that context (e.g. a persistent one, which keeps its variables for the next execution).
   */
  execute(formula: string, target: IEnvironment | IContext): ExecutionResult {
    const context = isContext(target) ? target : Context.create(target);
    context.preExecute();
    const prepared = this.prepare(formula, context);
    return prepared instanceof ExecutionResult ? prepared : this.#evaluate(prepared, context);
  }

  /**
   * Executes a formula once per iteration of an Iteration Context. The formula is prepared (validated, cleaned
   * up, tokenized and parsed) once; a formula that does not parse fails once. By default the iterations stop at
   * the first Error; with `stopOnError = false` the next iteration gets `null` as `PREV` (conformance I14).
   */
  executeIterations(formula: string, context: IterationContext, stopOnError = true): IterationExecutionResult {
    const results: ExecutionResult[] = [];
    if (context.count === 0) return new IterationExecutionResult(results);
    context.beginIteration(0);
    const prepared = this.prepare(formula, context);
    if (prepared instanceof ExecutionResult) return new IterationExecutionResult([prepared]);
    let previous: IValue | undefined;
    for (let i = 0; i < context.count; i++) {
      if (i > 0) context.beginIteration(i, previous);
      const result = this.#evaluate(prepared, context);
      results.push(result);
      if (!result.successful && stopOnError) break;
      previous = result.value;
    }
    return new IterationExecutionResult(results);
  }

  /**
   * Stages 1 to 4: the parsed formula, or the failed result of the stage that stopped. A parsed formula can be
   * evaluated many times, e.g. with `new Evaluator().evaluate(parsed, context)`.
   */
  prepare(formula: string, context: IContext): IParsingResult | ExecutionResult {
    // 1. Validation
    if (this.#validator !== undefined) {
      const validation = this.#validator.validate(formula, context.environment);
      const first = validation.errors[0];
      if (first !== undefined) return new ExecutionResult(Value.error(first, formula), validation.errors, context);
    }
    // 2. Clean-up
    const cleanUp = this.#cleaner.cleanUp(formula);
    if (!cleanUp.successful) return fail(cleanUp.error, formula, context);
    // 3. Tokenization
    const tokenization = this.#tokenizer.tokenize(cleanUp.result);
    if (!tokenization.successful) return fail(tokenization.error, formula, context);
    // 4. Parsing
    const parsing = this.#parserFor(context.environment).parse(tokenization.tokens);
    if (!parsing.successful) return fail(parsing.error, formula, context);
    return parsing;
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

  // 5. Evaluation and 6. finalization
  #evaluate(parsing: IParsingResult, context: IContext): ExecutionResult {
    return new ExecutionResult(this.#evaluator.evaluate(parsing, context).value, [], context);
  }
}

function fail(error: IError, formula: string, context: IContext): ExecutionResult {
  return new ExecutionResult(Value.error(error, formula), [], context);
}
