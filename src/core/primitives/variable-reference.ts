import type { IValue } from "../../abstractions/primitives.js";
import { VariableScope } from "../../abstractions/processing.js";
import { Types } from "./types.js";
import { Value } from "./value.js";

/** Reference to a variable: the first argument of `SET`, `INIT` and `COND_SET`, which receive the variable itself. */
export class VariableReference {
  constructor(
    readonly scope: VariableScope,
    readonly name: string,
  ) {
    Object.freeze(this);
  }

  get sigil(): "$" | "@" {
    return this.scope === VariableScope.Context ? "$" : "@";
  }

  /** `$name` or `@name` */
  toString(): string {
    return this.sigil + this.name;
  }

  /** The reference as a value of the pseudo-type `Variable`. */
  toValue(): IValue {
    return new Value(this, Types.Variable, this.toString());
  }
}
