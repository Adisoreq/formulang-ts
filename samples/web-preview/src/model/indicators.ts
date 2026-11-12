/**
 * Indicators edited in the preview: mutable copies of the example configurations.
 */
import { IdentifierValidator } from "formulang-ts";
import type { FillMode, IndicatorConfig, IndicatorType, SeriesMode } from "./types";

export interface IndicatorParameterDraft {
  /** Key in `PARAMETERS`. */
  id: string;
  name: string;
  /** Default value of the definition in the registry (used by `INDICATOR(id)` in other formulas). */
  defaultValue: number;
  /** Value set in the preview, used for the chart of the indicator. */
  value: number;
}

export interface SeriesDraft {
  id: string;
  name: string;
  description: string;
  lineColor: string;
  fillColor: string;
  fillMode: FillMode;
}

export interface IndicatorDraft {
  /** Key of the indicator in the preview (not editable). */
  readonly id: string;
  /** Identifier in the registry: `INDICATOR("SMA")`. */
  indicatorId: string;
  name: string;
  description: string;
  parameters: IndicatorParameterDraft[];
  series: SeriesDraft[];
  seriesMode: SeriesMode;
  type: IndicatorType;
}

export function draftOf(config: IndicatorConfig): IndicatorDraft {
  return {
    id: config.id,
    indicatorId: config.indicatorId,
    name: config.name,
    description: config.description,
    parameters: config.parameters.map((p) => ({ ...p, value: p.defaultValue })),
    series: config.series.map((s) => ({ ...s })),
    seriesMode: config.seriesMode,
    type: config.type,
  };
}

const SERIES_COLORS = ["#e9c46a", "#4be39a", "#7aa2f7", "#ff8f70", "#c9a7ff", "#8ecae6"];

/** A new series with a free id and the next color. */
export function newSeries(draft: IndicatorDraft): SeriesDraft {
  const id = freeId(
    "series",
    draft.series.map((s) => s.id),
  );
  const color = SERIES_COLORS[draft.series.length % SERIES_COLORS.length]!;
  return { id, name: id, description: "", lineColor: color, fillColor: "transparent", fillMode: "line" };
}

/** A new parameter with a free id. */
export function newParameter(draft: IndicatorDraft): IndicatorParameterDraft {
  const id = freeId(
    "param",
    draft.parameters.map((p) => p.id),
  );
  return { id, name: id, defaultValue: 1, value: 1 };
}

function freeId(prefix: string, used: readonly string[]): string {
  for (let i = used.length + 1; ; i++) if (!used.includes(`${prefix}${i}`)) return `${prefix}${i}`;
}

function duplicates(values: readonly string[]): string[] {
  return [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];
}

/**
 * Problems of the definition of an indicator. An indicator with problems is not in the registry, so
 * `INDICATOR(id)` returns `INVALID_KEY_ERROR` for it.
 */
export function problemsOf(draft: IndicatorDraft, all: readonly IndicatorDraft[]): string[] {
  const problems: string[] = [];
  const identifier = (value: string, what: string): void => {
    if (!IdentifierValidator.validate(value))
      problems.push(`${what} "${value}" is not a valid identifier (^[a-zA-Z_]\\w*$).`);
  };
  identifier(draft.indicatorId, "Registry id");
  if (all.some((other) => other !== draft && other.indicatorId === draft.indicatorId)) {
    problems.push(`Registry id "${draft.indicatorId}" is used by another indicator.`);
  }
  for (const p of draft.parameters) {
    identifier(p.id, "Parameter id");
    if (!Number.isFinite(p.defaultValue)) problems.push(`Parameter "${p.id}" has no valid default value.`);
  }
  for (const id of duplicates(draft.parameters.map((p) => p.id)))
    problems.push(`Parameter id "${id}" is defined more than once.`);
  if (draft.series.length === 0) problems.push("The indicator has no series to draw.");
  for (const s of draft.series) identifier(s.id, "Series id");
  for (const id of duplicates(draft.series.map((s) => s.id)))
    problems.push(`Series id "${id}" is defined more than once.`);
  return problems;
}
