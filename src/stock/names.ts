/**
 * Names of the Stock standard, shared by its modules.
 *
 * @module
 */

/** Identifier of the implemented version of the Stock standard. */
export const STOCK_IDENTIFIER = "stock-1.2";

/** Earlier versions that this version is backward compatible with; they are in `STANDARDS` too. */
export const STOCK_COMPATIBLE_IDENTIFIERS: readonly string[] = Object.freeze(["stock-1.0", "stock-1.1"]);

/** Required version of the Core standard, in the `REQUIRE` format. */
export const STOCK_REQUIRED_CORE = "core-1.2+";

/** Names of the functions of the Stock standard. */
export const StockFunctionNames = {
  candle: "CANDLE",
  isBullish: "IS_BULLISH",
  isBearish: "IS_BEARISH",
  loadIndicator: "LOAD_INDICATOR",
  loadPattern: "LOAD_PATTERN",
  loadCandles: "LOAD_CANDLES",
  lag: "LAG",
  window: "WINDOW",
  ready: "READY",
  crossover: "CROSSOVER",
  crossunder: "CROSSUNDER",
  highest: "HIGHEST",
  lowest: "LOWEST",
  rising: "RISING",
  falling: "FALLING",
  barsSince: "BARS_SINCE",
  valueWhen: "VALUE_WHEN",
  score: "SCORE",
} as const;

/**
 * Whether a text is a valid identifier of a registry definition or of the `id` of the metadata: letters, digits,
 * `_` and `-`, starting with a letter or `_` (e.g. `"macd-ema200"`). It is always a Text, never an identifier token,
 * so it may contain `-`.
 */
export function isFormulaId(id: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(id);
}
