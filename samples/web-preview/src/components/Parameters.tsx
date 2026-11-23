import { For, Show } from "solid-js";
import { type IndicatorParameterDraft, newParameter } from "../model/indicators";

const text = (event: Event): string => (event.currentTarget as HTMLInputElement).value;
const number = (event: Event): number => Number((event.currentTarget as HTMLInputElement).value);

/** Changes the parameters of a definition: a path inside its `parameters` array of the state. */
export type ParametersSetter = (...path: unknown[]) => void;

/** Parameters of a definition of the registry (an indicator or a pattern): id, name and default value. */
export function ParameterTable(props: {
  readonly parameters: readonly IndicatorParameterDraft[];
  readonly set: ParametersSetter;
  /** `indicator` or `pattern`, for the empty list. */
  readonly kind: string;
}) {
  return (
    <section class="editor-section">
      <header>
        <span class="field-label">Parameters</span>
        <code class="muted">PARAMETERS.&lt;id&gt;</code>
        <button
          type="button"
          class="ghost"
          onClick={() => props.set((p: IndicatorParameterDraft[]) => [...p, newParameter(p)])}
        >
          + Add parameter
        </button>
      </header>
      <Show when={props.parameters.length > 0} fallback={<p class="empty">The {props.kind} has no parameters.</p>}>
        <table class="series-table edit-table">
          <thead>
            <tr>
              <th>Id</th>
              <th>Name</th>
              <th>Default value</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <For each={props.parameters}>
              {(parameter, i) => (
                <tr>
                  <td>
                    <input
                      type="text"
                      class="mono"
                      value={parameter.id}
                      aria-label="Parameter id"
                      onInput={(e) => props.set(i(), "id", text(e))}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={parameter.name}
                      aria-label="Parameter name"
                      onInput={(e) => props.set(i(), "name", text(e))}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={parameter.defaultValue}
                      aria-label="Default value"
                      onInput={(e) => props.set(i(), "defaultValue", number(e))}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      class="remove"
                      title="Remove the parameter"
                      aria-label={`Remove parameter ${parameter.id}`}
                      onClick={() => props.set((p: unknown[]) => p.filter((_, j) => j !== i()))}
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
    </section>
  );
}

/** Values of the parameters used for the chart, below the chart. */
export function ParameterValues(props: {
  readonly parameters: readonly IndicatorParameterDraft[];
  readonly set: ParametersSetter;
}) {
  return (
    <Show when={props.parameters.length > 0}>
      <div class="parameter-values">
        <span class="field-label">Parameter values of the chart</span>
        <div class="config-row">
          <For each={props.parameters}>
            {(parameter, i) => (
              <label class="field">
                <span class="field-label">
                  {parameter.name} <code>{parameter.id}</code>
                </span>
                <input type="number" value={parameter.value} onInput={(e) => props.set(i(), "value", number(e))} />
                <button
                  type="button"
                  class="link"
                  disabled={parameter.value === parameter.defaultValue}
                  onClick={() => props.set(i(), "value", parameter.defaultValue)}
                >
                  default {parameter.defaultValue}
                </button>
              </label>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
