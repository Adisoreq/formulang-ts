import type { ExecutionResult, FrameRunner } from "formulang-ts";

/** A frame executed by a {@link TimeSession}. */
export interface FrameRecord {
  /** Zero-based index of the frame (`FRAME` is this value plus `@array_indexing`). */
  readonly frame: number;
  /** `TIME_S` of the frame. */
  readonly timeSeconds: number;
  /** `DTIME_S` of the frame. */
  readonly deltaSeconds: number;
  readonly result: ExecutionResult;
}

/**
 * Frames of a formula in a Time Context (docs/core/context.md, "Time Context"). The formula is parsed once; every
 * {@link advance} executes the next frame. The preview decides when the frames start and stop: it plays them with a
 * timer and stops at the first frame that results in an Error.
 */
export class TimeSession {
  /** Number of the last frames kept for the output. */
  static readonly historyLimit = 240;

  readonly #runner: FrameRunner;
  readonly #frames: FrameRecord[] = [];

  constructor(runner: FrameRunner) {
    this.#runner = runner;
  }

  /** The failed result of the validation, clean-up, tokenization or parsing; `undefined` if the formula is ready. */
  get preparationError(): ExecutionResult | undefined {
    return this.#runner.preparationError;
  }

  /** The last {@link TimeSession.historyLimit} frames, oldest first. */
  get frames(): readonly FrameRecord[] {
    return this.#frames;
  }

  get last(): FrameRecord | undefined {
    return this.#frames.at(-1);
  }

  /** `TIME_S` of the last frame; 0 before the first one. */
  get timeSeconds(): number {
    return this.last?.timeSeconds ?? 0;
  }

  /** Number of executed frames (also those no longer in {@link frames}). */
  get frameCount(): number {
    return this.#runner.frameCount;
  }

  /** The formula cannot be executed, or the last frame resulted in an Error. */
  get failed(): boolean {
    return this.preparationError !== undefined || this.last?.result.successful === false;
  }

  /**
   * Executes the next frame, `deltaSeconds` after the previous one. The first frame starts at `TIME_S` = 0 with
   * `DTIME_S` = 0, whatever the delta.
   */
  advance(deltaSeconds: number): FrameRecord {
    const first = this.#runner.frameCount === 0;
    const delta = first ? 0 : Math.max(deltaSeconds, 0);
    const time = first ? 0 : this.timeSeconds + delta;
    const frame = this.#runner.frameCount;
    const result = this.#runner.nextFrame(time, delta);
    const record: FrameRecord = { frame, timeSeconds: time, deltaSeconds: delta, result };
    this.#frames.push(record);
    if (this.#frames.length > TimeSession.historyLimit) this.#frames.shift();
    return record;
  }

  /** Starts again from the first frame. */
  reset(): void {
    this.#runner.reset();
    this.#frames.length = 0;
  }
}
