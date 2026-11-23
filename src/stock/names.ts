/**
 * Names of the Stock standard, shared by its modules.
 *
 * @module
 */

/** Identifier of the implemented version of the Stock standard. */
export const STOCK_IDENTIFIER = "stock-1.0";

/** Required version of the Core standard, in the `REQUIRE` format. */
export const STOCK_REQUIRED_CORE = "core-1+";

/** Names of the functions of the Stock standard. */
export const StockFunctionNames = {
  candle: "CANDLE",
  isBullish: "IS_BULLISH",
  isBearish: "IS_BEARISH",
  loadIndicator: "LOAD_INDICATOR",
  loadPattern: "LOAD_PATTERN",
} as const;
