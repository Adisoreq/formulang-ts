/**
 * Facade for host applications that work with plain JavaScript values.
 *
 * @module
 */
import type { IFunction } from "../abstractions/functions.js";
import type { IValue } from "../abstractions/primitives.js";
import type { IContext, IStandard } from "../abstractions/structures.js";
import { ContextType } from "../abstractions/structures.js";
import { Executor } from "../core/processing/executor.js";
import type { ExecutionResult } from "../core/processing/results.js";
import { Context } from "../core/structures/context.js";
import { Environment } from "../core/structures/environment.js";
import { FormulaError, type HostFunction, type JsValue, fromJs, hostFunction, toJs } from "./conversion.js";

/** Data of one execution. */
export interface EvaluateOptions {
  /** Context (`$`) variables, e.g. `{ price: 120 }` for `$price`. */
  readonly variables?: Readonly<Record<string, unknown>>;
  /** Context constants, e.g. `{ TAX: 0.23 }`. A formula cannot change them. */
  readonly constants?: Readonly<Record<string, unknown>>;
  /** Overrides of environment (`@`) variables for this execution, e.g. `{ array_indexing: 1 }`. */
  readonly environmentVariables?: Readonly<Record<string, unknown>>;
  /** Runs the formula in this context instead of a new disposable one (e.g. a persistent context). */
  readonly context?: IContext;
}

/** Configuration of an {@link Engine}. */
export interface EngineOptions {
  /** Functions of the host application, by name, e.g. `{ HYPOT: (a, b) => Math.hypot(a, b) }`. */
  readonly functions?: Readonly<Record<string, HostFunction | IFunction>>;
  /** Environment constants, available to every formula. */
  readonly constants?: Readonly<Record<string, unknown>>;
  /** Extension standards to register in the environment. */
  readonly standards?: readonly IStandard[];
  /** Environment to use instead of a new Core environment. */
  readonly environment?: Environment;
  /** Executor to use instead of the default one. */
  readonly executor?: Executor;
}

interface ResultBase {
  /** Result as a FormuLang value. */
  readonly raw: IValue;
  /** Result serialized with the serialization variables of the execution. */
  readonly text: string;
  /** Context of the execution. */
  readonly context: IContext;
  /** Full result of the execution. */
  readonly execution: ExecutionResult;
}

export interface SuccessfulResult extends ResultBase {
  readonly ok: true;
  /** Result as a JavaScript value. */
  readonly value: JsValue;
}

export interface FailedResult extends ResultBase {
  readonly ok: false;
  /** The Error that aborted the execution. */
  readonly error: FormulaError;
  /** Every problem found by validation (empty when the formula failed in a later stage). */
  readonly validationErrors: readonly FormulaError[];
}

/** Result of {@link Engine.evaluate}: a discriminated union on `ok`. */
export type FormulaResult = SuccessfulResult | FailedResult;

/**
 * An environment and an executor configured once and used for many formulas. A formula never changes the
 * environment, so an engine can be shared.
 */
export class Engine {
  readonly environment: Environment;
  readonly executor: Executor;

  constructor(options: EngineOptions = {}) {
    this.environment = options.environment ?? Environment.create();
    this.executor = options.executor ?? Executor.create();
    for (const standard of options.standards ?? []) this.environment.registerStandard(standard);
    for (const [name, fn] of Object.entries(options.functions ?? {})) this.registerFunction(name, fn);
    for (const [name, value] of Object.entries(options.constants ?? {})) {
      this.environment.setConstant(name, fromJs(value));
    }
  }

  /**
   * Adds a function. A JavaScript function receives and returns plain JavaScript values.
   *
   * @throws {Error} if a function with the name is already defined.
   */
  registerFunction(name: string, fn: HostFunction | IFunction): this {
    this.environment.registerFunction(typeof fn === "function" ? hostFunction(name, fn) : fn);
    return this;
  }

  /** A context of this environment, e.g. a persistent one that keeps its variables between executions. */
  createContext(
    contextType: ContextType = ContextType.Persistent,
    options: Omit<EvaluateOptions, "context"> = {},
  ): Context {
    const context = Context.create(this.environment, contextType);
    applyOptions(context, options);
    return context;
  }

  /** Executes a formula. It never throws for a problem of the formula: check `ok` of the result. */
  evaluate(formula: string, options: EvaluateOptions = {}): FormulaResult {
    let context = options.context;
    if (context === undefined) context = this.createContext(ContextType.Disposable, options);
    else applyOptions(context, options);
    return toResult(this.executor.execute(formula, context));
  }
}

function applyOptions(context: IContext, options: Omit<EvaluateOptions, "context">): void {
  context.preExecute();
  for (const [name, value] of Object.entries(options.constants ?? {})) {
    if (context instanceof Context) context.setConstant(name, fromJs(value));
    else context.initConstant(name, fromJs(value));
  }
  for (const [name, value] of Object.entries(options.variables ?? {})) {
    const converted = fromJs(value);
    if (!context.initVariable(name, converted)) {
      const error = context.setProperty(name, converted);
      if (error.isFailed()) throw new TypeError(`Variable "${name}" cannot be set: ${error.message}`);
    }
  }
  for (const [name, value] of Object.entries(options.environmentVariables ?? {})) {
    const error = context.environmentVariables.setProperty(name, fromJs(value));
    if (error.isFailed()) throw new TypeError(`Environment variable "${name}" cannot be set: ${error.message}`);
  }
}

function toResult(execution: ExecutionResult): FormulaResult {
  const base = { raw: execution.value, text: execution.toString(), context: execution.context, execution };
  if (execution.successful) return { ...base, ok: true, value: toJs(execution.value, execution.context) };
  return {
    ...base,
    ok: false,
    error: new FormulaError(execution.error),
    validationErrors: execution.validationErrors.map((error) => new FormulaError(error)),
  };
}

/** Creates an {@link Engine}. */
export function createEngine(options: EngineOptions = {}): Engine {
  return new Engine(options);
}

let defaultEngine: Engine | undefined;

/**
 * Executes a formula in a new Core environment and returns a plain JavaScript result.
 *
 * ```ts
 * evaluate("$a * 2", { variables: { a: 5 } }); // { ok: true, value: 10, text: "10", ... }
 * ```
 *
 * @throws {TypeError} only for invalid `options` (e.g. an environment variable of another type).
 */
export function evaluate(formula: string, options: EvaluateOptions = {}): FormulaResult {
  defaultEngine ??= new Engine();
  return defaultEngine.evaluate(formula, options);
}
