import { For, Show, createMemo } from "solid-js";
import { type ChartMarker, type ChartPattern, StockChart } from "../chart/StockChart";
import { type Diagnostics, type PatternRun, type StrategyRun, proposalOf } from "../model/engine";
import {
  MAX_PATTERN_LENGTH,
  initials,
  patternLength,
  patternProblems,
  strategyProblems,
} from "../model/patterns-strategies";
import { patternIndex, resetPattern, resetStrategy, setState, state, strategyIndex } from "../model/state";
import { Problems } from "./Output";
import { ParameterTable, ParameterValues } from "./Parameters";

const COLORS = { green: "#2fbf71", red: "#e5534b" } as const;

const text = (event: Event): string => (event.currentTarget as HTMLInputElement).value;
const number = (event: Event): number => Number((event.currentTarget as HTMLInputElement).value);
const dateOf = (index: number): string => new Date(state.candles[index]?.time ?? 0).toISOString().slice(0, 10);

type Setter = (...path: unknown[]) => void;
const setPattern: Setter = (...path) => (setState as Setter)("patterns", patternIndex(state.selected.pattern), ...path);
const setStrategy =
  (index: number): Setter =>
  (...path) =>
    (setState as Setter)("strategies", index, ...path);

function ProblemList(props: { readonly problems: readonly string[]; readonly note?: string }) {
  return (
    <Show when={props.problems.length > 0}>
      <ul class="config-problems" role="alert">
        <For each={props.problems}>{(problem) => <li>{problem}</li>}</For>
        <Show when={props.note}>{(note) => <li class="muted">{note()}</li>}</Show>
      </ul>
    </Show>
  );
}

// Patterns

const pattern = () => state.patterns[patternIndex(state.selected.pattern)]!;

/** Definition of the selected pattern, below the formula. */
export function PatternEditor() {
  return (
    <div class="config indicator-editor">
      <div class="config-row">
        <label class="field grow">
          <span class="field-label">Name</span>
          <input type="text" value={pattern().name} onInput={(e) => setPattern("name", text(e))} />
        </label>
        <label class="field">
          <span class="field-label">Registry id</span>
          <input
            type="text"
            class="mono"
            value={pattern().patternId}
            onInput={(e) => setPattern("patternId", text(e))}
          />
        </label>
        <label class="field">
          <span class="field-label">Type</span>
          <select value={pattern().type} onChange={(e) => setPattern("type", e.currentTarget.value)}>
            <option value="bullish">bullish</option>
            <option value="bearish">bearish</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">Candles</span>
          <input
            type="number"
            min="1"
            max={MAX_PATTERN_LENGTH}
            step="1"
            value={pattern().length}
            onInput={(e) => setPattern("length", number(e))}
          />
        </label>
      </div>
      <div class="config-row">
        <label class="field grow">
          <span class="field-label">Description</span>
          <input type="text" value={pattern().description} onInput={(e) => setPattern("description", text(e))} />
        </label>
      </div>
      <p class="config-note">
        The formula returns <code>true</code> for the candle where the pattern ends; its rectangle covers that candle
        and the {pattern().length - 1} before it. The color and the label are set below the chart. Other formulas load
        it with <code>LOAD_PATTERN("{pattern().patternId}")</code>, with the default values of its parameters.
      </p>

      <ParameterTable
        parameters={pattern().parameters}
        set={(...path) => setPattern("parameters", ...path)}
        kind="pattern"
      />

      <ProblemList
        problems={patternProblems(pattern(), state.patterns)}
        note="Until they are fixed, the pattern is not in the registry."
      />
      <div class="config-actions">
        <button type="button" class="link" onClick={() => resetPattern(pattern().id)}>
          restore the definition of the example
        </button>
      </div>
    </div>
  );
}

/** Chart with a rectangle around every occurrence, the appearance of the pattern and the occurrences. */
export function PatternOutput(props: { readonly run: PatternRun; readonly diagnostics: Diagnostics }) {
  const length = () => patternLength(pattern());
  const patterns = createMemo<ChartPattern[]>(() =>
    props.run.indices.map((index) => ({
      from: Math.max(0, index - length() + 1),
      to: index,
      color: COLORS[pattern().color],
      label: pattern().showLabel ? initials(pattern().name) : "",
    })),
  );
  return (
    <>
      <StockChart candles={state.candles} patterns={patterns()} />
      <Problems diagnostics={props.diagnostics} error={props.run.error} />
      <div class="legend">
        <div class="legend-item appearance">
          <span class={`swatch swatch-${pattern().color}`} />
          <span class="legend-name">
            {pattern().name} <span class={`pill pill-${pattern().type}`}>{pattern().type}</span>
          </span>
          <select
            value={pattern().color}
            aria-label="Color of the rectangles"
            onChange={(e) => setPattern("color", e.currentTarget.value)}
          >
            <option value="green">green</option>
            <option value="red">red</option>
          </select>
          <label class="inline">
            <input
              type="checkbox"
              checked={pattern().showLabel}
              onChange={(e) => setPattern("showLabel", e.currentTarget.checked)}
            />
            label <code>{initials(pattern().name)}</code>
          </label>
          <strong>{props.run.indices.length}×</strong>
        </div>
      </div>
      <ol class="occurrences">
        <For each={props.run.indices} fallback={<li class="muted">No occurrences.</li>}>
          {(index) => (
            <li>
              <span class="index">#{index}</span> {dateOf(index)} · close {state.candles[index]?.close.toFixed(2)}
            </li>
          )}
        </For>
      </ol>
      <ParameterValues parameters={pattern().parameters} set={(...path) => setPattern("parameters", ...path)} />
    </>
  );
}

// Strategies

const strategy = () => state.strategies[strategyIndex(state.selected.strategy)]!;

/** Definition of the selected strategy, below the formula. */
export function StrategyEditor() {
  const set = (...path: unknown[]): void => setStrategy(strategyIndex(state.selected.strategy))(...path);
  return (
    <div class="config indicator-editor">
      <div class="config-row">
        <label class="field grow">
          <span class="field-label">Name</span>
          <input type="text" value={strategy().name} onInput={(e) => set("name", text(e))} />
        </label>
        <label class="field">
          <span class="field-label">Confidence</span>
          <input
            type="number"
            step="0.1"
            min="0"
            value={strategy().confidence}
            onInput={(e) => set("confidence", number(e))}
          />
        </label>
        <label class="field">
          <span class="field-label">Lifetime</span>
          <input
            type="number"
            step="1"
            min="1"
            value={strategy().lifetime}
            onInput={(e) => set("lifetime", number(e))}
          />
        </label>
      </div>
      <div class="config-row">
        <label class="field grow">
          <span class="field-label">Description</span>
          <input type="text" value={strategy().description} onInput={(e) => set("description", text(e))} />
        </label>
      </div>
      <p class="config-note">
        The formula returns a signal from <code>SELL</code> (-1) to <code>BUY</code> (1) for every candle. Confidence
        (default 1.0) and lifetime (whole number of candles) are the defaults of the definition; the values used by the
        proposal, the activity and the label are set below the chart.
      </p>
      <ProblemList problems={strategyProblems(strategy())} />
      <div class="config-actions">
        <button type="button" class="link" onClick={() => resetStrategy(strategy().id)}>
          restore the definition of the example
        </button>
      </div>
    </div>
  );
}

/** Chart with the signals of the active strategies, the final proposal and the values of every strategy. */
export function StrategyOutput(props: { readonly run: StrategyRun; readonly diagnostics: Diagnostics }) {
  const weights = (id: string) => state.strategies.find((s) => s.id === id)?.runtime;
  // Recomputed from the signals: a change of a weight needs no new execution
  const result = createMemo(() =>
    proposalOf(
      props.run.strategies,
      (id) => {
        const w = weights(id);
        return w === undefined ? undefined : { active: w.active, confidence: w.confidence, lifetime: w.lifetime };
      },
      state.candles.length,
    ),
  );
  const markers = createMemo<ChartMarker[]>(() =>
    state.strategies
      .filter((s) => s.runtime.active)
      .flatMap((s) =>
        (result().values.get(s.id)?.weighted ?? []).flatMap((signal, index): ChartMarker[] => {
          if (signal === null || signal === 0) return [];
          const buy = signal > 0;
          return [
            {
              index,
              position: buy ? "belowBar" : "aboveBar",
              shape: buy ? "arrowUp" : "arrowDown",
              color: buy ? COLORS.green : COLORS.red,
              text: s.label,
            },
          ];
        }),
      ),
  );
  const final = () => result().proposal.at(-1) ?? 0;
  const verdict = () => (final() > 0.05 ? "BUY" : final() < -0.05 ? "SELL" : "NEUTRAL");
  const signalsOf = (id: string) => props.run.strategies.find((s) => s.id === id);
  const error = () => signalsOf(state.selected.strategy)?.error;
  const selectedName = () => state.strategies.find((s) => s.id === state.selected.strategy)?.name ?? "";
  // Stock 1.2: the last signal object of the selected strategy, with its reason and checks
  const lastDetails = () => {
    const details = signalsOf(state.selected.strategy)?.details ?? [];
    for (let index = details.length - 1; index >= 0; index--) {
      const d = details[index];
      if (d !== undefined) return { index, details: d };
    }
    return undefined;
  };

  return (
    <>
      <StockChart
        candles={state.candles}
        markers={markers()}
        histogram={{ label: "Proposal", values: result().proposal }}
      />
      <Problems diagnostics={props.diagnostics} error={error()} />
      <div class={`proposal proposal-${verdict().toLowerCase()}`}>
        <span class="proposal-arrow" aria-hidden="true">
          {verdict() === "BUY" ? "▲" : verdict() === "SELL" ? "▼" : "◆"}
        </span>
        <div>
          <div class="proposal-label">Final proposal · {dateOf(state.candles.length - 1)}</div>
          <div class="proposal-value">
            {verdict()}{" "}
            <span>
              {final() >= 0 ? "+" : ""}
              {final().toFixed(2)}
            </span>
          </div>
        </div>
      </div>
      <table class="series-table strategies">
        <thead>
          <tr>
            <th>Active</th>
            <th>Strategy</th>
            <th>Label</th>
            <th>Confidence</th>
            <th>Lifetime</th>
            <th>Signals</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <For each={state.strategies}>
            {(s, i) => {
              const set = (...path: unknown[]): void => setStrategy(i())(...path);
              const signals = () => signalsOf(s.id);
              return (
                <tr classList={{ inactive: !s.runtime.active, selected: s.id === state.selected.strategy }}>
                  <td>
                    <input
                      type="checkbox"
                      checked={s.runtime.active}
                      aria-label={`${s.name} active`}
                      onChange={(e) => set("runtime", "active", e.currentTarget.checked)}
                    />
                  </td>
                  <td>
                    <button type="button" class="link" onClick={() => setState("selected", "strategy", s.id)}>
                      {s.name}
                    </button>
                  </td>
                  <td>
                    <input
                      type="text"
                      class="mono label-input"
                      maxlength="6"
                      value={s.label}
                      aria-label={`Marker label of ${s.name}`}
                      onInput={(e) => set("label", text(e))}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={s.runtime.confidence}
                      aria-label={`Confidence of ${s.name}`}
                      onInput={(e) => set("runtime", "confidence", Math.max(0, number(e) || 0))}
                    />
                    <Show when={s.runtime.confidence !== s.confidence}>
                      <button
                        type="button"
                        class="link small"
                        onClick={() => set("runtime", "confidence", s.confidence)}
                      >
                        default {s.confidence}
                      </button>
                    </Show>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={s.runtime.lifetime}
                      aria-label={`Lifetime of ${s.name}`}
                      onInput={(e) => set("runtime", "lifetime", Math.max(1, Math.round(number(e) || 1)))}
                    />
                    <Show when={s.runtime.lifetime !== s.lifetime}>
                      <button type="button" class="link small" onClick={() => set("runtime", "lifetime", s.lifetime)}>
                        default {s.lifetime}
                      </button>
                    </Show>
                  </td>
                  <td>{signals()?.signals.filter((v) => v !== null && v !== 0).length ?? 0}</td>
                  <td>
                    <Show
                      when={signals()?.error === undefined}
                      fallback={<span class="error-text">{signals()?.error?.name}</span>}
                    >
                      {(result().values.get(s.id)?.active.at(-1) ?? 0).toFixed(2)}
                    </Show>
                  </td>
                </tr>
              );
            }}
          </For>
        </tbody>
      </table>
      <p class="config-note">
        Value of a strategy = its signal (-1 … 1) × confidence, active for <em>lifetime</em> candles. The final proposal
        is the sum of the values of the active strategies.
      </p>
      <Show when={lastDetails()}>
        {(details) => (
          <details class="panel signal-details" open>
            <summary>
              Signal object of {selectedName()} · {dateOf(details().index)}
            </summary>
            <Show when={details().details.reason}>{(reason) => <p>{reason()}</p>}</Show>
            <ul>
              <For each={Object.entries(details().details.checks ?? {})}>
                {([key, passed]) => (
                  <li class={passed ? "check-true" : "check-false"}>
                    {passed ? "✓" : "✗"} {key}
                  </li>
                )}
              </For>
              <For each={Object.entries(details().details.extra)}>
                {([key, value]) => (
                  <li class="muted">
                    {key}: {JSON.stringify(value)}
                  </li>
                )}
              </For>
            </ul>
          </details>
        )}
      </Show>
    </>
  );
}
