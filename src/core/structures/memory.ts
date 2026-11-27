import type { IValue } from "../../abstractions/primitives.js";
import type { IMemory } from "../../abstractions/structures.js";

/** A collected write of `STORE` (a value) or `CLEAR` (no value; no key removes every key). */
interface PendingWrite {
  readonly key: string | undefined;
  readonly value: IValue | undefined;
  discarded: boolean;
}

/**
 * Memory of an Iteration or Time Context (docs/core/context.md, "Memory", since `core-1.2`).
 *
 * 1. **Snapshot**: during an iteration the stored values do not change; the writes of `STORE` and `CLEAR` are
 *    collected and applied by {@link commit} after the iteration, in the order in which they were executed.
 * 2. **Selected paths only**: the evaluator discards the writes executed in a branch of `IF` that is not selected,
 *    or in an argument of `AND` / `OR` that does not decide the result.
 * 3. **Errors**: the executor applies the writes only if the iteration did not result in an Error
 *    ({@link rollback} otherwise).
 *
 * The host application may read the stored values ({@link entries}) and restore them ({@link load}), e.g. to
 * [resume the iterations](https://github.com/Adisoreq/FormuLang/blob/main/docs/core/context.md#resumed-iterations)
 * later.
 */
export class ContextMemory implements IMemory {
  readonly #values = new Map<string, IValue>();
  #pending: PendingWrite[] = [];

  get keys(): readonly string[] {
    return [...this.#values.keys()];
  }

  /** Number of stored keys. */
  get size(): number {
    return this.#values.size;
  }

  recall(key: string): IValue | undefined {
    return this.#values.get(key);
  }

  store(key: string, value: IValue): void {
    this.#pending.push({ key, value, discarded: false });
  }

  clear(key?: string): void {
    this.#pending.push({ key, value: undefined, discarded: false });
  }

  /** The stored keys and values, in the order of their first write. */
  entries(): [string, IValue][] {
    return [...this.#values.entries()];
  }

  /** Replaces the stored values (e.g. a state kept by the host application) and drops the collected writes. */
  load(entries: Iterable<readonly [string, IValue]>): void {
    this.reset();
    for (const [key, value] of entries) this.#values.set(key, value);
  }

  /** @internal Number of the writes collected in the current iteration, kept or discarded. */
  get pendingCount(): number {
    return this.#pending.length;
  }

  /** @internal Discards the collected writes from `from` (inclusive) to `to` (exclusive). */
  discard(from: number, to: number): void {
    for (let i = from; i < to && i < this.#pending.length; i++) this.#pending[i]!.discarded = true;
  }

  /** Applies the writes of the iteration that are not discarded, in order; the last write of a key wins. */
  commit(): void {
    for (const write of this.#pending) {
      if (write.discarded) continue;
      if (write.value !== undefined) {
        this.#values.set(write.key!, write.value);
      } else if (write.key === undefined) {
        this.#values.clear();
      } else {
        this.#values.delete(write.key);
      }
    }
    this.#pending = [];
  }

  /** Drops the writes of the iteration (the iteration resulted in an Error). */
  rollback(): void {
    this.#pending = [];
  }

  /** Empties the memory, as before the first iteration. */
  reset(): void {
    this.#values.clear();
    this.#pending = [];
  }
}
