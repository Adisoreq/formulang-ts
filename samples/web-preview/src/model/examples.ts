import type { ContextKind, Example, IndicatorConfig, PatternConfig, StandardDefinition, StrategyConfig } from "./types";

const ITERATION_CONSTANTS = [
  { name: "I", detail: "index of the current iteration (follows @array_indexing)" },
  { name: "N", detail: "number of iterations" },
  { name: "PREV", detail: "result of the previous iteration; null in the first one" },
];

const STOCK_CONSTANTS = [
  ...ITERATION_CONSTANTS,
  { name: "CANDLES", detail: "Array<Stock.Candle>, oldest first" },
  { name: "OPEN", detail: "opening prices" },
  { name: "HIGH", detail: "highest prices" },
  { name: "LOW", detail: "lowest prices" },
  { name: "CLOSE", detail: "closing prices" },
  { name: "VOLUME", detail: "volumes (Number or null)" },
  { name: "TIME", detail: "Unix time in milliseconds (Number or null)" },
];

export const STANDARDS: readonly StandardDefinition[] = [
  {
    id: "core",
    name: "Core 0.3",
    identifier: "core-0.3",
    contexts: [
      {
        kind: "default",
        standard: "core",
        name: "Default Context",
        description: "Executes the formula once. The result is the value of the last sequence.",
        constants: [],
      },
      {
        kind: "iteration",
        standard: "core",
        name: "Iteration Context",
        description: "Executes the formula once per iteration; every iteration starts without variables.",
        constants: ITERATION_CONSTANTS,
      },
    ],
  },
  {
    id: "stock",
    name: "Stock 0.1",
    identifier: "stock-0.1",
    contexts: [
      {
        kind: "stock",
        standard: "stock",
        name: "Stock Context",
        description: "Iterates over the candles of the chart; I is the current candle.",
        constants: STOCK_CONSTANTS,
      },
      {
        kind: "indicator",
        standard: "stock",
        name: "Indicator Context",
        description: "Computes a value (or an object of values) for every candle: the series of an indicator.",
        constants: [
          ...STOCK_CONSTANTS,
          { name: "PARAMETERS", detail: "parameters of the indicator, completed with the defaults" },
          { name: "SOURCE", detail: "source values; CLOSE by default" },
        ],
      },
      {
        kind: "pattern",
        standard: "stock",
        name: "Pattern Context",
        description: "Returns a Boolean for every candle: whether the pattern ends at it.",
        constants: STOCK_CONSTANTS,
      },
      {
        kind: "strategy",
        standard: "stock",
        name: "Strategy Context",
        description: "Returns a signal from SELL (-1) to BUY (1) for every candle.",
        constants: [
          ...STOCK_CONSTANTS,
          { name: "BUY", detail: "1" },
          { name: "NEUTRAL", detail: "0" },
          { name: "SELL", detail: "-1" },
        ],
      },
    ],
  },
];

export const CONTEXTS = STANDARDS.flatMap((standard) => standard.contexts);

// Core

const DEFAULT_EXAMPLES: Example[] = [
  {
    id: "circle",
    name: "Circle area",
    description: "Initial assignment and a constant of the environment.",
    formula: "$r := 2.5\nPI * $r ^ 2",
  },
  {
    id: "interest",
    name: "Compound interest",
    description: "Variables, rounding and text concatenation.",
    formula: `# Compound interest calculator
$principal := 1000
$rate := 0.05
$years := 10

$multiplier := (1 + $rate) ^ $years
$result := ROUND($principal * $multiplier, 2)

"Final amount: " + TEXT($result)`,
  },
  {
    id: "statistics",
    name: "Statistics",
    description: "Arrays, lambdas and an object literal.",
    formula: `# Mean and standard deviation of a data set
$data = [2, 4, 4, 4, 5, 5, 7, 9]
$mean = AVG($data)
$stdev = SQRT(SUM(MAP($data, (x) => (x - $mean) ^ 2)) / LEN($data))

{ mean: $mean, stdev: $stdev, above_mean: FILTER($data, (x) => x > $mean) }`,
  },
  {
    id: "text",
    name: "Text functions",
    description: "Functions of texts from Core 0.3.",
    formula: `$name = "  formulang  "
$clean = UPPERCASE(TRIM($name))
[$clean, LEN($clean), SPLIT("a,b,c", ","), REPLACE($clean, "LANG", "-LANG")]`,
  },
  {
    id: "serialization",
    name: "Serialization",
    description: "Serialization variables changed by the formula.",
    formula: `@decimal_place = 2
@split_object = true
@include_object_class = true
{ price: 19.999, items: SEQ(3), candle: CANDLE({ open: 1, high: 2, low: 0.5, close: 1.5 }) }`,
  },
  {
    id: "errors",
    name: "Error handling",
    description: "An error replaced with null by @suppress_errors.",
    formula: `@suppress_errors = true
$a = DIV(1, 0)
$b = ISNULL($a)
IF($b, "the error was suppressed", "no error")`,
  },
  {
    id: "validation",
    name: "Validation errors",
    description: "Validation reports every problem at once.",
    formula: `$x = (1 + 2
$y = "not closed`,
  },
];

const ITERATION_EXAMPLES: Example[] = [
  {
    id: "constants",
    name: "Constants",
    description: "The constants of every iteration.",
    formula: "[I, N, PREV]",
  },
  {
    id: "powers",
    name: "Powers of two",
    description: "PREV carries the result of the previous iteration.",
    formula: "IF(ISNULL(PREV), 1, PREV * 2)",
  },
  {
    id: "fibonacci",
    name: "Fibonacci",
    description: "A pair of numbers carried in PREV.",
    formula: "IF(ISNULL(PREV), [0, 1], [PREV[1], PREV[0] + PREV[1]])",
  },
  {
    id: "progress",
    name: "Progress",
    description: "Text built from I and N.",
    formula: 'TEXT(ROUND((I + 1) / N * 100, 0)) + "%"',
  },
];

// Stock

const STOCK_EXAMPLES: Example[] = [
  {
    id: "range",
    name: "Candle range",
    description: "Difference of the highest and the lowest price of the candle.",
    formula: "ROUND(HIGH[I] - LOW[I], 2)",
  },
  {
    id: "change",
    name: "Change %",
    description: "Change of the closing price from the previous candle.",
    formula: "IF(I == @array_indexing, 0, ROUND((CLOSE[I] - CLOSE[I - 1]) / CLOSE[I - 1] * 100, 2))",
  },
  {
    id: "candle",
    name: "Current candle",
    description: "The candle itself, as an Object<Stock.Candle>.",
    formula: "@include_object_class = true\nCANDLES[I]",
  },
  {
    id: "running-max",
    name: "Running maximum",
    description: "The highest close so far, carried in PREV.",
    formula: "IF(ISNULL(PREV), CLOSE[I], MAX(PREV, CLOSE[I]))",
  },
];

/** The last `period` values of the source, and whether the window is complete. */
const WINDOW = `$window = RANGE(SOURCE, MAX(I - $period + 1, @array_indexing), I)
$complete = AND(LEN($window) == $period, LEN(FILTER($window, (e) => ISNULL(e))) == 0)`;

export const INDICATORS: IndicatorConfig[] = [
  {
    id: "sma",
    indicatorId: "SMA",
    name: "Simple moving average",
    description: "Average of the last `period` values of the source.",
    formula: `$period = PARAMETERS.period
${WINDOW}

IF($complete, AVG($window), null)`,
    parameters: [{ id: "period", name: "Period", defaultValue: 20 }],
    series: [
      {
        id: "sma",
        name: "SMA",
        description: "Moving average",
        lineColor: "#f2c14e",
        fillColor: "transparent",
        fillMode: "line",
      },
    ],
    seriesMode: "single",
    type: "normal",
  },
  {
    id: "ema",
    indicatorId: "EMA",
    name: "Exponential moving average",
    description: "Moving average that weights recent values more; recursive through PREV.",
    formula: `$period = PARAMETERS.period
$alpha = 2 / ($period + 1)
$x = SOURCE[I]
${WINDOW}

IF(ISNULL($x),
   null,
   IF(NOT(ISNULL(PREV)),
      $alpha * $x + (1 - $alpha) * PREV,
      IF($complete, AVG($window), null)))`,
    parameters: [{ id: "period", name: "Period", defaultValue: 12 }],
    series: [
      {
        id: "ema",
        name: "EMA",
        description: "Exponential moving average",
        lineColor: "#3ddc97",
        fillColor: "rgba(61, 220, 151, 0.14)",
        fillMode: "area",
      },
    ],
    seriesMode: "single",
    type: "normal",
  },
  {
    id: "bollinger",
    indicatorId: "BOLLINGER",
    name: "Bollinger bands",
    description: "Moving average with bands `deviations` standard deviations away.",
    formula: `$period = PARAMETERS.period
$k = PARAMETERS.deviations
${WINDOW}

$mean = IF($complete, AVG($window), 0)
$sd = IF($complete, SQRT(AVG(MAP($window, (e) => (e - $mean) ^ 2))), 0)

IF($complete, { upper: $mean + $k * $sd, middle: $mean, lower: $mean - $k * $sd }, null)`,
    parameters: [
      { id: "period", name: "Period", defaultValue: 20 },
      { id: "deviations", name: "Deviations", defaultValue: 2 },
    ],
    series: [
      {
        id: "upper",
        name: "Upper",
        description: "Upper band",
        lineColor: "#7aa2f7",
        fillColor: "transparent",
        fillMode: "line",
      },
      {
        id: "middle",
        name: "Middle",
        description: "Moving average",
        lineColor: "#c0caf5",
        fillColor: "transparent",
        fillMode: "line",
      },
      {
        id: "lower",
        name: "Lower",
        description: "Lower band",
        lineColor: "#7aa2f7",
        fillColor: "transparent",
        fillMode: "line",
      },
    ],
    seriesMode: "multiple",
    type: "normal",
  },
  {
    id: "donchian",
    indicatorId: "DONCHIAN",
    name: "Donchian channel",
    description: "Highest high and lowest low of the last `period` candles.",
    formula: `$period = PARAMETERS.period
$from = MAX(I - $period + 1, @array_indexing)

IF(I - $from + 1 < $period,
   null,
   { upper: MAX(RANGE(HIGH, $from, I)), lower: MIN(RANGE(LOW, $from, I)) })`,
    parameters: [{ id: "period", name: "Period", defaultValue: 20 }],
    series: [
      {
        id: "upper",
        name: "Upper",
        description: "Highest high",
        lineColor: "#2fbf71",
        fillColor: "transparent",
        fillMode: "line",
      },
      {
        id: "lower",
        name: "Lower",
        description: "Lowest low",
        lineColor: "#e5534b",
        fillColor: "transparent",
        fillMode: "line",
      },
    ],
    seriesMode: "multiple",
    type: "normal",
  },
  {
    id: "typical",
    indicatorId: "TYPICAL",
    name: "Typical price",
    description: "(high + low + close) / 3, filled above and below its average.",
    formula: "(HIGH[I] + LOW[I] + CLOSE[I]) / 3",
    parameters: [],
    series: [
      {
        id: "typical",
        name: "Typical",
        description: "Typical price",
        lineColor: "#2fbf71",
        fillColor: "rgba(229, 83, 75, 0.18)",
        fillMode: "baseline",
      },
    ],
    seriesMode: "single",
    type: "normal",
  },
  {
    id: "volume",
    indicatorId: "VOLUME_BARS",
    name: "Volume",
    description: "Traded volume of every candle, as a histogram at the bottom of the chart.",
    formula: "VOLUME[I]",
    parameters: [],
    series: [
      {
        id: "volume",
        name: "Volume",
        description: "Volume",
        lineColor: "#2fbf71",
        fillColor: "rgba(47, 191, 113, 0.45)",
        fillMode: "histogram",
      },
    ],
    seriesMode: "single",
    type: "normal",
  },
  {
    id: "macd",
    indicatorId: "MACD",
    name: "MACD",
    description: "Difference of two EMAs, its signal line and their histogram (docs/standards/stock/examples).",
    formula: `$short = INDICATOR("EMA", { period: PARAMETERS.short_period }, SOURCE)
$long = INDICATOR("EMA", { period: PARAMETERS.long_period }, SOURCE)

# MACD line for every candle: the two series joined element by element
$line = MAP($short, (s, i) => IF(OR(ISNULL(s), ISNULL($long[i])), null, s - $long[i]))

$macd = $line[I]
$signal = INDICATOR("EMA", { period: PARAMETERS.signal_period }, $line)[I]

IF(OR(ISNULL($macd), ISNULL($signal)),
   null,
   { macd: $macd, signal: $signal, histogram: $macd - $signal })`,
    parameters: [
      { id: "short_period", name: "Short period", defaultValue: 12 },
      { id: "long_period", name: "Long period", defaultValue: 26 },
      { id: "signal_period", name: "Signal period", defaultValue: 9 },
    ],
    series: [
      {
        id: "histogram",
        name: "Histogram",
        description: "MACD - signal",
        lineColor: "#7aa2f7",
        fillColor: "rgba(122, 162, 247, 0.55)",
        fillMode: "histogram",
      },
      {
        id: "macd",
        name: "MACD",
        description: "Short EMA - long EMA",
        lineColor: "#4be39a",
        fillColor: "transparent",
        fillMode: "line",
      },
      {
        id: "signal",
        name: "Signal",
        description: "EMA of the MACD line",
        lineColor: "#ff8f70",
        fillColor: "transparent",
        fillMode: "line",
      },
    ],
    seriesMode: "multiple",
    type: "oscillator",
  },
  {
    id: "rsi",
    indicatorId: "RSI",
    name: "Relative strength index",
    description: "Average gain against average loss of the last `period` changes, from 0 to 100 (simple averages).",
    formula: `$period = PARAMETERS.period
$ready = I - @array_indexing >= $period

# Changes of the closing price within the window
$from = MAX(I - $period + 1, @array_indexing + 1)
$changes = MAP(SEQ(MAX(I - $from + 1, 0), 1, $from), (k) => CLOSE[k] - CLOSE[k - 1])

$gain = SUM(MAP($changes, (c) => MAX(c, 0))) / $period
$loss = SUM(MAP($changes, (c) => MAX(-c, 0))) / $period

IF(NOT($ready), null, IF($loss == 0, 100, 100 - 100 / (1 + $gain / $loss)))`,
    parameters: [{ id: "period", name: "Period", defaultValue: 14 }],
    series: [
      {
        id: "rsi",
        name: "RSI",
        description: "Relative strength index",
        lineColor: "#c9a7ff",
        fillColor: "rgba(201, 167, 255, 0.12)",
        fillMode: "area",
      },
    ],
    seriesMode: "single",
    type: "oscillator",
  },
];

const PREVIOUS = "$prev = CANDLES[MAX(I - 1, @array_indexing)]\n$curr = CANDLES[I]";

export const PATTERNS: PatternConfig[] = [
  {
    id: "bullish-engulfing",
    name: "Bullish engulfing",
    description: "A bullish candle whose body covers the body of the previous bearish candle.",
    type: "bullish",
    color: "green",
    length: 2,
    formula: `# In the first iteration, the previous candle is the current one
${PREVIOUS}

$prev_bearish = $prev.close < $prev.open
$curr_bullish = $curr.close > $curr.open
$covers = AND($curr.open <= $prev.close, $curr.close >= $prev.open)

AND(I > @array_indexing, AND($prev_bearish, AND($curr_bullish, $covers)))`,
  },
  {
    id: "bearish-engulfing",
    name: "Bearish engulfing",
    description: "A bearish candle whose body covers the body of the previous bullish candle.",
    type: "bearish",
    color: "red",
    length: 2,
    formula: `${PREVIOUS}

$prev_bullish = $prev.close > $prev.open
$curr_bearish = $curr.close < $curr.open
$covers = AND($curr.open >= $prev.close, $curr.close <= $prev.open)

AND(I > @array_indexing, AND($prev_bullish, AND($curr_bearish, $covers)))`,
  },
  {
    id: "hammer",
    name: "Hammer",
    description: "A small body at the top of the candle with a long lower shadow.",
    type: "bullish",
    color: "green",
    length: 1,
    formula: `$c = CANDLES[I]
$body = ABS($c.close - $c.open)
$range = $c.high - $c.low
$lower = MIN($c.open, $c.close) - $c.low
$upper = $c.high - MAX($c.open, $c.close)

AND($range > 0, AND($lower >= 2 * $body, $upper <= 0.15 * $range))`,
  },
  {
    id: "shooting-star",
    name: "Shooting star",
    description: "A small body at the bottom of the candle with a long upper shadow.",
    type: "bearish",
    color: "red",
    length: 1,
    formula: `$c = CANDLES[I]
$body = ABS($c.close - $c.open)
$range = $c.high - $c.low
$lower = MIN($c.open, $c.close) - $c.low
$upper = $c.high - MAX($c.open, $c.close)

AND($range > 0, AND($upper >= 2 * $body, $lower <= 0.15 * $range))`,
  },
  {
    id: "three-soldiers",
    name: "Three white soldiers",
    description: "Three bullish candles in a row, each closing higher than the previous one.",
    type: "bullish",
    color: "green",
    length: 3,
    formula: `$a = CANDLES[MAX(I - 2, @array_indexing)]
$b = CANDLES[MAX(I - 1, @array_indexing)]
$c = CANDLES[I]

$bullish = AND($a.close > $a.open, AND($b.close > $b.open, $c.close > $c.open))
$rising = AND($b.close > $a.close, $c.close > $b.close)

AND(I >= @array_indexing + 2, AND($bullish, $rising))`,
  },
];

export const STRATEGIES: StrategyConfig[] = [
  {
    id: "crossover",
    name: "Moving average crossover",
    description: "Buys when the fast SMA crosses above the slow SMA, sells when it crosses below.",
    confidence: 1,
    lifetime: 5,
    formula: `$fast = INDICATOR("SMA", { period: 10 })
$slow = INDICATOR("SMA", { period: 30 })

$p = MAX(I - 1, @array_indexing)
$values = [$fast[$p], $slow[$p], $fast[I], $slow[I]]
$ready = AND(I > @array_indexing, LEN(FILTER($values, (e) => ISNULL(e))) == 0)

IF(NOT($ready),
   NEUTRAL,
   IF(AND($fast[$p] <= $slow[$p], $fast[I] > $slow[I]),
      BUY,
      IF(AND($fast[$p] >= $slow[$p], $fast[I] < $slow[I]), SELL, NEUTRAL)))`,
  },
  {
    id: "bollinger-reversion",
    name: "Bollinger reversion",
    description: "Expects the price to return inside the Bollinger bands.",
    confidence: 0.6,
    lifetime: 3,
    formula: `$b = INDICATOR("BOLLINGER")[I]

IF(ISNULL($b),
   NEUTRAL,
   IF(CLOSE[I] < $b.lower, BUY, IF(CLOSE[I] > $b.upper, SELL, NEUTRAL)))`,
  },
  {
    id: "momentum",
    name: "Momentum",
    description: "Follows the price at the moment its change over 10 candles exceeds 6%.",
    confidence: 0.4,
    lifetime: 2,
    formula: `$n = 10
$t = 0.06
$now = IF(I < $n, 0, (CLOSE[I] - CLOSE[I - $n]) / CLOSE[I - $n])
$before = IF(I < $n + 1, 0, (CLOSE[I - 1] - CLOSE[I - 1 - $n]) / CLOSE[I - 1 - $n])

# A signal only when the change crosses the threshold
IF(AND(ABS($now) > $t, ABS($before) <= $t), SIGN($now), NEUTRAL)`,
  },
];

/** Identifier of the empty formula that every context type offers next to its examples. */
export const NEW_FORMULA = "new";

const NEW_EXAMPLE: Example = {
  id: NEW_FORMULA,
  name: "New formula",
  description: "An empty formula to write from scratch.",
  formula: "",
};

INDICATORS.push({
  ...NEW_EXAMPLE,
  description: 'An empty indicator: return a Number for every candle. It is in the registry as INDICATOR("CUSTOM").',
  indicatorId: "CUSTOM",
  parameters: [],
  series: [
    {
      id: "value",
      name: "Custom",
      description: "Value of the indicator",
      lineColor: "#e9c46a",
      fillColor: "transparent",
      fillMode: "line",
    },
  ],
  seriesMode: "single",
  type: "normal",
});

PATTERNS.push({
  ...NEW_EXAMPLE,
  description: "An empty pattern: return true for the candle where the pattern ends.",
  type: "bullish",
  color: "green",
  length: 1,
});

STRATEGIES.push({
  ...NEW_EXAMPLE,
  name: "New strategy",
  description: "An empty strategy: return a signal from SELL (-1) to BUY (1) for every candle.",
  confidence: 1,
  lifetime: 1,
});

/** Examples of every context type. */
export const EXAMPLES: Record<ContextKind, readonly Example[]> = {
  default: [...DEFAULT_EXAMPLES, NEW_EXAMPLE],
  iteration: [...ITERATION_EXAMPLES, NEW_EXAMPLE],
  stock: [...STOCK_EXAMPLES, NEW_EXAMPLE],
  indicator: INDICATORS,
  pattern: PATTERNS,
  strategy: STRATEGIES,
};

/** Key of the formula of an example in the state of the preview. */
export const formulaKey = (kind: ContextKind, id: string): string => `${kind}:${id}`;
