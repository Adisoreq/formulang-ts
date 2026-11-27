import { For, Match, Show, Switch, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { type ChartMarker, type ChartOverlay, type ChartPattern, StockChart } from "./chart/StockChart";
import { ConfigPanel } from "./components/ConfigPanel";
import { IndicatorOutput } from "./components/IndicatorPanels";
import { PatternOutput, StrategyOutput } from "./components/PatternStrategyPanels";
import { Editor } from "./components/Editor";
import { ConsoleView, IterationsView, Problems } from "./components/Output";
import { Sidebar } from "./components/Sidebar";
import { TimeOutput } from "./components/TimeOutput";
import {
  type DefaultRun,
  type Diagnostics,
  type IndicatorRun,
  type IterationRun,
  type PatternRun,
  type StrategyRun,
  type TimeRun,
  createEnvironment,
  diagnose,
  referenceEnvironment,
  runDefault,
  runIndicator,
  runIterations,
  runPattern,
  runStock,
  runStrategies,
  runTime,
} from "./model/engine";
import { CONTEXTS, EXAMPLES, NEW_FORMULA, formulaKey } from "./model/examples";
import { suggestions, targetOf, vocabulary } from "./model/language";
import { regenerateCandles, resetFormula, selectedFormula, setFormula, setState, state } from "./model/state";
import type { ContextKind, Example } from "./model/types";

type Run = DefaultRun | IterationRun | TimeRun | IndicatorRun | PatternRun | StrategyRun;

interface Execution {
  readonly kind: ContextKind;
  readonly run: Run;
  readonly diagnostics: Diagnostics;
  /** Duration of the execution in milliseconds. */
  readonly duration: number;
}

const STOCK_KINDS: ReadonlySet<ContextKind> = new Set(["stock", "indicator", "pattern", "strategy"]);

/** Executes the formula of the selected example in its context type. */
function execute(): Execution {
  const kind = state.context;
  const formula = selectedFormula(kind);
  const indicators = state.indicators.map((config) => ({
    config,
    formula: state.formulas[formulaKey("indicator", config.id)] ?? "",
  }));
  const patterns = state.patterns.map((config) => ({
    config,
    formula: state.formulas[formulaKey("pattern", config.id)] ?? "",
  }));
  const environment = createEnvironment(indicators, patterns);
  const started = performance.now();
  let run: Run;
  switch (kind) {
    case "default":
      run = runDefault(formula, environment);
      break;
    case "iteration":
      run = runIterations(formula, state.iterationCount, environment);
      break;
    case "time":
      run = runTime(formula, environment);
      break;
    case "stock":
      run = runStock(formula, state.candles, environment);
      break;
    case "indicator":
      run = runIndicator(
        indicators.find((i) => i.config.id === state.selected.indicator)!,
        state.candles,
        environment,
      );
      break;
    case "pattern":
      run = runPattern(
        patterns.find((p) => p.config.id === state.selected.pattern)!,
        state.candles,
        environment,
      );
      break;
    case "strategy":
      run = runStrategies(
        state.strategies.map((strategy) => ({
          id: strategy.id,
          formula: state.formulas[formulaKey("strategy", strategy.id)] ?? "",
        })),
        state.candles,
        environment,
      );
      break;
  }
  const duration = performance.now() - started;
  return { kind, run, diagnostics: diagnose(formula, environment, kind), duration };
}

export function App() {
  const context = createMemo(() => CONTEXTS.find((c) => c.kind === state.context)!);
  // Indicators, patterns and strategies come from the state: their names can be edited
  const examples = createMemo<readonly Example[]>(() => {
    const tab = (e: { id: string; name: string; description: string }): Example => ({
      id: e.id,
      name: e.name,
      description: e.description,
      formula: "",
    });
    switch (state.context) {
      case "indicator":
        return state.indicators.map(tab);
      case "pattern":
        return state.patterns.map(tab);
      case "strategy":
        return state.strategies.map(tab);
      default:
        return EXAMPLES[state.context];
    }
  });
  const example = createMemo(() => examples().find((e) => e.id === state.selected[state.context]));
  const words = createMemo(() => vocabulary(referenceEnvironment, context()));
  const items = createMemo(() => suggestions(referenceEnvironment, context(), selectedFormula()));

  // Executes the formula 200 ms after the last change
  const [execution, setExecution] = createSignal<Execution>(execute());
  let timer: ReturnType<typeof setTimeout> | undefined;
  createEffect(
    on(
      () => [
        state.context,
        state.candles,
        JSON.stringify([
          state.selected,
          state.formulas,
          // Everything of the indicators except the style of the series, which does not need an execution
          state.indicators.map((i) => ({ ...i, series: i.series.map((series) => [series.id, series.name]) })),
          // Patterns are in the registry too; their appearance does not need an execution
          state.patterns.map((p) => [p.id, p.patternId, p.name, p.length, p.parameters]),
          state.iterationCount,
        ]),
      ],
      () => {
        clearTimeout(timer);
        timer = setTimeout(() => setExecution(execute()), 200);
      },
      { defer: true },
    ),
  );
  onCleanup(() => clearTimeout(timer));

  const isStock = () => STOCK_KINDS.has(state.context);

  return (
    <div class="app">
      <header class="topbar">
        <div class="brand" style="display: flex; align-items: center;">
          <img class="logo" src={`${import.meta.env.BASE_URL}monogram.svg`} alt="" width="30" height="30" />
          <span class="brand-name">FormuLang-TS</span>
          <span class="brand-tag">preview</span>
        </div>
        <div class="topbar-status">
          <span class="dot" classList={{ failed: !succeeded(execution()) }} />
          <span>{succeeded(execution()) ? "executed" : "failed"}</span>
          <span class="muted">{execution().duration.toFixed(1)} ms</span>
          <For each={referenceEnvironment.standards}>{(s) => <code class="chip">{s}</code>}</For>
        </div>
        <div class="topbar-links">
          <a href="https://github.com/Adisoreq/formulang-ts" target="_blank" rel="noopener noreferrer">
            Source
          </a>
          <a href="https://github.com/Adisoreq/FormuLang" target="_blank" rel="noopener noreferrer">
            Docs
          </a>
        </div>
      </header>

      <Sidebar />

      <main class="workspace">
        <div class="workspace-head">
          <div>
            <h1>{context().name}</h1>
            <p class="muted">{context().description}</p>
          </div>
        </div>
        <div class="examples" role="tablist" aria-label="Examples">
          <For each={examples()}>
            {(e) => (
              <button
                type="button"
                role="tab"
                class="example"
                classList={{ active: e.id === state.selected[state.context], new: e.id === NEW_FORMULA }}
                aria-selected={e.id === state.selected[state.context]}
                onClick={() => setState("selected", state.context, e.id)}
              >
                {e.name}
              </button>
            )}
          </For>
        </div>
        <Show when={example()}>
          {(e) => (
            <p class="example-description">
              {e().description}
              <button type="button" class="link" onClick={resetFormula}>
                {e().id === NEW_FORMULA ? "clear" : "reset formula"}
              </button>
            </p>
          )}
        </Show>
        <Editor
          value={selectedFormula()}
          onChange={(value) => setFormula(value)}
          vocabulary={words()}
          suggestions={items()}
          target={(token) => targetOf(token, selectedFormula(), referenceEnvironment, context())}
          onReference={(anchor) => window.open(`reference.html#${anchor}`, "formulang-reference")}
        />
        <p class="hint">
          <kbd>Tab</kbd>/<kbd>Enter</kbd> inserts a suggestion · <kbd>↑</kbd> <kbd>↓</kbd> choose · <kbd>Esc</kbd>{" "}
          closes · <kbd>Ctrl</kbd> + click opens the{" "}
          <a href="reference.html" target="formulang-reference">
            API reference
          </a>{" "}
          of a function or constant, or goes to the definition of a variable
        </p>
        <Show when={state.context === "iteration"}>
          <div class="config">
            <label class="field">
              <span class="field-label">Iterations (N)</span>
              <input
                type="number"
                min="1"
                max="100"
                value={state.iterationCount}
                onInput={(e) =>
                  setState("iterationCount", Math.min(100, Math.max(1, Math.round(Number(e.currentTarget.value) || 1))))
                }
              />
            </label>
          </div>
        </Show>
        <ConfigPanel />
      </main>

      <aside class="output" aria-live="polite">
        <Show when={isStock()}>
          <div class="candles-bar">
            <span class="muted">
              {state.candles.length} candles · seed {state.seed}
            </span>
            <label class="inline">
              count
              <input
                type="number"
                min="20"
                max="500"
                value={state.candleCount}
                onChange={(e) =>
                  regenerateCandles(Math.min(500, Math.max(20, Math.round(Number(e.currentTarget.value) || 160))))
                }
              />
            </label>
            <button type="button" class="primary" onClick={() => regenerateCandles()}>
              Generate candles
            </button>
          </div>
        </Show>
        <Switch>
          <Match when={execution().run.kind === "default" && (execution().run as DefaultRun)}>
            {(run) => <ConsoleView run={run()} diagnostics={execution().diagnostics} />}
          </Match>
          <Match when={execution().kind === "iteration" && (execution().run as IterationRun)}>
            {(run) => <IterationsView run={run()} diagnostics={execution().diagnostics} />}
          </Match>
          <Match when={execution().run.kind === "time" && (execution().run as TimeRun)}>
            {(run) => <TimeOutput run={run()} diagnostics={execution().diagnostics} />}
          </Match>
          <Match when={execution().kind === "stock" && (execution().run as IterationRun)}>
            {(run) => <StockIterations run={run()} diagnostics={execution().diagnostics} />}
          </Match>
          <Match when={execution().run.kind === "indicator" && (execution().run as IndicatorRun)}>
            {(run) => <IndicatorOutput run={run()} diagnostics={execution().diagnostics} />}
          </Match>
          <Match when={execution().run.kind === "pattern" && (execution().run as PatternRun)}>
            {(run) => <PatternOutput run={run()} diagnostics={execution().diagnostics} />}
          </Match>
          <Match when={execution().run.kind === "strategy" && (execution().run as StrategyRun)}>
            {(run) => <StrategyOutput run={run()} diagnostics={execution().diagnostics} />}
          </Match>
        </Switch>
      </aside>
    </div>
  );
}

function succeeded(execution: Execution): boolean {
  const { run } = execution;
  switch (run.kind) {
    case "default":
      return run.execution.successful;
    case "iterations":
      return run.results.length > 0 && run.results.every((r) => r.successful);
    case "time":
      return !run.session.failed;
    case "indicator":
    case "pattern":
      return run.error === undefined;
    case "strategy":
      // An inactive strategy does not take part in the proposal, so its error does not count
      return run.strategies.every(
        (s) => s.error === undefined || !state.strategies.find((d) => d.id === s.id)?.runtime.active,
      );
  }
}

const dateOf = (index: number): string => new Date(state.candles[index]?.time ?? 0).toISOString().slice(0, 10);

/** Stock Context: the chart with the current candle, and the iterations. */
function StockIterations(props: { readonly run: IterationRun; readonly diagnostics: Diagnostics }) {
  const [current, setCurrent] = createSignal(0);
  const markers = createMemo<ChartMarker[]>(() => [
    { index: current(), position: "aboveBar", shape: "circle", color: "#f2c14e", text: `I = ${current()}` },
  ]);
  return (
    <>
      <StockChart candles={state.candles} markers={markers()} />
      <IterationsView run={props.run} diagnostics={props.diagnostics} onSelect={setCurrent} label={dateOf} />
    </>
  );
}
