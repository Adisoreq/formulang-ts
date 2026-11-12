import type {
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";

/** A rectangle over the candles from `from` to `to`, between the prices `bottom` and `top`. */
export interface ChartRectangle {
  readonly from: Time;
  readonly to: Time;
  readonly top: number;
  readonly bottom: number;
  readonly color: string;
  readonly label: string;
}

class RectanglesRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly source: RectanglesPrimitive) {}

  draw(target: CanvasRenderingTarget2D): void {
    const { chart, series } = this.source;
    if (chart === undefined || series === undefined) return;
    const timeScale = chart.timeScale();
    const half = timeScale.options().barSpacing / 2 + 2;
    target.useMediaCoordinateSpace(({ context }) => {
      context.font = "600 10px ui-monospace, 'Cascadia Code', Consolas, monospace";
      for (const rect of this.source.rectangles) {
        const x1 = timeScale.timeToCoordinate(rect.from);
        const x2 = timeScale.timeToCoordinate(rect.to);
        const y1 = series.priceToCoordinate(rect.top);
        const y2 = series.priceToCoordinate(rect.bottom);
        if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
        const left = x1 - half;
        const top = y1 - 4;
        const width = x2 - x1 + 2 * half;
        const height = y2 - y1 + 8;
        context.fillStyle = withAlpha(rect.color, 0.14);
        context.fillRect(left, top, width, height);
        context.strokeStyle = withAlpha(rect.color, 0.9);
        context.lineWidth = 1;
        context.setLineDash([4, 3]);
        context.strokeRect(left + 0.5, top + 0.5, width, height);
        context.setLineDash([]);
        context.fillStyle = withAlpha(rect.color, 1);
        context.fillText(rect.label, left, top - 4);
      }
    });
  }
}

class RectanglesView implements IPrimitivePaneView {
  constructor(private readonly source: RectanglesPrimitive) {}

  zOrder(): PrimitivePaneViewZOrder {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer {
    return new RectanglesRenderer(this.source);
  }
}

/** Series primitive that draws rectangles around candle patterns. */
export class RectanglesPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApiBase<Time> | undefined;
  series: ISeriesApi<SeriesType, Time> | undefined;
  rectangles: readonly ChartRectangle[] = [];
  #requestUpdate: (() => void) | undefined;
  readonly #views = [new RectanglesView(this)];

  attached(parameters: SeriesAttachedParameter<Time>): void {
    this.chart = parameters.chart;
    this.series = parameters.series;
    this.#requestUpdate = parameters.requestUpdate;
  }

  detached(): void {
    this.chart = undefined;
    this.series = undefined;
    this.#requestUpdate = undefined;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.#views;
  }

  setRectangles(rectangles: readonly ChartRectangle[]): void {
    this.rectangles = rectangles;
    this.#requestUpdate?.();
  }
}

/** `#rrggbb` with an alpha channel. */
function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (match === null) return color;
  const [r, g, b] = match.slice(1).map((h) => Number.parseInt(h, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
