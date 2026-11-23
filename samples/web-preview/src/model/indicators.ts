/**
 * Indicators edited in the preview: mutable copies of the example configurations, and the rules shared by the
 * definitions of the registry (indicators and patterns).
 */
import { IdentifierValidator } from "formulang-ts";
import type { FillMode, IndicatorConfig, IndicatorParameterConfig, IndicatorType, SeriesMode } from "./types";

/** A parameter of a definition of the registry (an indicator or a pattern). */
export interface IndicatorParameterDraft {
  /** Key in `PARAMETERS`. */
  id: string;
  name: string;
  /** Default value of the definition in the registry (used by `LOAD_INDICATOR(id)` and `LOAD_PATTERN(id)`). */
  defaultValue: number;
  /** Value set in the preview, used for the chart of the indicator or the pattern. */
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
  /** Identifier in the registry: `LOAD_INDICATOR("SMA")`. */
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
    parameters: parameterDraftsOf(config.parameters),
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

/**
 * Problems of the definition of an indicator. An indicator with problems is not in the registry, so
 * `LOAD_INDICATOR(id)` returns `INVALID_KEY_ERROR` for it.
 */
export function problemsOf(draft: IndicatorDraft, all: readonly IndicatorDraft[]): string[] {
  const problems = registryProblems(
    draft.indicatorId,
    "indicator",
    all.filter((other) => other !== draft).map((other) => other.indicatorId),
    draft.parameters,
  );
  if (draft.series.length === 0) problems.push("The indicator has no series to draw.");
  for (const s of draft.series) {
    if (!IdentifierValidator.validate(s.id))
      problems.push(`Series id "${s.id}" is not a valid identifier (^[a-zA-Z_]\\w*$).`);
  }
  for (const id of duplicates(draft.series.map((s) => s.id)))
    problems.push(`Series id "${id}" is defined more than once.`);
  return problems;
}

// Rules shared by the definitions of the registry: indicators and patterns

export function parameterDraftsOf(parameters: readonly IndicatorParameterConfig[]): IndicatorParameterDraft[] {
  return parameters.map((p) => ({ ...p, value: p.defaultValue }));
}

/** A new parameter with a free id. */
export function newParameter(parameters: readonly IndicatorParameterDraft[]): IndicatorParameterDraft {
  const id = freeId(
    "param",
    parameters.map((p) => p.id),
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
 * Problems of the registry id and of the parameters of a definition.
 *
 * @param otherIds Registry ids of the other definitions of the same part of the registry.
 */
export function registryProblems(
  registryId: string,
  kind: string,
  otherIds: readonly string[],
  parameters: readonly IndicatorParameterDraft[],
): string[] {
  const problems: string[] = [];
  const identifier = (value: string, what: string): void => {
    if (!IdentifierValidator.validate(value))
      problems.push(`${what} "${value}" is not a valid identifier (^[a-zA-Z_]\\w*$).`);
  };
  identifier(registryId, "Registry id");
  if (otherIds.includes(registryId)) problems.push(`Registry id "${registryId}" is used by another ${kind}.`);
  for (const p of parameters) {
    identifier(p.id, "Parameter id");
    if (!Number.isFinite(p.defaultValue)) problems.push(`Parameter "${p.id}" has no valid default value.`);
  }
  for (const id of duplicates(parameters.map((p) => p.id)))
    problems.push(`Parameter id "${id}" is defined more than once.`);
  return problems;
}
