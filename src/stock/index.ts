/**
 * The Stock extension standard (Stock 1.0): the type `Stock.Candle`, the functions `CANDLE`, `IS_BULLISH`,
 * `IS_BEARISH`, `LOAD_INDICATOR` and `LOAD_PATTERN`, the formula registry, and the Stock, Indicator, Pattern and
 * Strategy context types.
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
export { STOCK_IDENTIFIER, STOCK_REQUIRED_CORE, StockFunctionNames } from "./names.js";
export { StockContext, IndicatorContext, PatternContext, StrategyContext, type CandlesArgument } from "./contexts.js";
export { StockExecutor, type PatternResult, type StrategyResult } from "./executor.js";
export {
  LoadIndicatorFunction,
  LoadPatternFunction,
  createCandleFunction,
  createIsBullishFunction,
  createIsBearishFunction,
} from "./functions.js";
export { StockStandard, registerStock, getFormulaRegistry } from "./standard.js";
