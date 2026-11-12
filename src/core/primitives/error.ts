import type { IError } from "../../abstractions/primitives.js";

/** Immutable {@link IError}. Create the errors of the Core standard with `Errors`. */
export class FlError implements IError {
  constructor(
    readonly code: number,
    readonly name: string,
    readonly message: string,
  ) {
    Object.freeze(this);
  }

  isSuccess(): boolean {
    return this.code === 0;
  }

  isFailed(): boolean {
    return this.code !== 0;
  }

  /** `[NAME (code)] message` */
  toString(): string {
    return `[${this.name} (${this.code})] ${this.message}`;
  }
}
