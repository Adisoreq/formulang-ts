import type { ContextKind, Example, IndicatorConfig, PatternConfig, StandardDefinition, StrategyConfig } from "./types";

const ITERATION_CONSTANTS = [
  { name: "I", detail: "index of the current iteration (follows @array_indexing)" },
  { name: "N", detail: "number of iterations" },
  { name: "PREV", detail: "result of the previous iteration; null in the first one" },
  { name: "HISTORY", detail: "results of all the previous iterations (Core 1.2)" },
];

const TIME_CONSTANTS = [
  { name: "TIME_S", detail: "time from the first frame, in seconds" },
  { name: "TIME_MS", detail: "time from the first frame, in milliseconds" },
  { name: "DTIME_S", detail: "time from the previous frame, in seconds; 0 in the first frame" },
  { name: "DTIME_MS", detail: "time from the previous frame, in milliseconds" },
  { name: "FRAME", detail: "index of the current frame (follows @array_indexing)" },
  { name: "PREV", detail: "result of the previous frame; null in the first one" },
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
  { name: "TIMEFRAME", detail: 'timeframe of the candles: "1d" (Stock 1.2; the preview also provides "1w")' },
  { name: "INSTRUMENT", detail: 'instrument of the candles: "MOCK" (Stock 1.2)' },
];

export const STANDARDS: readonly StandardDefinition[] = [
  {
    id: "core",
    name: "Core 1.2",
    identifier: "core-1.2",
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
        description:
          "Executes the formula once per iteration; every iteration starts without variables, and keeps a state only in PREV, HISTORY and the memory (STORE, RECALL).",
        constants: ITERATION_CONSTANTS,
      },
      {
        kind: "time",
        standard: "core",
        name: "Time Context",
        description:
          "Executes the formula once per frame as time passes: animations, simulations, clocks. The memory keeps a state between the frames.",
        constants: TIME_CONSTANTS,
      },
    ],
  },
  {
    id: "stock",
    name: "Stock 1.2",
    identifier: "stock-1.2",
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
        constants: [
          ...STOCK_CONSTANTS,
          { name: "PARAMETERS", detail: "parameters of the pattern, completed with the defaults" },
        ],
      },
      {
        kind: "strategy",
        standard: "stock",
        name: "Strategy Context",
        description:
          "Returns a signal from SELL (-1) to BUY (1) for every candle, or a signal object { signal, reason, checks }.",
        constants: [
          ...STOCK_CONSTANTS,
          { name: "BUY", detail: "1" },
          { name: "NEUTRAL", detail: "0" },
          { name: "SELL", detail: "-1" },
          { name: "PARAMETERS", detail: "parameters of the strategy: the defaults of its metadata (Stock 1.2)" },
        ],
      },
    ],
  },
];

export const CONTEXTS = STANDARDS.flatMap((standard) => standard.contexts);

// Formulas: data/formulas/<context kind>/<example id>.fl

const FORMULA_FILES = import.meta.glob<string>("../../data/formulas/*/*.fl", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Text of `data/formulas/<kind>/<id>.fl`, with LF line endings and without the final line break of the file. */
const loadFormula = (kind: ContextKind, id: string): string => {
  const text = FORMULA_FILES[`../../data/formulas/${kind}/${id}.fl`];
  if (text === undefined) throw new Error(`Missing formula file: data/formulas/${kind}/${id}.fl`);
  return text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
};

/** Adds to every example the formula of its file. */
const withFormulas = <T extends Example>(kind: ContextKind, examples: Omit<T, "formula">[]): T[] =>
  examples.map((example) => ({ ...example, formula: loadFormula(kind, example.id) }) as T);

// Core

const DEFAULT_EXAMPLES: Example[] = withFormulas<Example>("default", [
  {
    id: "circle",
    name: "Circle area",
    description: "Initial assignment and a constant of the environment.",
  },
  {
    id: "interest",
    name: "Compound interest",
    description: "Variables, rounding and text concatenation.",
  },
  {
    id: "statistics",
    name: "Statistics",
    description: "Arrays, lambdas and an object literal.",
  },
  {
    id: "text",
    name: "Text functions",
    description: "Text functions; a character is one Unicode code point.",
  },
  {
    id: "format",
    name: "Formatting",
    description: "FORMAT with sequential, indexed and named placeholders.",
  },
  {
    id: "time",
    name: "Time functions",
    description: "NOW, the parts of a date, DATE and FORMAT_TIME.",
  },
  {
    id: "comments",
    name: "Comments",
    description: "Line comments and scoped comments that may span several lines.",
  },
  {
    id: "serialization",
    name: "Serialization",
    description: "Serialization variables changed by the formula.",
  },
  {
    id: "errors",
    name: "Error handling",
    description: "An error replaced with null by @suppress_errors.",
  },
  {
    id: "validation",
    name: "Validation errors",
    description: "Validation reports every problem at once.",
  },
  {
    id: "metadata",
    name: "Metadata and warnings",
    description: "Core 1.2: a metadata block <@ { ... } @>, and the warnings of lines whose values are not used.",
  },
  {
    id: "logic",
    name: "Short circuit",
    description: "Core 1.2: AND and OR stop at the first false or true, and take many arguments.",
  },
]);

const ITERATION_EXAMPLES: Example[] = withFormulas<Example>("iteration", [
  {
    id: "constants",
    name: "Constants",
    description: "The constants of every iteration.",
  },
  {
    id: "powers",
    name: "Powers of two",
    description: "PREV carries the result of the previous iteration.",
  },
  {
    id: "fibonacci",
    name: "Fibonacci",
    description: "A pair of numbers carried in PREV.",
  },
  {
    id: "progress",
    name: "Progress",
    description: "Text built from I and N.",
  },
  {
    id: "memory",
    name: "Memory",
    description: "Core 1.2: STORE, RECALL and CLEAR keep a state between the iterations.",
  },
  {
    id: "history",
    name: "History",
    description: "Core 1.2: HISTORY, the results of all the previous iterations.",
  },
]);

const TIME_EXAMPLES: Example[] = withFormulas<Example>("time", [
  {
    id: "motion",
    name: "Moving point",
    description: "Moves with 5 units per second and stops at 100; the position is carried in PREV.",
  },
  {
    id: "constants",
    name: "Constants",
    description: "The constants of every frame.",
  },
  {
    id: "wave",
    name: "Sine wave",
    description: "A value that oscillates between -1 and 1 every 4 seconds.",
  },
  {
    id: "rotation",
    name: "Rotation",
    description: "An angle that repeats every 4 seconds.",
  },
  {
    id: "clock",
    name: "Clock",
    description: "NOW is set again for every frame.",
  },
  {
    id: "stopwatch",
    name: "Stopwatch",
    description: "Frames per second measured from DTIME_S.",
  },
  {
    id: "distance",
    name: "Distance",
    description: "Core 1.2: the memory sums the distance travelled in every frame.",
  },
]);

// Stock

const STOCK_EXAMPLES: Example[] = withFormulas<Example>("stock", [
  {
    id: "range",
    name: "Candle range",
    description: "Difference of the highest and the lowest price of the candle.",
  },
  {
    id: "change",
    name: "Change %",
    description: "Change of the closing price from the previous candle.",
  },
  {
    id: "candle",
    name: "Current candle",
    description: "The candle itself, as an Object<Stock.Candle>.",
  },
  {
    id: "running-max",
    name: "Running maximum",
    description: "The highest close so far, carried in PREV.",
  },
  {
    id: "direction",
    name: "Direction",
    description: "IS_BULLISH and IS_BEARISH; a doji is neither.",
  },
  {
    id: "series",
    name: "Series functions",
    description: "Stock 1.2: HIGHEST, LOWEST, RISING, FALLING, READY, BARS_SINCE and VALUE_WHEN.",
  },
  {
    id: "weekly",
    name: "Weekly candles",
    description: "Stock 1.2: LOAD_CANDLES of another timeframe, TIMEFRAME and INSTRUMENT.",
  },
]);

export const INDICATORS: IndicatorConfig[] = withFormulas<IndicatorConfig>("indicator", [
  {
    id: "sma",
    indicatorId: "SMA",
    name: "Simple moving average",
    description: "Average of the last `period` values of the source.",
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
    description: "Wilder's RSI, from 0 to 100; the averages are kept in the memory (Stock 1.2).",
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
]);

export const PATTERNS: PatternConfig[] = withFormulas<PatternConfig>("pattern", [
  {
    id: "bullish-engulfing",
    patternId: "ENGULFING",
    name: "Bullish engulfing",
    description: "A bullish candle whose body covers the body of the previous bearish candle.",
    parameters: [],
    type: "bullish",
    color: "green",
    length: 2,
  },
  {
    id: "bearish-engulfing",
    patternId: "BEARISH_ENGULFING",
    name: "Bearish engulfing",
    description: "A bearish candle whose body covers the body of the previous bullish candle.",
    parameters: [],
    type: "bearish",
    color: "red",
    length: 2,
  },
  {
    id: "hammer",
    patternId: "HAMMER",
    name: "Hammer",
    description: "A small body at the top of the candle with a long lower shadow.",
    parameters: [
      { id: "shadow", name: "Lower shadow × body", defaultValue: 2 },
      { id: "max_upper", name: "Max upper shadow (of range)", defaultValue: 0.15 },
    ],
    type: "bullish",
    color: "green",
    length: 1,
  },
  {
    id: "shooting-star",
    patternId: "SHOOTING_STAR",
    name: "Shooting star",
    description: "A small body at the bottom of the candle with a long upper shadow.",
    parameters: [
      { id: "shadow", name: "Upper shadow × body", defaultValue: 2 },
      { id: "max_lower", name: "Max lower shadow (of range)", defaultValue: 0.15 },
    ],
    type: "bearish",
    color: "red",
    length: 1,
  },
  {
    id: "three-soldiers",
    patternId: "THREE_SOLDIERS",
    name: "Three white soldiers",
    description: "Bullish candles in a row, each closing higher than the previous one.",
    parameters: [{ id: "count", name: "Candles", defaultValue: 3 }],
    type: "bullish",
    color: "green",
    length: 3,
  },
]);

export const STRATEGIES: StrategyConfig[] = withFormulas<StrategyConfig>("strategy", [
  {
    id: "crossover",
    name: "Moving average crossover",
    description: "Buys when the fast SMA crosses above the slow SMA (CROSSOVER), sells when it crosses below.",
    confidence: 1,
    lifetime: 5,
  },
  {
    id: "bollinger-reversion",
    name: "Bollinger reversion",
    description: "Expects the price to return inside the Bollinger bands.",
    confidence: 0.6,
    lifetime: 3,
  },
  {
    id: "momentum",
    name: "Momentum",
    description: "Follows the price at the moment its change over 10 candles exceeds 6%.",
    confidence: 0.4,
    lifetime: 2,
  },
  {
    id: "pattern-trend",
    name: "Engulfing above the trend",
    description: "Buys on a bullish engulfing pattern (LOAD_PATTERN) above the 20-candle SMA.",
    confidence: 1,
    lifetime: 4,
  },
  {
    id: "score",
    name: "Score of conditions",
    description: "Stock 1.2: a signal object with its reason and checks, SCORE, and parameters from the metadata.",
    confidence: 1,
    lifetime: 3,
  },
  {
    id: "weekly-trend",
    name: "Weekly trend",
    description: "Stock 1.2: daily crossings of the EMA in the direction of the weekly SMA (another timeframe).",
    confidence: 0.8,
    lifetime: 3,
  },
]);

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
  description:
    'An empty indicator: return a Number for every candle. Other formulas load it with LOAD_INDICATOR("CUSTOM").',
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
  description:
    'An empty pattern: return true for the candle where the pattern ends. Other formulas load it with LOAD_PATTERN("CUSTOM").',
  patternId: "CUSTOM",
  parameters: [],
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
  time: [...TIME_EXAMPLES, NEW_EXAMPLE],
  stock: [...STOCK_EXAMPLES, NEW_EXAMPLE],
  indicator: INDICATORS,
  pattern: PATTERNS,
  strategy: STRATEGIES,
};

/** Key of the formula of an example in the state of the preview. */
export const formulaKey = (kind: ContextKind, id: string): string => `${kind}:${id}`;
