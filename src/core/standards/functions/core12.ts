/**
 * Functions added in `core-1.2`: `RECALL` (memory of the context), and the `AND` / `OR` with many arguments and a
 * short circuit.
 *
 * @module
 */
import type { IValue } from "../../../abstractions/primitives.js";
import { FunctionType } from "../../../abstractions/primitives.js";
import type { IContext } from "../../../abstractions/structures.js";
import { FlFunction } from "../../functions/function.js";
import { TypeNames, Types } from "../../primitives/types.js";
import { ArgumentTemplate } from "../../functions/argument-template.js";
import { isMemory, memoryOf } from "../procedures.js";
import { Value } from "../../primitives/value.js";
import { B, bool, booleanArg, fn, overload, textArg, txt } from "../helpers.js";

/** `RECALL(key, fallback)`: docs/standards/core/functions/RECALL.md */
function recall(key: string, fallback: IValue, context: IContext): IValue {
  const memory = memoryOf(context, "RECALL");
  if (!isMemory(memory)) return memory;
  return memory.recall(key) ?? fallback;
}

/**
 * `AND` and `OR` (docs/standards/core/functions/AND.md, "Short circuit"): the arguments are checked from the left,
 * and the first `false` (`AND`) or `true` (`OR`) decides the result. An Error before the deciding argument is
 * returned; the arguments after it are not used, so an Error or a value that is not a Boolean there is discarded.
 * Without a deciding argument the overloads apply as for every function.
 */
class ShortCircuitFunction extends FlFunction {
  constructor(
    name: string,
    private readonly deciding: boolean,
    operation: (values: readonly boolean[]) => boolean,
  ) {
    super(
      name,
      [
        overload((a) => B(operation([bool(a[0]), bool(a[1])])), booleanArg("a"), booleanArg("b")),
        // At least 2 arguments; with exactly 2 the first overload matches
        overload(
          (a) => B(operation(a.map((value) => bool(value)))),
          booleanArg("a"),
          ArgumentTemplate.of("values", Types.Boolean, { multiple: true }),
        ),
      ],
      FunctionType.Function,
      { sideEffectFree: true },
    );
  }

  override invoke(parameters: readonly IValue[], context: IContext): IValue {
    // With one argument no overload matches and nothing is decided
    if (parameters.length >= 2) {
      for (const parameter of parameters) {
        const base = parameter.type.base;
        if (base === TypeNames.Error) return parameter;
        if (base === TypeNames.Boolean && parameter.raw === this.deciding) return B(this.deciding);
      }
    }
    return super.invoke(parameters, context);
  }
}

export const shortCircuitFunctions = (): FlFunction[] => [
  new ShortCircuitFunction("AND", false, (values) => values.every((value) => value)),
  new ShortCircuitFunction("OR", true, (values) => values.some((value) => value)),
];

export const core12Functions = (): FlFunction[] => [
  // RECALL reads the memory as it was at the start of the iteration, so it is not a side effect
  fn(
    "RECALL",
    overload(
      (a, c) => recall(txt(a[0]), a[1] ?? Value.null(), c),
      textArg("key"),
      ArgumentTemplate.any("fallback", { optional: true }),
    ),
  ),
];
