import {
  AreaSeries,
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  LineSeries,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type UTCTimestamp,
  createChart,
  createSeriesMarkers,
} from "lightweight-charts";
import { createEffect, on, onCleanup, onMount } from "solid-js";
import type { ChartCandle, SeriesConfig } from "../model/types";
import { type ChartRectangle, RectanglesPrimitive } from "./rectangles";

/** Series of an indicator drawn over the candles. */
export interface ChartOverlay {
  readonly config: SeriesConfig;
  readonly values: readonly (number | null)[];
  /** Pane of the series: 0 over the candles (default), 1 below them with its own price scale (oscillators). */
  readonly pane?: number;
}

export interface ChartMarker {
  readonly index: number;
  readonly position: "aboveBar" | "belowBar";
  readonly shape: "arrowUp" | "arrowDown" | "circle";
  readonly color: string;
  readonly text: string;
}

export interface ChartPattern {
  readonly from: number;
  readonly to: number;
  readonly color: string;
  readonly label: string;
}

interface StockChartProps {
  readonly candles: readonly ChartCandle[];
  readonly overlays?: readonly ChartOverlay[];
  readonly patterns?: readonly ChartPattern[];
  readonly markers?: readonly ChartMarker[];
  /** Histogram in a pane below the candles, e.g. the final proposal of the strategies. */
  readonly histogram?: { readonly label: string; readonly values: readonly number[] };
}

const css = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const timeOf = (candle: ChartCandle): UTCTimestamp => Math.floor(candle.time / 1000) as UTCTimestamp;

/** Candlestick chart (lightweight-charts) with indicator series, pattern rectangles and strategy markers. */
export function StockChart(props: StockChartProps) {
  let container!: HTMLDivElement;
  let chart: IChartApi | undefined;
  let candleSeries: ISeriesApi<"Candlestick"> | undefined;
  let markers: ISeriesMarkersPluginApi<Time> | undefined;
  let rectangles: RectanglesPrimitive | undefined;
  let overlays: ISeriesApi<SeriesType>[] = [];

  const build = (): void => {
    chart?.remove();
    overlays = [];
    const up = css("--up");
    const down = css("--down");
    chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: css("--muted"),
        fontFamily: css("--font-mono"),
        fontSize: 11,
        attributionLogo: false,
        panes: { separatorColor: css("--line"), enableResize: false },
      },
      grid: { vertLines: { color: css("--grid") }, horzLines: { color: css("--grid") } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: css("--line") },
      timeScale: { borderColor: css("--line"), rightOffset: 4 },
    });
    candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderVisible: false,
      wickUpColor: up,
      wickDownColor: down,
    });
    candleSeries.setData(
      props.candles.map((c) => ({ time: timeOf(c), open: c.open, high: c.high, low: c.low, close: c.close })),
    );
    markers = createSeriesMarkers(candleSeries, []);
    rectangles = new RectanglesPrimitive();
    candleSeries.attachPrimitive(rectangles);
    chart.timeScale().fitContent();
  };

  const updateOverlays = (): void => {
    if (chart === undefined) return;
    for (const series of overlays) chart.removeSeries(series);
    overlays = [];
    const times = props.candles.map(timeOf);
    const data = (values: readonly (number | null)[]) =>
      values.map((value, i) => (value === null ? { time: times[i]! } : { time: times[i]!, value }));

    for (const { config, values, pane = 0 } of props.overlays ?? []) {
      const common = { title: config.name, lineWidth: 2 as const, priceLineVisible: false, lastValueVisible: true };
      let series: ISeriesApi<SeriesType>;
      switch (config.fillMode) {
        case "area":
          series = chart.addSeries(
            AreaSeries,
            {
              ...common,
              lineColor: config.lineColor,
              topColor: config.fillColor,
              bottomColor: "rgba(0, 0, 0, 0)",
            },
            pane,
          );
          break;
        case "baseline": {
          const numbers = values.filter((v): v is number => v !== null);
          const base = numbers.length > 0 ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0;
          series = chart.addSeries(
            BaselineSeries,
            {
              ...common,
              baseValue: { type: "price", price: base },
              topLineColor: config.lineColor,
              topFillColor1: withOpacity(config.lineColor, 0.25),
              topFillColor2: withOpacity(config.lineColor, 0.02),
              bottomLineColor: css("--down"),
              bottomFillColor1: config.fillColor,
              bottomFillColor2: withOpacity(css("--down"), 0.02),
            },
            pane,
          );
          break;
        }
        case "histogram":
          if (pane === 0) {
            // Over the candles: on its own scale at the bottom of the pane, like a volume histogram
            series = chart.addSeries(HistogramSeries, {
              title: config.name,
              color: config.fillColor,
              priceScaleId: `overlay-${config.id}`,
              priceLineVisible: false,
              lastValueVisible: false,
            });
            series.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
          } else {
            // In the pane of an oscillator: on the price scale of the pane
            series = chart.addSeries(
              HistogramSeries,
              { title: config.name, color: config.fillColor, priceLineVisible: false, lastValueVisible: true },
              pane,
            );
          }
          break;
        default:
          series = chart.addSeries(LineSeries, { ...common, color: config.lineColor }, pane);
      }
      series.setData(data(values));
      overlays.push(series);
    }
    // Panes below the candles (oscillators): a third of the chart
    const panes = chart.panes();
    for (let i = 1; i < panes.length; i++) panes[i]?.setHeight(Math.round(container.clientHeight * 0.32));

    if (props.histogram !== undefined) {
      const series = chart.addSeries(
        HistogramSeries,
        { title: props.histogram.label, priceLineVisible: false, lastValueVisible: true },
        1,
      );
      series.setData(
        props.histogram.values.map((value, i) => ({
          time: times[i]!,
          value,
          color: value > 0 ? css("--up") : value < 0 ? css("--down") : css("--muted"),
        })),
      );
      chart.panes()[1]?.setHeight(110);
      overlays.push(series);
    }
  };

  const updateDecorations = (): void => {
    const times = props.candles.map(timeOf);
    const list: SeriesMarker<Time>[] = (props.markers ?? [])
      .filter((m) => times[m.index] !== undefined)
      .map((m) => ({ time: times[m.index]!, position: m.position, shape: m.shape, color: m.color, text: m.text }))
      .sort((a, b) => (a.time as number) - (b.time as number));
    markers?.setMarkers(list);
    const boxes: ChartRectangle[] = (props.patterns ?? []).map((p) => {
      const slice = props.candles.slice(p.from, p.to + 1);
      return {
        from: times[p.from]!,
        to: times[p.to]!,
        top: Math.max(...slice.map((c) => c.high)),
        bottom: Math.min(...slice.map((c) => c.low)),
        color: p.color,
        label: p.label,
      };
    });
    rectangles?.setRectangles(boxes);
  };

  onMount(() => {
    // New candles rebuild the whole chart
    createEffect(
      on(
        () => props.candles,
        () => {
          build();
          updateOverlays();
          updateDecorations();
        },
      ),
    );
    createEffect(on([() => props.overlays, () => props.histogram], updateOverlays, { defer: true }));
    createEffect(on([() => props.markers, () => props.patterns], updateDecorations, { defer: true }));
  });
  onCleanup(() => chart?.remove());

  return <div class="chart" ref={container} />;
}

function withOpacity(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (match === null) return color;
  const [r, g, b] = match.slice(1).map((h) => Number.parseInt(h, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
