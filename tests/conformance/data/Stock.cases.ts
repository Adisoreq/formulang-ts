// Generated from FormuLang.NET/tests/*/StockTests.cs (Adisoreq/formulang-dotnet@7e85d55).
// Test cases of the reference implementation; regenerate instead of editing by hand.

/** `Require(string formula, string expected)` */
export const require = [
  ["REQUIRE \"stock-1.0\"\nREQUIRE \"core-1+\"\n1", "1"],
  ["REQUIRE \"stock-1.x\"\nCLOSE[I] - OPEN[I]", "0"],
] as const;

/** `Candle_Examples(string formula, string expected)` */
export const candle_Examples = [
  ["CANDLE({ open: 1_000, high: 1_200, low: 800, close: 1_000 })", "[Stock.Candle] { open: 1000, high: 1200, low: 800, close: 1000, volume: null, time: null }"],
  ["CANDLE({ open: 10, high: 12, low: 9, close: 11, volume: 5_000 })", "[Stock.Candle] { open: 10, high: 12, low: 9, close: 11, volume: 5000, time: null }"],
  ["CANDLE({ open: 1_000, low: 300 })", "[OPERATION_ERROR (3)] Object does not meet the requirements to be <Stock.Candle>."],
  ["CANDLE({ open: 10, high: 9, low: 8, close: 11 })", "[OPERATION_ERROR (3)] Object does not meet the requirements to be <Stock.Candle>."],
  ["CANDLE({ open: 10, high: 12, low: 9, close: 11, color: \"red\" })", "[OPERATION_ERROR (3)] Object does not meet the requirements to be <Stock.Candle>."],
  ["CANDLE({ open: 10, high: 12, low: 9, close: 11, volume: \"5\" })", "[OPERATION_ERROR (3)] Object does not meet the requirements to be <Stock.Candle>."],
  ["CANDLE({ open: 10, high: 12, low: 9, close: 11, volume: -5 })", "[OPERATION_ERROR (3)] Object does not meet the requirements to be <Stock.Candle>."],
] as const;

/** `Candle_Values(string formula, string expected)` */
export const candle_Values = [
  ["CANDLE(1)", "ARGUMENT_ERROR"],
  ["KEYS(CANDLE({ open: 1, high: 1, low: 1, close: 1 }))", "[\"open\", \"high\", \"low\", \"close\", \"volume\", \"time\"]"],
  ["CANDLE({ open: 1, high: 2, low: 1, close: 2 }).high", "2"],
  ["EQU(CANDLE({ open: 1, high: 1, low: 1, close: 1 }), CANDLES[0])", "true"],
] as const;

/** `Indicator_Examples(string formula, string expected)` */
export const indicator_Examples = [
  ["LOAD_INDICATOR(\"SMA\", { period: 3 })", "[null, null, 2, 3, 4]"],
  ["LOAD_INDICATOR(\"SMA\", { period: 2 }, [10, 20, 30, 40, 50])", "[null, 15, 25, 35, 45]"],
  ["LOAD_INDICATOR(\"SMA\", { period: 3 })[I]", "4"],
  ["LOAD_INDICATOR(\"XYZ\")", "INVALID_KEY_ERROR"],
  ["LOAD_INDICATOR(\"SMA\", { length: 3 })", "INVALID_KEY_ERROR"],
  ["LOAD_INDICATOR(\"SMA\", { period: 3 }, [1, 2])", "OPERATION_ERROR"],
  ["LOAD_INDICATOR(\"SMA\", { period: 3 }, [1, 2, \"3\", 4, 5])", "OPERATION_ERROR"],
  ["LOAD_INDICATOR(\"SMA\", { period: 2 }, [1, null, 3, 4, 5])", "[null, null, null, 3.5, 4.5]"],
  ["LOAD_INDICATOR(\"SMA\")", "[null, null, null, null, null]"],
  ["LOAD_INDICATOR(\"EMA\", { period: 3 })", "[null, null, 2, 3, 4]"],
  ["LOAD_INDICATOR(1)", "ARGUMENT_ERROR"],
] as const;

/** `Indicator_ResultThatIsNotAllowed(string formula)` */
export const indicator_ResultThatIsNotAllowed = [
  ["\"text\""],
  ["IF(I == 0, 1, { a: 1 })"],
  ["IF(I == 0, { a: 1 }, { b: 1 })"],
  ["{ a: \"x\" }"],
  ["$x = 1"],
] as const;

/** `IsBullishAndIsBearish(string formula, string expected)` */
export const isBullishAndIsBearish = [
  ["IS_BULLISH(CANDLE({ open: 10, high: 12, low: 9, close: 11 }))", "true"],
  ["IS_BULLISH(CANDLE({ open: 11, high: 12, low: 9, close: 10 }))", "false"],
  ["IS_BULLISH(CANDLE({ open: 10, high: 12, low: 9, close: 10 }))", "false"],
  ["IS_BEARISH(CANDLE({ open: 10, high: 12, low: 9, close: 11 }))", "false"],
  ["IS_BEARISH(CANDLE({ open: 11, high: 12, low: 9, close: 10 }))", "true"],
  ["IS_BEARISH(CANDLE({ open: 10, high: 12, low: 9, close: 10 }))", "false"],
  ["IS_BULLISH({ open: 10, close: 11 })", "ARGUMENT_ERROR"],
  ["IS_BEARISH(1)", "ARGUMENT_ERROR"],
] as const;

/** `LoadPattern_Errors(string formula, string expected)` */
export const loadPattern_Errors = [
  ["LOAD_PATTERN(\"XYZ\")", "INVALID_KEY_ERROR"],
  ["LOAD_PATTERN(\"ENGULFING\", { length: 3 })", "INVALID_KEY_ERROR"],
  ["LOAD_PATTERN(\"LOOP\")", "OPERATION_ERROR"],
  ["LOAD_PATTERN(\"NUMBER\")", "OPERATION_ERROR"],
  ["LOAD_INDICATOR(\"ENGULFING\")", "INVALID_KEY_ERROR"],
] as const;
