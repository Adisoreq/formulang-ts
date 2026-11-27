/**
 * The Stock extension standard (Stock 1.2): the type `Stock.Candle`, the candle, registry, timeframe, series and
 * strategy functions, the formula registry, and the Stock, Indicator, Pattern and Strategy context types.
 *
 * ```ts
 * import { Environment } from "formulang-ts";
 * import { registerStock, FormulaRegistry, StockExecutor, IndicatorContext } from "formulang-ts/stock";
 * ```
 *
 * @packageDocumentation
 */
export {
  CANDLE_TYPE,
  CANDLE_ATTRIBUTES,
  type Candle,
  isValidCandle,
  candleToValue,
  candleFromObject,
} from "./candle.js";
export {
  FormulaParameter,
  FormulaDefinition,
  FormulaCollection,
  FormulaRegistry,
  type FormulaParameters,
} from "./registry.js";
export {
  STOCK_COMPATIBLE_IDENTIFIERS,
  STOCK_IDENTIFIER,
  STOCK_REQUIRED_CORE,
  StockFunctionNames,
  isFormulaId,
} from "./names.js";
export {
  StockContext,
  IndicatorContext,
  PatternContext,
  StrategyContext,
  signalObjectProblem,
  parameterDefaults,
  type CandlesArgument,
  type StockContextOptions,
  type TimeframeCandles,
  type TimeframeSource,
} from "./contexts.js";
export { StockExecutor, type PatternResult, type StrategyResult } from "./executor.js";
export {
  LoadIndicatorFunction,
  LoadPatternFunction,
  createCandleFunction,
  createIsBullishFunction,
  createIsBearishFunction,
  createLagFunction,
  createLoadCandlesFunction,
  createWindowFunction,
} from "./functions.js";
export { createScoreFunction, createSeriesFunctions } from "./series.js";
export { indicatorResultsError, patternResultError, strategyResultError } from "./executor.js";

// Formula models (FormuLang docs/implementation/formula_models.md)
export {
  Definition,
  IndicatorDefinition,
  PatternDefinition,
  StrategyDefinition,
  DefinitionKind,
  InvalidDefinitionReason,
  InvalidDefinitionError,
  ParameterError,
  type OutputDescription,
  type CheckDescription,
  type GivenParameters,
  type InstanceJson,
} from "./model/definitions.js";
export { Instance, IndicatorInstance, PatternInstance, StrategyInstance } from "./model/instances.js";
export {
  LiveRun,
  LiveIndicatorRun,
  LivePatternRun,
  LiveStrategyRun,
  type Chart,
  type RunResult,
  type IndicatorSeries,
  type PatternSeries,
  type StrategySignals,
  type Signal,
} from "./model/runs.js";
export { StockStandard, registerStock, getFormulaRegistry } from "./standard.js";
