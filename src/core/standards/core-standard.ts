import type { IFunction } from "../../abstractions/functions.js";
import type { IAbstractTree, IStandard, IStandardVersion } from "../../abstractions/structures.js";
import type { FlFunction, Procedure } from "../functions/function.js";
import { TypeNames } from "../primitives/types.js";
import { AbstractTree } from "../structures/abstract-tree.js";
import { StandardVersion } from "../structures/standard.js";
import { arithmeticFunctions } from "./functions/arithmetic.js";
import { collectionFunctions } from "./functions/collections.js";
import {
  conversionFunctions,
  objectFunctions,
  objectLiteralFunctions,
  trigonometricFunctions,
  typeFunctions,
} from "./functions/conversion.js";
import { controlFunctions, logicFunctions } from "./functions/logic.js";
import { textFunctions } from "./functions/text.js";
import { timeFunctions } from "./functions/time.js";
import { coreProcedures } from "./procedures.js";

/** Named functions of the Core standard, in the order of its function index. */
export const CoreFunctions: readonly FlFunction[] = Object.freeze([
  ...arithmeticFunctions(),
  ...logicFunctions(),
  ...controlFunctions(),
  ...textFunctions(),
  ...collectionFunctions(),
  ...typeFunctions(),
  ...conversionFunctions(),
  ...trigonometricFunctions(),
  ...objectFunctions(),
  ...timeFunctions(),
  ...objectLiteralFunctions(),
]);

/** Procedures of the Core standard: `SET`, `INIT`, `COND_SET`, `REQUIRE`. */
export const CoreProcedures: readonly Procedure[] = Object.freeze(coreProcedures());

/** The Core standard, `core-1.0` (docs/standards/core/README.md). */
export class CoreStandard implements IStandard {
  /** Identifier of the implemented version. */
  static readonly identifier = "core-1.0";
  static readonly instance = new CoreStandard();

  readonly id = "core";
  readonly name = "Core";
  readonly version: IStandardVersion = new StandardVersion(1, 0);
  readonly extendedTypes: readonly string[] = Object.freeze([]);
  readonly extendedTypeTree: IAbstractTree<string> = new AbstractTree<string>(TypeNames.Object, TypeNames.Object);
  readonly namedFunctions: readonly IFunction[] = Object.freeze([...CoreFunctions, ...CoreProcedures]);

  private constructor() {}
}
