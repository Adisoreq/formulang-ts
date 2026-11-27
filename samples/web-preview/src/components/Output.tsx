import { For, Show, createEffect, createSignal, on } from "solid-js";
import type { IError } from "formulang-ts";
import type { DefaultRun, Diagnostics, IterationRun } from "../model/engine";

/**
 * Validation errors, or the error that stopped a stage; the warnings of the preparation (Core 1.2), which never
 * change the result; and the metadata block of the formula.
 */
export function Problems(props: { readonly diagnostics: Diagnostics; readonly error?: IError | undefined }) {
  return (
    <>
      <Show when={props.diagnostics.validationErrors.length > 0 || props.error !== undefined}>
        <div class="problems" role="alert">
          <For each={props.diagnostics.validationErrors}>{(error) => <p>{error.toString()}</p>}</For>
          <Show when={props.diagnostics.validationErrors.length === 0 && props.error}>
            {(error) => <p>{error().toString()}</p>}
          </Show>
        </div>
      </Show>
      <Show when={props.diagnostics.warnings.length > 0}>
        <div class="warnings">
          <For each={props.diagnostics.warnings}>
            {(warning) => (
              <p>
                <span class="warning-code">{warning.code}</span>{" "}
                <span class="muted">
                  {warning.line}:{warning.column}
                </span>{" "}
                {warning.message}
              </p>
            )}
          </For>
        </div>
      </Show>
      <Show when={props.diagnostics.metadata}>
        {(metadata) => (
          <details class="panel">
            <summary>Metadata of the formula</summary>
            <pre class="metadata">{metadata()}</pre>
          </details>
        )}
      </Show>
    </>
  );
}

function Sequences(props: { readonly sequences: readonly string[] }) {
  return (
    <details class="panel" open>
      <summary>Sequences, parsed and translated</summary>
      <Show when={props.sequences.length > 0} fallback={<p class="empty">The formula does not parse.</p>}>
        <ol class="sequences">
          <For each={props.sequences}>{(key) => <li>{key}</li>}</For>
        </ol>
      </Show>
    </details>
  );
}

/** Default Context: the result in a console, the sequences and the variables of the execution. */
export function ConsoleView(props: { readonly run: DefaultRun; readonly diagnostics: Diagnostics }) {
  return (
    <>
      <div class="console" classList={{ failed: !props.run.execution.successful }}>
        <span class="prompt">result ›</span>
        <pre>{props.run.execution.toString()}</pre>
      </div>
      <Show when={props.run.execution.validationErrors.length > 0}>
        <Problems diagnostics={props.diagnostics} />
      </Show>
      <Sequences sequences={props.diagnostics.sequences} />
      <details class="panel" open>
        <summary>Variables of the execution</summary>
        <table class="variables">
          <tbody>
            <For each={props.run.variables}>
              {(row) => (
                <tr classList={{ changed: row.changed }}>
                  <td>{row.name}</td>
                  <td>{row.value}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </details>
    </>
  );
}

interface IterationsViewProps {
  readonly run: IterationRun;
  readonly diagnostics: Diagnostics;
  /** Called with the index of the shown iteration. */
  readonly onSelect?: (index: number) => void;
  readonly label?: (index: number) => string;
}

/** Iteration Context: a slider over the iterations and the result of the chosen one. */
export function IterationsView(props: IterationsViewProps) {
  const [index, setIndex] = createSignal(0);
  const last = () => Math.max(0, props.run.results.length - 1);
  const shown = () => Math.min(index(), last());

  createEffect(
    on(
      () => props.run,
      () => setIndex((i) => Math.min(i, last())),
    ),
  );
  createEffect(() => props.onSelect?.(shown()));

  const result = () => props.run.results[shown()];
  const failedEarly = () => props.run.results.length < props.run.count;

  return (
    <>
      <div class="slider">
        <label for="iteration">
          Iteration <strong>I = {shown()}</strong> <span class="muted">of N = {props.run.count}</span>
        </label>
        <input
          id="iteration"
          type="range"
          min="0"
          max={last()}
          value={shown()}
          disabled={props.run.results.length < 2}
          onInput={(e) => setIndex(Number(e.currentTarget.value))}
        />
        <Show when={props.label}>{(label) => <span class="muted">{label()(shown())}</span>}</Show>
      </div>
      <div class="console" classList={{ failed: result()?.successful === false }}>
        <span class="prompt">I = {shown()} ›</span>
        <pre>{result()?.toString() ?? "No iterations."}</pre>
      </div>
      <Show when={failedEarly() && props.run.results.length > 0}>
        <p class="note">The iterations stopped at I = {props.run.results.length - 1}: its result is an Error.</p>
      </Show>
      <Problems diagnostics={props.diagnostics} />
      <details class="panel" open>
        <summary>All iterations</summary>
        <ol class="iterations" start="0">
          <For each={props.run.results}>
            {(r, i) => (
              <li classList={{ active: i() === shown(), failed: !r.successful }} onClick={() => setIndex(i())}>
                <span class="index">{i()}</span>
                <span class="value">{r.toString()}</span>
              </li>
            )}
          </For>
        </ol>
      </details>
    </>
  );
}
