import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import type { Diagnostics, TimeRun } from "../model/engine";
import { setState, state } from "../model/state";
import { TimeSession } from "../model/time-session";
import { Problems } from "./Output";

const PLOT_WIDTH = 400;
const PLOT_HEIGHT = 120;

/** Time Context: plays the frames of the formula as time passes; the result of the last frame and a plot of the numbers. */
export function TimeOutput(props: { readonly run: TimeRun; readonly diagnostics: Diagnostics }) {
  const session = () => props.run.session;
  // The session is mutable: every change of its frames bumps the version, which the view reads
  const [version, setVersion] = createSignal(0);
  const changed = (): void => {
    setVersion((v) => v + 1);
  };
  const [playing, setPlaying] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const last = () => (version(), session().last);
  const failed = () => (version(), session().failed);
  const output = () =>
    session().preparationError?.toString() ?? last()?.result.toString() ?? "Press Play to execute the frames.";

  const numbers = createMemo(() => {
    version();
    return session()
      .frames.map((f) => (f.result.successful && typeof f.result.value.raw === "number" ? f.result.value.raw : NaN))
      .filter((n) => Number.isFinite(n));
  });

  /** Points of the polyline when the frames return Numbers; `undefined` otherwise. */
  const plot = createMemo(() => {
    const values = numbers();
    if (values.length < 2) return undefined;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min === 0 ? 1 : max - min;
    const step = PLOT_WIDTH / (TimeSession.historyLimit - 1);
    const offset = TimeSession.historyLimit - values.length;
    return values
      .map((n, i) => {
        const x = (offset + i) * step;
        const y = PLOT_HEIGHT - 4 - ((n - min) / range) * (PLOT_HEIGHT - 8);
        return `${round(x)},${round(y)}`;
      })
      .join(" ");
  });

  const recent = () => (version(), [...session().frames].reverse().slice(0, 30));

  function stop(): void {
    clearTimeout(timer);
    timer = undefined;
    setPlaying(false);
  }

  /**
   * Executes a frame at every tick of the timer. The delta time is measured, so it follows the real time even when a
   * frame takes longer than the interval. The frames stop at the first Error.
   */
  function start(): void {
    const current = session();
    if (current.failed && current.preparationError === undefined) current.reset();
    setPlaying(true);
    const started = performance.now();
    let previous = 0;
    const tick = (): void => {
      const now = (performance.now() - started) / 1000;
      current.advance(now - previous);
      previous = now;
      changed();
      if (current.failed) {
        stop();
        return;
      }
      timer = setTimeout(tick, 1000 / Math.max(1, state.framesPerSecond));
    };
    tick();
  }

  const toggle = (): void => (playing() ? stop() : start());

  const step = (): void => {
    session().advance(1 / state.framesPerSecond);
    changed();
  };

  const restart = (): void => {
    const wasPlaying = playing() || session().failed;
    stop();
    session().reset();
    changed();
    if (wasPlaying && session().preparationError === undefined) start();
  };

  // A new formula (or a new environment) gives a new session: start playing it
  createEffect(
    on(session, (current) => {
      stop();
      changed();
      if (current.preparationError === undefined) start();
    }),
  );
  onCleanup(stop);

  return (
    <>
      <div class="time-controls">
        <button type="button" class="primary" disabled={session().preparationError !== undefined} onClick={toggle}>
          {playing() ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button
          type="button"
          class="ghost"
          disabled={playing() || session().preparationError !== undefined}
          onClick={step}
        >
          Step
        </button>
        <button type="button" class="ghost" onClick={restart}>
          Reset
        </button>
        <label class="inline">
          fps
          <input
            type="number"
            min="1"
            max="60"
            value={state.framesPerSecond}
            onChange={(e) => {
              const value = Number(e.currentTarget.value);
              setState("framesPerSecond", Number.isFinite(value) ? Math.min(60, Math.max(1, Math.round(value))) : 20);
            }}
          />
        </label>
      </div>

      <dl class="frame-constants">
        <div>
          <dt>frame #</dt>
          <dd>{last()?.frame ?? "—"}</dd>
        </div>
        <div>
          <dt>TIME_S</dt>
          <dd>{last()?.timeSeconds.toFixed(3) ?? "—"}</dd>
        </div>
        <div>
          <dt>DTIME_MS</dt>
          <dd>{last() === undefined ? "—" : (last()!.deltaSeconds * 1000).toFixed(1)}</dd>
        </div>
        <div>
          <dt>frames</dt>
          <dd>{(version(), session().frameCount)}</dd>
        </div>
      </dl>

      <div class="console" classList={{ failed: failed() }}>
        <span class="prompt">{last() === undefined ? "›" : `frame #${last()!.frame} ›`}</span>
        <pre>{(version(), output())}</pre>
      </div>
      <Show when={last()?.result.successful === false && session().preparationError === undefined}>
        <p class="note">The frames stopped: the last frame results in an Error. Reset to start again.</p>
      </Show>
      <Problems diagnostics={props.diagnostics} />

      <Show when={plot()}>
        {(points) => (
          <figure class="time-plot">
            <svg
              viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label="Numbers returned by the last frames"
            >
              <polyline points={points()} />
            </svg>
            <figcaption>
              <span class="muted">last {numbers().length} frames</span>
              <span class="muted">
                min {Math.min(...numbers()).toFixed(2)} · max {Math.max(...numbers()).toFixed(2)}
              </span>
            </figcaption>
          </figure>
        )}
      </Show>

      <details class="panel" open>
        <summary>Last frames</summary>
        <ol class="iterations">
          <For each={recent()} fallback={<li class="muted">No frames yet.</li>}>
            {(record) => (
              <li classList={{ failed: !record.result.successful }}>
                <span class="index">{record.frame}</span>
                <span class="value">
                  {record.timeSeconds.toFixed(2)} s · {record.result.toString()}
                </span>
              </li>
            )}
          </For>
        </ol>
      </details>
    </>
  );
}

const round = (value: number): string => String(Math.round(value * 100) / 100);
