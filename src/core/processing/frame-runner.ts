import type { IValue } from "../../abstractions/primitives.js";
import type { IParsingResult } from "../../abstractions/processing.js";
import type { TimeContext } from "../structures/context.js";
import type { ExecutionResult } from "./results.js";

/** Evaluation of a parsed formula, provided by the executor. @internal */
export type FrameEvaluator = (parsing: IParsingResult, context: TimeContext) => ExecutionResult;

/**
 * Executes a parsed formula frame by frame in a {@link TimeContext}. Created by `Executor.createFrameRunner`; the
 * host application decides when the next frame starts and when the frames stop.
 */
export class FrameRunner {
  readonly #evaluate: FrameEvaluator;
  readonly #parsing: IParsingResult | undefined;
  #previous: IValue | undefined;
  #started = false;
  #frameCount = 0;

  /** @internal */
  constructor(
    evaluate: FrameEvaluator,
    readonly context: TimeContext,
    parsing: IParsingResult | undefined,
    /**
     * The failed result of the validation, clean-up, tokenization or parsing, or `undefined` if the formula is
     * ready. Every frame returns this result when it is set.
     */
    readonly preparationError: ExecutionResult | undefined,
  ) {
    this.#evaluate = evaluate;
    this.#parsing = parsing;
  }

  /** Number of executed frames. */
  get frameCount(): number {
    return this.#frameCount;
  }

  /**
   * Executes the next frame.
   *
   * @param timeSeconds Time from the start of the first frame, in seconds. Never decreases.
   * @param deltaSeconds Time from the start of the previous frame, in seconds; `undefined` to compute it from the
   * previous frame (`0` in the first frame).
   * @param now `NOW` of the frame in milliseconds, or `undefined` to read the clock of the environment.
   */
  nextFrame(timeSeconds: number, deltaSeconds?: number, now?: number): ExecutionResult {
    if (this.preparationError !== undefined) return this.preparationError;
    const delta = deltaSeconds ?? (this.#started ? timeSeconds - this.context.timeSeconds : 0);
    this.context.beginFrame(this.#frameCount, timeSeconds, Math.max(delta, 0), this.#previous, now);
    this.#started = true;
    const result = this.#evaluate(this.#parsing!, this.context);
    this.#frameCount++;
    this.#previous = result.value;
    return result;
  }

  /** Starts again from the first frame: `PREV` is `null` and `FRAME` is the first index. */
  reset(): void {
    this.#frameCount = 0;
    this.#previous = undefined;
    this.#started = false;
  }
}
