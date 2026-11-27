import type { IFunction } from "../abstractions/functions.js";
import type { IAbstractTree, IEnvironment, IStandard, IStandardVersion } from "../abstractions/structures.js";
import {
  AbstractTree,
  type Environment,
  type MetadataChecker,
  MetadataChecks,
  StandardVersion,
  TypeNames,
  satisfies,
} from "../core/index.js";
import { CANDLE_TYPE } from "./candle.js";
import {
  LoadIndicatorFunction,
  LoadPatternFunction,
  createCandleFunction,
  createIsBearishFunction,
  createIsBullishFunction,
  createLagFunction,
  createLoadCandlesFunction,
  createWindowFunction,
} from "./functions.js";
import { createScoreFunction, createSeriesFunctions } from "./series.js";
import { STOCK_COMPATIBLE_IDENTIFIERS, STOCK_IDENTIFIER, STOCK_REQUIRED_CORE, StockFunctionNames } from "./names.js";
import { FormulaRegistry } from "./registry.js";

/** The Stock standard, `stock-1.2` (docs/standards/stock/README.md). Every instance has its own formula registry. */
export class StockStandard implements IStandard {
  /** Identifier of the implemented version. */
  static readonly identifier = STOCK_IDENTIFIER;
  /** Earlier versions that this version is backward compatible with; they are in `STANDARDS` too. */
  static readonly compatibleIdentifiers = STOCK_COMPATIBLE_IDENTIFIERS;
  /** Required version of the Core standard, in the `REQUIRE` format. */
  static readonly requiredCore = STOCK_REQUIRED_CORE;

  readonly id = "stock";
  readonly name = "Stock";
  readonly version: IStandardVersion = new StandardVersion(1, 2);
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
      createLoadCandlesFunction(),
      createLagFunction(),
      createWindowFunction(),
      ...createSeriesFunctions(),
      createScoreFunction(),
    ]);
  }

  /** Whether the environment supports the required version of the Core standard (`core-1.2+`). */
  static isCoreSupported(environment: IEnvironment): boolean {
    return environment.standards.some((standard) => satisfies(standard, "core", ["1", "2+"]));
  }

  /**
   * The check of the `stock` key of the metadata (docs/standards/stock/README.md, "Metadata"): `category` (Text),
   * `outputs` (an Object of `{ name, description }`) and `checks` (an Object of Texts).
   */
  static readonly metadataChecker: MetadataChecker = MetadataChecks.object({
    category: MetadataChecks.text,
    outputs: MetadataChecks.objectOf(
      MetadataChecks.object({ name: MetadataChecks.text, description: MetadataChecks.text }),
    ),
    checks: MetadataChecks.objectOf(MetadataChecks.text),
  });
}

/**
 * Adds the Stock standard to an environment: `stock-1.0`, `stock-1.1` and `stock-1.2` in `STANDARDS`, the type
 * `Stock.Candle`, the functions of the standard, the formula registry, and the check of the `stock` key of the
 * metadata.
 *
 * @throws {Error} if the environment does not support `core-1.2+`, or the standard is already registered.
 */
export function registerStock(environment: Environment, registry?: FormulaRegistry): StockStandard {
  if (!StockStandard.isCoreSupported(environment)) {
    throw new Error(`The Stock standard requires ${StockStandard.requiredCore}.`);
  }
  const standard = new StockStandard(registry);
  for (const compatible of STOCK_COMPATIBLE_IDENTIFIERS) environment.registerStandard(compatible);
  environment.registerStandard(standard);
  environment.registerMetadataChecker(standard.id, StockStandard.metadataChecker);
  return standard;
}

/** The formula registry of the environment, or `undefined` if the environment does not support Stock. */
export function getFormulaRegistry(environment: IEnvironment): FormulaRegistry | undefined {
  const fn = environment.getFunction(StockFunctionNames.loadIndicator);
  return fn instanceof LoadIndicatorFunction ? fn.registry : undefined;
}
