import type { IObject, IValue } from "../../abstractions/primitives.js";
import { ContainerType } from "../../abstractions/primitives.js";
import type { IContext, IEnvironment } from "../../abstractions/structures.js";
import { ContextType } from "../../abstractions/structures.js";
import { ComputedConstant, Constant, Variable } from "../primitives/containers.js";
import { FlObject } from "../primitives/object.js";
import { Types } from "../primitives/types.js";
import { Value } from "../primitives/value.js";
import { arrayIndexing, EnvironmentConstants } from "./context-variables.js";
import { Environment, nowValue } from "./environment.js";

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
    // Step 2: NOW is set once for the whole execution
    if (this.refreshesNowOnPreExecute || !this.hasKey(EnvironmentConstants.now)) this.refreshNow();
    for (const key of this.environment.keys) {
      const container = this.environment.getProperty(key);
      if (container?.containerType === ContainerType.Variable && !this.#environmentVariables.hasKey(key)) {
        this.#environmentVariables.initVariable(key, container.getValue());
      }
    }
  }

  /**
   * Whether every {@link preExecute} sets `NOW` to the current time. The Default Context does; the Iteration
   * Context sets it once before the first iteration, the Time Context once for every frame.
   */
  protected get refreshesNowOnPreExecute(): boolean {
    return true;
  }

  /**
   * `NOW` of every execution in this context instead of the clock of the environment, or `undefined`. A context
   * created by a function for its caller (e.g. a child Indicator Context) uses the `NOW` of the caller.
   */
  fixedNow: IValue | undefined;

  /** `NOW` of the current execution, or `undefined` before the first pre-execution. */
  get now(): IValue | undefined {
    return this.getProperty(EnvironmentConstants.now)?.getValue();
  }

  /**
   * Sets the `NOW` constant of the execution (docs/semantics/pre-execution.md, step 2): to `now`, or to the
   * time read with {@link Environment.readNow}. The value is stored in the context, so it does not change while
   * the formula is executed.
   */
  protected refreshNow(now?: IValue): void {
    const value = now ?? this.fixedNow ?? Environment.readNow(this.environment);
    if (value !== undefined) this.setConstant(EnvironmentConstants.now, value);
  }

  /** Loads the constants of the context type (pre-execution, step 2). Runs once per context. */
  protected loadContextData(): void {}

  /** Runs {@link loadContextData} if it has not run yet. */
  protected loadOnce(): void {
    if (this.#contextDataLoaded) return;
    this.#contextDataLoaded = true;
    this.loadContextData();
  }

  /**
   * Removes every context variable and every copy of an environment variable; constants stay.
   *
   * Runs before every iteration or frame, so it avoids work in the common case: a copy of an environment variable
   * that the formula did not change still holds the value of the environment and is kept, and a changed copy gets
   * the value of the environment back. The result is the same as removing every copy and copying them again.
   */
  protected clearVariables(): void {
    for (const key of this.keys) {
      if (this.getProperty(key)?.containerType === ContainerType.Variable) this.removeProperty(key);
    }
    for (const key of this.#environmentVariables.keys) {
      const original = this.environment.getProperty(key);
      if (original?.containerType !== ContainerType.Variable) {
        this.#environmentVariables.removeProperty(key);
      } else if (this.#environmentVariables.getProperty(key)!.getValue() !== original.getValue()) {
        this.#environmentVariables.setContainer(new Variable(key, original.getValue()));
      }
    }
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

  /** `NOW` is set once before the first iteration and is the same in all iterations. */
  protected override get refreshesNowOnPreExecute(): boolean {
    return false;
  }

  protected override loadContextData(): void {
    this.setConstant(IterationContext.countConstant, Value.number(this.count, IterationContext.countConstant));
    this.setContainer(
      new ComputedConstant(IterationContext.iterationConstant, Types.Number, () =>
        Value.number(this.#iteration + arrayIndexing(this), IterationContext.iterationConstant),
      ),
    );
    this.setContainer(
      (this.#previousContainer = new ReplaceableConstant(IterationContext.previousConstant, this.#previous)),
    );
  }

  #previousContainer: ReplaceableConstant | undefined;

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
    this.loadOnce(); // loads the context constants before the first iteration
    this.clearVariables();
    if (iteration === 0) this.refreshNow();
    this.#iteration = iteration;
    this.#previous =
      previous === undefined || previous.type.base === Types.Error.base
        ? Value.null(IterationContext.previousConstant)
        : previous;
    // The container of PREV is reused; a new constant only if the property was replaced from outside
    if (
      this.#previousContainer !== undefined &&
      this.getProperty(IterationContext.previousConstant) === this.#previousContainer
    ) {
      this.#previousContainer.replace(this.#previous);
    } else {
      this.setConstant(IterationContext.previousConstant, this.#previous);
    }
    this.preExecute();
  }
}

/** Constant whose value the host side replaces between executions (`PREV`); a formula still cannot change it. */
class ReplaceableConstant extends Constant {
  replace(value: IValue): void {
    this.store(value);
  }
}

/**
 * Time Context of the Core standard (docs/core/context.md, "Time Context"): the host application executes the same
 * formula repeatedly as time passes, once for every **frame** (an animation frame, a simulation step, a real-time
 * measurement). Constants: `TIME_S`, `TIME_MS`, `DTIME_S`, `DTIME_MS`, `FRAME` (follows `@array_indexing`) and
 * `PREV` (result of the previous frame).
 *
 * Run the frames with `Executor.createFrameRunner` (the formula is parsed once), or call {@link beginFrame} before
 * every execution. Every frame starts with no context variables and with the environment variables of the
 * environment; the only state passed from one frame to the next is `PREV`. `NOW` is set again for every frame.
 */
export class TimeContext extends Context {
  static readonly timeSecondsConstant = "TIME_S";
  static readonly timeMillisecondsConstant = "TIME_MS";
  static readonly deltaSecondsConstant = "DTIME_S";
  static readonly deltaMillisecondsConstant = "DTIME_MS";
  static readonly frameConstant = "FRAME";
  static readonly previousConstant = "PREV";

  #frame = 0;
  #timeSeconds = 0;
  #deltaSeconds = 0;
  #previous: IValue = Value.null(TimeContext.previousConstant);

  protected constructor(environment: IEnvironment) {
    super(environment, ContextType.Persistent);
  }

  /** A new Time Context positioned at the first frame (`TIME_S` = 0). */
  static override create(environment: IEnvironment): TimeContext {
    const context = new TimeContext(environment);
    context.preExecute();
    return context;
  }

  /** Zero-based index of the current frame. `FRAME` is this value plus `@array_indexing`. */
  get frame(): number {
    return this.#frame;
  }

  /** Time from the start of the first frame to the start of the current frame, in seconds (`TIME_S`). */
  get timeSeconds(): number {
    return this.#timeSeconds;
  }

  /** Time from the start of the previous frame to the start of the current frame, in seconds (`DTIME_S`). */
  get deltaSeconds(): number {
    return this.#deltaSeconds;
  }

  /** Result of the previous frame (`PREV`); `null` in the first frame. */
  get previous(): IValue {
    return this.#previous;
  }

  /** `NOW` is set by {@link beginFrame}, once for every frame. */
  protected override get refreshesNowOnPreExecute(): boolean {
    return false;
  }

  protected override loadContextData(): void {
    this.#setTimeConstants();
    this.setContainer(
      new ComputedConstant(TimeContext.frameConstant, Types.Number, () =>
        Value.number(this.#frame + arrayIndexing(this), TimeContext.frameConstant),
      ),
    );
    this.setConstant(TimeContext.previousConstant, this.#previous);
  }

  /**
   * Prepares the frame with the zero-based `frame` index: removes the context variables and the overridden
   * environment variables, sets the time constants, `PREV` and `NOW`, and runs the pre-execution.
   *
   * @param timeSeconds Total time from the start of the first frame, in seconds. Never decreases.
   * @param deltaSeconds Time from the start of the previous frame, in seconds. Never negative.
   * @param previous Result of the previous frame; `undefined` (or an Error) is stored as `null`.
   * @param now `NOW` of the frame (Unix time in milliseconds, UTC), or `undefined` to read the clock of the
   * environment.
   * @throws {RangeError} for a negative frame, time or delta, or a time that decreases.
   */
  beginFrame(frame: number, timeSeconds: number, deltaSeconds: number, previous?: IValue, now?: number): void {
    if (!Number.isInteger(frame) || frame < 0) throw new RangeError("The frame must be a whole number >= 0.");
    if (!(timeSeconds >= 0)) throw new RangeError("The time of a frame must not be negative.");
    if (!(deltaSeconds >= 0)) throw new RangeError("The delta time of a frame must not be negative.");
    if (frame > 0 && timeSeconds < this.#timeSeconds) throw new RangeError("The time of a frame never decreases.");

    this.loadOnce(); // loads the context constants before the first frame
    this.clearVariables();

    this.#frame = frame;
    this.#timeSeconds = timeSeconds;
    this.#deltaSeconds = deltaSeconds;
    this.#previous =
      previous === undefined || previous.type.base === Types.Error.base
        ? Value.null(TimeContext.previousConstant)
        : previous;

    this.#setTimeConstants();
    this.setConstant(TimeContext.previousConstant, this.#previous);
    this.refreshNow(now === undefined ? undefined : nowValue(now));

    this.preExecute();
  }

  #setTimeConstants(): void {
    const set = (name: string, value: number): void => this.setConstant(name, Value.number(value, name));
    set(TimeContext.timeSecondsConstant, this.#timeSeconds);
    set(TimeContext.timeMillisecondsConstant, this.#timeSeconds * 1000);
    set(TimeContext.deltaSecondsConstant, this.#deltaSeconds);
    set(TimeContext.deltaMillisecondsConstant, this.#deltaSeconds * 1000);
  }
}
