import type { IFunction } from "../abstractions/functions.js";
import type { IAbstractTree, IEnvironment, IStandard, IStandardVersion } from "../abstractions/structures.js";
import { AbstractTree, type Environment, StandardVersion, TypeNames, satisfies } from "../core/index.js";
import { CANDLE_TYPE } from "./candle.js";
import { INDICATOR_FUNCTION } from "./contexts.js";
import { IndicatorFunction, createCandleFunction } from "./functions.js";
import { IndicatorRegistry } from "./indicators.js";

/** The Stock standard, `stock-0.1` (docs/standards/stock/README.md). */
export class StockStandard implements IStandard {
  /** Identifier of the implemented version. */
  static readonly identifier = "stock-0.1";
  /** Required version of the Core standard. */
  static readonly requiredCore = "core-0.2+";

  readonly id = "stock";
  readonly name = "Stock";
  readonly version: IStandardVersion = new StandardVersion(0, 1);
  readonly extendedTypes: readonly string[] = Object.freeze([CANDLE_TYPE]);
  readonly extendedTypeTree: IAbstractTree<string>;
  readonly namedFunctions: readonly IFunction[];
  /** Indicators available to `INDICATOR`. */
  readonly registry: IndicatorRegistry;

  constructor(registry: IndicatorRegistry = new IndicatorRegistry()) {
    this.registry = registry;
    const tree = new AbstractTree<string>(TypeNames.Object, TypeNames.Object);
    tree.addNode(CANDLE_TYPE, CANDLE_TYPE, TypeNames.Object);
    this.extendedTypeTree = tree;
    this.namedFunctions = Object.freeze([createCandleFunction(), new IndicatorFunction(registry)]);
  }

  /** Whether the environment supports the required version of the Core standard (`core-0.2+`). */
  static isCoreSupported(environment: IEnvironment): boolean {
    return environment.standards.some((standard) => satisfies(standard, "core", ["0", "2+"]));
  }
}

/**
 * Adds the Stock standard to an environment: the type `Stock.Candle`, the functions `CANDLE` and `INDICATOR`,
 * and `stock-0.1` in `STANDARDS`.
 *
 * @throws {Error} if the environment does not support `core-0.2+`, or the standard is already registered.
 */
export function registerStock(environment: Environment, registry?: IndicatorRegistry): StockStandard {
  if (!StockStandard.isCoreSupported(environment)) {
    throw new Error(`The Stock standard requires ${StockStandard.requiredCore}.`);
  }
  const standard = new StockStandard(registry);
  environment.registerStandard(standard);
  return standard;
}

/** The indicator registry of the `INDICATOR` function of the environment, if the environment supports Stock. */
export function getIndicatorRegistry(environment: IEnvironment): IndicatorRegistry | undefined {
  const fn = environment.getFunction(INDICATOR_FUNCTION);
  return fn instanceof IndicatorFunction ? fn.registry : undefined;
}
