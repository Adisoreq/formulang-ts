import { For, Show, createMemo } from "solid-js";
import { type ChartOverlay, StockChart } from "../chart/StockChart";
import { formatColor, parseColor } from "../model/colors";
import type { Diagnostics, IndicatorRun } from "../model/engine";
import { newSeries, problemsOf } from "../model/indicators";
import { indicatorIndex, resetIndicator, setState, state } from "../model/state";
import type { FillMode, SeriesMode } from "../model/types";
import { Problems } from "./Output";
import { ParameterTable, ParameterValues } from "./Parameters";

const FILL_MODES: readonly FillMode[] = ["line", "area", "baseline", "histogram"];
const SERIES_MODES: readonly { readonly value: SeriesMode; readonly label: string }[] = [
  { value: "single", label: "single series – a Number per candle" },
  { value: "multiple", label: "multiple series – an Object with a Number per series" },
];

const text = (event: Event): string => (event.currentTarget as HTMLInputElement).value;
const number = (event: Event): number => Number((event.currentTarget as HTMLInputElement).value);

/** The selected indicator and its index in the state. */
function selected() {
  const index = () => indicatorIndex(state.selected.indicator);
  return { index, config: () => state.indicators[index()]! };
}

/** Definition of the selected indicator, below the formula: name, registry id, mode, parameters and series. */
export function IndicatorEditor() {
  const { index, config } = selected();
  const problems = createMemo(() => problemsOf(config(), state.indicators));
  const set = (...path: unknown[]): void => (setState as (...args: unknown[]) => void)("indicators", index(), ...path);

  return (
    <div class="config indicator-editor">
      <div class="config-row">
        <label class="field grow">
          <span class="field-label">Name</span>
          <input type="text" value={config().name} onInput={(e) => set("name", text(e))} />
        </label>
        <label class="field">
          <span class="field-label">Registry id</span>
          <input type="text" class="mono" value={config().indicatorId} onInput={(e) => set("indicatorId", text(e))} />
        </label>
        <label class="field">
          <span class="field-label">Type</span>
          <select value={config().type} onChange={(e) => set("type", e.currentTarget.value)}>
            <option value="normal">normal – over the candles</option>
            <option value="oscillator">oscillator – in a separate pane</option>
          </select>
        </label>
      </div>
      <div class="config-row">
        <label class="field grow">
          <span class="field-label">Description</span>
          <input type="text" value={config().description} onInput={(e) => set("description", text(e))} />
        </label>
        <label class="field">
          <span class="field-label">Series mode</span>
          <select value={config().seriesMode} onChange={(e) => set("seriesMode", e.currentTarget.value)}>
            <For each={SERIES_MODES}>{(mode) => <option value={mode.value}>{mode.label}</option>}</For>
          </select>
        </label>
      </div>
      <p class="config-note">
        Other formulas load it with <code>LOAD_INDICATOR("{config().indicatorId}")</code>, with the default values of
        its parameters.
      </p>

      <ParameterTable parameters={config().parameters} set={(...path) => set("parameters", ...path)} kind="indicator" />

      <section class="editor-section">
        <header>
          <span class="field-label">Series</span>
          <span class="muted">style and colors are set below the chart</span>
          <button
            type="button"
            class="ghost"
            onClick={() => set("series", (s: unknown[]) => [...s, newSeries(config())])}
          >
            + Add series
          </button>
        </header>
        <Show when={config().series.length > 0} fallback={<p class="empty">The indicator has no series.</p>}>
          <table class="series-table edit-table">
            <thead>
              <tr>
                <th>Id</th>
                <th>Name</th>
                <th>Description</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <For each={config().series}>
                {(series, i) => (
                  <tr>
                    <td>
                      <input
                        type="text"
                        class="mono"
                        value={series.id}
                        aria-label="Series id"
                        onInput={(e) => set("series", i(), "id", text(e))}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={series.name}
                        aria-label="Series name"
                        onInput={(e) => set("series", i(), "name", text(e))}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={series.description}
                        aria-label="Series description"
                        onInput={(e) => set("series", i(), "description", text(e))}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        class="remove"
                        title="Remove the series"
                        aria-label={`Remove series ${series.id}`}
                        onClick={() => set("series", (s: unknown[]) => s.filter((_, j) => j !== i()))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
        <Show when={config().seriesMode === "single" && config().series.length > 1}>
          <p class="config-note">In the single series mode every series draws the same Number.</p>
        </Show>
        <Show when={config().seriesMode === "multiple"}>
          <p class="config-note">
            The formula returns an Object whose keys are the ids of the series, e.g.{" "}
            <code>{`{ ${config()
              .series.map((s) => `${s.id}: …`)
              .join(", ")} }`}</code>
            .
          </p>
        </Show>
      </section>

      <Show when={problems().length > 0}>
        <ul class="config-problems" role="alert">
          <For each={problems()}>{(problem) => <li>{problem}</li>}</For>
          <li class="muted">Until they are fixed, the indicator is not in the registry.</li>
        </ul>
      </Show>
      <div class="config-actions">
        <button type="button" class="link" onClick={() => resetIndicator(config().id)}>
          restore the definition of the example
        </button>
      </div>
    </div>
  );
}

/** Chart of the selected indicator, the style of its series and the values of its parameters. */
export function IndicatorOutput(props: { readonly run: IndicatorRun; readonly diagnostics: Diagnostics }) {
  const { index, config } = selected();
  const set = (...path: unknown[]): void => (setState as (...args: unknown[]) => void)("indicators", index(), ...path);

  // A copy of every series, so a change of a color redraws the chart
  const overlays = createMemo<ChartOverlay[]>(() =>
    config().series.map((series) => ({
      config: { ...series },
      values: props.run.series[series.id] ?? [],
      pane: config().type === "oscillator" ? 1 : 0,
    })),
  );
  const empty = () =>
    props.run.error === undefined &&
    overlays().length > 0 &&
    overlays().every((o) => o.values.every((v) => v === null));
  const lastValue = (values: readonly (number | null)[]): string => {
    const value = [...values].reverse().find((v) => v !== null);
    return value === undefined || value === null ? "—" : value.toFixed(2);
  };

  return (
    <>
      <StockChart candles={state.candles} overlays={props.run.error === undefined ? overlays() : []} />
      <Problems diagnostics={props.diagnostics} error={props.run.error} />
      <Show when={props.run.error !== undefined || empty()}>
        <p class="note">
          <Show when={empty()}>The indicator has no value for any candle: every result is null. </Show>
          An indicator gives <code>null</code>, a Number or an Object of Numbers for every candle.{" "}
          <code>LOAD_INDICATOR(id)</code> returns the whole series (an Array with a value per candle): take the value of
          the current candle with <code>[I]</code>, e.g. <code>LOAD_INDICATOR("SMA")[I]</code>.
        </p>
      </Show>

      <div class="legend">
        <For each={config().series}>
          {(series, i) => {
            const fill = () => parseColor(series.fillColor);
            const values = () => props.run.series[series.id] ?? [];
            return (
              <div class="legend-item editable" title={series.description}>
                <label class="color" title="Line color">
                  <input
                    type="color"
                    value={parseColor(series.lineColor).hex}
                    aria-label={`Line color of ${series.name}`}
                    onInput={(e) => set("series", i(), "lineColor", text(e))}
                  />
                </label>
                <span class="legend-name">
                  {series.name} <code class="muted">{series.id}</code>
                </span>
                <select
                  value={series.fillMode}
                  aria-label={`Fill mode of ${series.name}`}
                  onChange={(e) => set("series", i(), "fillMode", e.currentTarget.value)}
                >
                  <For each={FILL_MODES}>{(mode) => <option value={mode}>{mode}</option>}</For>
                </select>
                <span class="fill" classList={{ disabled: series.fillMode === "line" }} title="Fill color and opacity">
                  <input
                    type="color"
                    value={fill().hex}
                    disabled={series.fillMode === "line"}
                    aria-label={`Fill color of ${series.name}`}
                    onInput={(e) => set("series", i(), "fillColor", formatColor(text(e), Math.max(fill().alpha, 0.05)))}
                  />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(fill().alpha * 100)}
                    disabled={series.fillMode === "line"}
                    aria-label={`Fill opacity of ${series.name}`}
                    onInput={(e) => set("series", i(), "fillColor", formatColor(fill().hex, number(e) / 100))}
                  />
                </span>
                <strong>{lastValue(values())}</strong>
              </div>
            );
          }}
        </For>
      </div>

      <ParameterValues parameters={config().parameters} set={(...path) => set("parameters", ...path)} />
    </>
  );
}
