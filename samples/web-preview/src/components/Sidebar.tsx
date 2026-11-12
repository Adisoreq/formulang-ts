import { For, createSignal } from "solid-js";
import { STANDARDS } from "../model/examples";
import { setState, state } from "../model/state";
import type { StandardId } from "../model/types";

/** Panel with one expandable list per standard; the items are its context types. */
export function Sidebar() {
  const [expanded, setExpanded] = createSignal<Record<StandardId, boolean>>({ core: true, stock: true });

  return (
    <nav class="sidebar" aria-label="Context types">
      <For each={STANDARDS}>
        {(standard) => (
          <section class="standard" classList={{ open: expanded()[standard.id] }}>
            <button
              type="button"
              class="standard-header"
              aria-expanded={expanded()[standard.id]}
              onClick={() => setExpanded({ ...expanded(), [standard.id]: !expanded()[standard.id] })}
            >
              <span class="chevron" aria-hidden="true">
                ›
              </span>
              <span class="standard-name">{standard.name}</span>
              <code class="standard-id">{standard.identifier}</code>
            </button>
            <ul class="contexts" hidden={!expanded()[standard.id]}>
              <For each={standard.contexts}>
                {(context) => (
                  <li>
                    <button
                      type="button"
                      class="context"
                      classList={{ active: state.context === context.kind }}
                      aria-current={state.context === context.kind ? "page" : undefined}
                      onClick={() => setState("context", context.kind)}
                    >
                      <span class="context-name">{context.name}</span>
                      <span class="context-description">{context.description}</span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </section>
        )}
      </For>
    </nav>
  );
}
