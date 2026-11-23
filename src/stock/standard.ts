import type { IFunction } from "../abstractions/functions.js";
import type { IAbstractTree, IEnvironment, IStandard, IStandardVersion } from "../abstractions/structures.js";
import { AbstractTree, type Environment, StandardVersion, TypeNames, satisfies } from "../core/index.js";
import { CANDLE_TYPE } from "./candle.js";
import {
  LoadIndicatorFunction,
  LoadPatternFunction,
  createCandleFunction,
  createIsBearishFunction,
  createIsBullishFunction,
} from "./functions.js";
import { STOCK_IDENTIFIER, STOCK_REQUIRED_CORE, StockFunctionNames } from "./names.js";
import { FormulaRegistry } from "./registry.js";

/** The Stock standard, `stock-1.0` (docs/standards/stock/README.md). Every instance has its own formula registry. */
export class StockStandard implements IStandard {
  /** Identifier of the implemented version. */
  static readonly identifier = STOCK_IDENTIFIER;
  /** Required version of the Core standard, in the `REQUIRE` format. */
  static readonly requiredCore = STOCK_REQUIRED_CORE;

  readonly id = "stock";
  readonly name = "Stock";
  readonly version: IStandardVersion = new StandardVersion(1, 0);
  readonly extendedTypes: readonly string[] = Object.freeze([CANDLE_TYPE]);
  readonly extendedTypeTree: IAbstractTree<string>;
  readonly namedFunctions: readonly IFunction[];
  /** Indicator and pattern definitions provided by the host application. */
  readonly registry: FormulaRegistry;

  constructor(registry: FormulaRegistry = new FormulaRegistry()) {
    this.registry = registry;
    const tree = new AbstractTree<string>(TypeNames.Object, TypeNames.Object);
    tree.addNode(CANDLE_TYPE, CANDLE_TYPE, TypeNames.Object);
    this.extendedTypeTree = tree;
    this.namedFunctions = Object.freeze([
      createCandleFunction(),
      createIsBullishFunction(),
      createIsBearishFunction(),
      new LoadIndicatorFunction(registry),
      new LoadPatternFunction(registry),
    ]);
  }

  /** Whether the environment supports the required version of the Core standard (`core-1+`). */
  static isCoreSupported(environment: IEnvironment): boolean {
    return environment.standards.some((standard) => satisfies(standard, "core", ["1+"]));
  }
}

/**
 * Adds the Stock standard to an environment: `stock-1.0` in `STANDARDS`, the type `Stock.Candle`, the functions
 * `CANDLE`, `IS_BULLISH`, `IS_BEARISH`, `LOAD_INDICATOR` and `LOAD_PATTERN`, and the formula registry.
 *
 * @throws {Error} if the environment does not support `core-1+`, or the standard is already registered.
 */
export function registerStock(environment: Environment, registry?: FormulaRegistry): StockStandard {
  if (!StockStandard.isCoreSupported(environment)) {
    throw new Error(`The Stock standard requires ${StockStandard.requiredCore}.`);
  }
  const standard = new StockStandard(registry);
  environment.registerStandard(standard);
  return standard;
}

/** The formula registry of the environment, or `undefined` if the environment does not support Stock. */
export function getFormulaRegistry(environment: IEnvironment): FormulaRegistry | undefined {
  const fn = environment.getFunction(StockFunctionNames.loadIndicator);
  return fn instanceof LoadIndicatorFunction ? fn.registry : undefined;
}
