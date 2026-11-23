/** Standards supported by the preview. */
export type StandardId = "core" | "stock";

/** Context types of the standards (docs/core/context.md, docs/standards/stock/README.md). */
export type ContextKind = "default" | "iteration" | "time" | "stock" | "indicator" | "pattern" | "strategy";

export interface StandardDefinition {
  readonly id: StandardId;
  /** `Core 1.0` */
  readonly name: string;
  /** `core-1.0` */
  readonly identifier: string;
  readonly contexts: readonly ContextDefinition[];
}

export interface ContextDefinition {
  readonly kind: ContextKind;
  readonly standard: StandardId;
  readonly name: string;
  readonly description: string;
  /** Constants provided by the context type, for the suggestions of the editor. */
  readonly constants: readonly { readonly name: string; readonly detail: string }[];
}

/** A formula of a context type. */
export interface Example {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly formula: string;
}

// Pattern Context

export type PatternType = "bullish" | "bearish";
export type PatternColor = "green" | "red";

export interface PatternConfig extends Example {
  /** Identifier of the pattern in the registry: `LOAD_PATTERN("ENGULFING")`. */
  readonly patternId: string;
  readonly parameters: readonly IndicatorParameterConfig[];
  readonly type: PatternType;
  readonly color: PatternColor;
  /** Number of candles of the pattern, ending with the candle where it is detected (width of its rectangle). */
  readonly length: number;
}

// Indicator Context

/** A parameter of a definition of the registry (an indicator or a pattern). */
export interface IndicatorParameterConfig {
  /** Key in `PARAMETERS`. */
  readonly id: string;
  readonly name: string;
  readonly defaultValue: number;
}

export type FillMode = "line" | "area" | "baseline" | "histogram";

export interface SeriesConfig {
  /** Key of the series in an Object result (`multiple` mode). */
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly lineColor: string;
  readonly fillColor: string;
  readonly fillMode: FillMode;
}

/** `single`: the formula returns a Number per candle; `multiple`: an Object with one Number per series. */
export type SeriesMode = "single" | "multiple";

/**
 * `normal`: drawn over the candles, on their price scale (moving averages, bands).
 * `oscillator`: drawn in a separate pane below the candles, with its own price scale (MACD, RSI).
 */
export type IndicatorType = "normal" | "oscillator";

export interface IndicatorConfig extends Example {
  /** Identifier of the indicator in the registry: `LOAD_INDICATOR("SMA")`. */
  readonly indicatorId: string;
  readonly parameters: readonly IndicatorParameterConfig[];
  readonly series: readonly SeriesConfig[];
  readonly seriesMode: SeriesMode;
  readonly type: IndicatorType;
}

// Strategy Context

export interface StrategyConfig extends Example {
  /** Multiplier of the signal of the strategy (default 1.0). */
  readonly confidence: number;
  /** Number of candles a signal stays active, starting with the candle where it is given. */
  readonly lifetime: number;
}

/** A candle of the chart; `time` in milliseconds (UTC). */
export interface ChartCandle {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}
