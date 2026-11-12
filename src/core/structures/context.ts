import type { IObject, IValue } from "../../abstractions/primitives.js";
import { ContainerType } from "../../abstractions/primitives.js";
import type { IContext, IEnvironment } from "../../abstractions/structures.js";
import { ContextType } from "../../abstractions/structures.js";
import { ComputedConstant } from "../primitives/containers.js";
import { FlObject } from "../primitives/object.js";
import { Types } from "../primitives/types.js";
import { Value } from "../primitives/value.js";
import { arrayIndexing } from "./context-variables.js";

/**
 * Default Context of the Core standard (docs/core/context.md). The context stores the context (`$`) variables,
 * the context constants and the copies of the environment (`@`) variables.
 *
 * A context type with its own data derives from `Context` and loads its constants in {@link loadContextData},
 * which runs once, before the first execution. The host chooses the context type; a formula cannot select it.
 */
export class Context extends FlObject implements IContext {
  readonly #environmentVariables = new FlObject();
  #contextDataLoaded = false;

  protected constructor(
    readonly environment: IEnvironment,
    readonly contextType: ContextType = ContextType.Disposable,
  ) {
    super();
  }

  /** A new context with the environment variables copied (pre-execution). */
  static create(environment: IEnvironment, contextType: ContextType = ContextType.Disposable): Context {
    const context = new Context(environment, contextType);
    context.preExecute();
    return context;
  }

  get environmentVariables(): IObject {
    return this.#environmentVariables;
  }

  /**
   * Pre-execution (docs/semantics/pre-execution.md): loads the context data once, then copies the environment
   * variables that the context does not have yet. The environment itself is never changed.
   */
  preExecute(): void {
    this.loadOnce();
    for (const key of this.environment.keys) {
      const container = this.environment.getProperty(key);
      if (container?.containerType === ContainerType.Variable && !this.#environmentVariables.hasKey(key)) {
        this.#environmentVariables.initVariable(key, container.getValue());
      }
    }
  }

  /** Loads the constants of the context type (pre-execution, step 2). Runs once per context. */
  protected loadContextData(): void {}

  /** Runs {@link loadContextData} if it has not run yet. */
  protected loadOnce(): void {
    if (this.#contextDataLoaded) return;
    this.#contextDataLoaded = true;
    this.loadContextData();
  }

  /** Removes every context variable and every copy of an environment variable; constants stay. */
  protected clearVariables(): void {
    for (const key of this.keys) {
      if (this.getProperty(key)?.containerType === ContainerType.Variable) this.removeProperty(key);
    }
    for (const key of this.#environmentVariables.keys) this.#environmentVariables.removeProperty(key);
  }

  /** The value of an environment variable in this context, or `undefined` if it is not defined. */
  getEnvironmentVariable(name: string): IValue | undefined {
    return this.#environmentVariables.getProperty(name)?.getValue();
  }
}

/**
 * Iteration Context of the Core standard (docs/core/context.md, "Iteration context"): a formula executed once
 * per iteration, with the constants `I` (current index, following `@array_indexing`), `N` (number of iterations)
 * and `PREV` (result of the previous iteration). Every iteration starts without context variables.
 * Run it with `Executor.executeIterations`.
 */
export class IterationContext extends Context {
  static readonly iterationConstant = "I";
  static readonly countConstant = "N";
  static readonly previousConstant = "PREV";

  #iteration = 0;
  #previous: IValue = Value.null(IterationContext.previousConstant);

  /** @throws {RangeError} if the count is negative or not whole. */
  protected constructor(
    environment: IEnvironment,
    readonly count: number,
  ) {
    super(environment, ContextType.Persistent);
    if (!Number.isInteger(count) || count < 0)
      throw new RangeError("The number of iterations must be a whole number ≥ 0.");
  }

  /**
   * A new Iteration Context with `count` iterations. (The parameter also accepts a {@link ContextType} only to stay
   * compatible with `Context.create`; an Iteration Context is always persistent.)
   *
   * @throws {TypeError} if `count` is not a number.
   */
  static override create(environment: IEnvironment, count: number | ContextType = 0): IterationContext {
    if (typeof count !== "number") throw new TypeError("The number of iterations must be a number.");
    const context = new IterationContext(environment, count);
    context.preExecute();
    return context;
  }

  /** Zero-based index of the current iteration. */
  get iteration(): number {
    return this.#iteration;
  }

  /** Result of the previous iteration; `null` for the first one. */
  get previous(): IValue {
    return this.#previous;
  }

  protected override loadContextData(): void {
    this.setConstant(IterationContext.countConstant, Value.number(this.count, IterationContext.countConstant));
    this.setContainer(
      new ComputedConstant(IterationContext.iterationConstant, Types.Number, () =>
        Value.number(this.#iteration + arrayIndexing(this), IterationContext.iterationConstant),
      ),
    );
    this.setConstant(IterationContext.previousConstant, this.#previous);
  }

  /**
   * Prepares an iteration: removes the variables of the previous one, sets `I` and `PREV`, and copies the
   * environment variables again. An Error result of the previous iteration becomes `null` in `PREV`.
   *
   * @throws {RangeError} if the iteration is out of range.
   */
  beginIteration(iteration: number, previous?: IValue): void {
    if (!Number.isInteger(iteration) || iteration < 0 || iteration >= Math.max(this.count, 1)) {
      throw new RangeError(`Iteration ${iteration} is out of range.`);
    }
    this.loadOnce();
    this.clearVariables();
    this.#iteration = iteration;
    this.#previous =
      previous === undefined || previous.type.base === Types.Error.base
        ? Value.null(IterationContext.previousConstant)
        : previous;
    this.setConstant(IterationContext.previousConstant, this.#previous);
    this.preExecute();
  }
}
