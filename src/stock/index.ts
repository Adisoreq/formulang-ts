/**
 * The Stock extension standard (Stock 0.1): the type `Stock.Candle`, the functions `CANDLE` and `INDICATOR`, and
 * the Stock, Indicator, Pattern and Strategy context types.
 *
 * ```ts
 * import { Environment } from "formulang-ts";
 * import { registerStock, IndicatorRegistry, StockExecutor, IndicatorContext } from "formulang-ts/stock";
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
export { IndicatorParameter, IndicatorDefinition, IndicatorRegistry } from "./indicators.js";
export {
  StockContext,
  IndicatorContext,
  PatternContext,
  StrategyContext,
  INDICATOR_FUNCTION,
  type CandlesArgument,
} from "./contexts.js";
export { StockExecutor, type PatternResult, type StrategyResult } from "./executor.js";
export { IndicatorFunction, createCandleFunction } from "./functions.js";
export { StockStandard, registerStock, getIndicatorRegistry } from "./standard.js";
