import { Match, Switch } from "solid-js";
import { state } from "../model/state";
import { IndicatorEditor } from "./IndicatorPanels";
import { PatternEditor, StrategyEditor } from "./PatternStrategyPanels";

/** Definition of the selected indicator, pattern or strategy, below the editor. */
export function ConfigPanel() {
  return (
    <Switch>
      <Match when={state.context === "indicator"}>
        <IndicatorEditor />
      </Match>
      <Match when={state.context === "pattern"}>
        <PatternEditor />
      </Match>
      <Match when={state.context === "strategy"}>
        <StrategyEditor />
      </Match>
    </Switch>
  );
}
