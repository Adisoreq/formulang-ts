import { For, type JSX, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import {
  type IArgumentTemplate,
  ContainerType,
  CoreFunctions,
  CoreProcedures,
  FunctionType,
  type IFunction,
  type IProcedure,
  TypeNames,
} from "formulang-ts";
import { referenceEnvironment } from "../model/engine";
import { CONTEXTS, STANDARDS } from "../model/examples";
import { ReferenceAnchor } from "../model/language";
import { REFERENCE } from "../model/reference-data";

const STANDARD = "https://github.com/Adisoreq/FormuLang/blob/main/docs";
const CORE_NAMES = new Set([...CoreFunctions, ...CoreProcedures].map((fn) => fn.name));
// Functions of the library that have no document in the standard (conformance I8)
const UNDOCUMENTED = new Set(["OBJECT"]);

/** An element of the reference. */
interface Entry {
  readonly anchor: string;
  readonly name: string;
  /** `function`, `procedure`, `constant`, `variable`, `context` or `literal`: the color of the name. */
  readonly kind: string;
  readonly descriptions: readonly string[];
  /** The function or procedure, whose overloads are the signatures. */
  readonly fn?: IFunction;
  /** Return types of a function, the type of a constant. */
  readonly types: readonly string[];
  /** Value of a constant, default of a variable. */
  readonly value?: string;
  readonly operator?: string;
  readonly example?: string;
  /** Labels shown next to the name, e.g. the context types of a context constant. */
  readonly tags: readonly string[];
  readonly link?: string;
}

interface Section {
  readonly id: string;
  readonly title: string;
  readonly entries: readonly Entry[];
}

function functionEntry(fn: IFunction): Entry {
  const core = CORE_NAMES.has(fn.name);
  const procedure = fn.functionType === FunctionType.Procedure;
  const data = REFERENCE[fn.name];
  const descriptions = [...(data?.descriptions ?? [])];
  if (procedure) {
    const args = Array.from({ length: (fn as IProcedure).parameterCount }, (_, i) => `arg${i + 1}`).join(" ");
    descriptions.push(`A procedure: it can also be called without parentheses, \`${fn.name} ${args}\`.`);
  }
  return {
    anchor: procedure ? ReferenceAnchor.procedure(fn.name) : ReferenceAnchor.function(fn.name),
    name: fn.name,
    kind: procedure ? "procedure" : "function",
    descriptions,
    fn,
    types: data?.returns ?? [],
    ...(data?.operator === undefined ? {} : { operator: data.operator }),
    ...(data?.example === undefined ? {} : { example: data.example }),
    tags: [],
    ...(UNDOCUMENTED.has(fn.name)
      ? {}
      : {
          link: `${STANDARD}/standards/${core ? "core" : "stock"}/${procedure ? "procedures" : "functions"}/${fn.name}.md`,
        }),
  };
}

/** The sections of the reference: every element of the environment of the preview and of its context types. */
function sections(): Section[] {
  const environment = referenceEnvironment;
  const functions = [...environment.functions].sort((a, b) => a.name.localeCompare(b.name));
  const byStandard = (core: boolean, procedure: boolean): Entry[] =>
    functions
      .filter((fn) => CORE_NAMES.has(fn.name) === core && (fn.functionType === FunctionType.Procedure) === procedure)
      .map(functionEntry);
  const constants: Entry[] = [];
  const variables: Entry[] = [];
  const link = `${STANDARD}/standards/core/README.md#environment-structure`;
  for (const key of environment.keys) {
    const container = environment.getProperty(key)!;
    const value = container.getValue();
    const common = { descriptions: [], types: [value.type.toString()], value: value.toString(), tags: [], link };
    if (container.containerType === ContainerType.Constant) {
      constants.push({ anchor: ReferenceAnchor.constant(key), name: key, kind: "constant", ...common });
    } else {
      variables.push({
        anchor: ReferenceAnchor.environmentVariable(key),
        name: `@${key}`,
        kind: "variable",
        ...common,
      });
    }
  }
  // A context constant is listed once, with the context types that provide it
  const contextConstants = new Map<string, { detail: string; contexts: string[]; standard: string }>();
  for (const context of CONTEXTS) {
    for (const constant of context.constants) {
      const known = contextConstants.get(constant.name);
      if (known === undefined) {
        contextConstants.set(constant.name, {
          detail: constant.detail,
          contexts: [context.name],
          standard: context.standard,
        });
      } else known.contexts.push(context.name);
    }
  }
  const contextEntries = [...contextConstants].map(([name, c]): Entry => ({
    anchor: ReferenceAnchor.contextConstant(name),
    name,
    kind: "constant",
    descriptions: [c.detail],
    types: [],
    tags: c.contexts,
    link:
      c.standard === "core" ? `${STANDARD}/core/context.md` : `${STANDARD}/standards/stock/README.md#context-structure`,
  }));
  const literals = (["true", "false", "null"] as const).map((name): Entry => ({
    anchor: ReferenceAnchor.literal(name),
    name,
    kind: "keyword",
    descriptions: [name === "null" ? "The value of the type Null." : `The Boolean value ${name}.`],
    types: [name === "null" ? TypeNames.Null : TypeNames.Boolean],
    tags: [],
    link: `${STANDARD}/syntax/literals.md`,
  }));
  const [core, stock] = STANDARDS;
  return [
    { id: "core-functions", title: `${core!.name}: functions`, entries: byStandard(true, false) },
    { id: "core-procedures", title: `${core!.name}: procedures`, entries: byStandard(true, true) },
    { id: "stock-functions", title: `${stock!.name}: functions`, entries: byStandard(false, false) },
    { id: "constants", title: "Environment constants", entries: constants },
    { id: "variables", title: "Environment variables", entries: variables },
    { id: "context-constants", title: "Constants of the context types", entries: contextEntries },
    { id: "literals", title: "Literals", entries: literals },
  ];
}

/** Text with `code` spans. */
function Markdown(props: { readonly text: string }) {
  return (
    <For each={props.text.split(/(`[^`]*`)/)}>
      {(part) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 1 ? <code>{part.slice(1, -1)}</code> : part
      }
    </For>
  );
}

const typeOf = (template: IArgumentTemplate): string => {
  if (template.anyType) return "Any";
  if (template.elementType !== undefined) return `Array<${template.elementType.base}>`;
  return template.type.extended ?? template.type.base;
};

/** One overload: the name, the parameters (with their types, optional and repeated ones) and the parentheses. */
function Signature(props: { readonly name: string; readonly template: readonly IArgumentTemplate[] }) {
  return (
    <div class="sig">
      <span class="sig-name">{props.name}</span>
      <span class="sig-punct">(</span>
      <For each={props.template}>
        {(arg, i) => (
          <>
            <Show when={i() > 0}>
              <span class="sig-punct">, </span>
            </Show>
            <span class="sig-arg" classList={{ optional: arg.optional }}>
              <Show when={arg.multiple}>
                <span class="sig-rest">…</span>
              </Show>
              <span class="sig-param">{arg.name}</span>
              <Show when={arg.optional}>
                <span class="sig-optional">?</span>
              </Show>
              <span class="sig-type">{typeOf(arg)}</span>
            </span>
          </>
        )}
      </For>
      <span class="sig-punct">)</span>
    </div>
  );
}

function Types(props: { readonly types: readonly string[] }): JSX.Element {
  return (
    <span class="ref-types">
      <For each={props.types}>{(type) => <span class="ref-type">{type}</span>}</For>
    </span>
  );
}

function EntryView(props: { readonly entry: Entry; readonly targeted: boolean }) {
  const entry = props.entry;
  return (
    <article id={entry.anchor} class="reference-entry" classList={{ targeted: props.targeted }}>
      <header class="ref-head">
        <a class={`ref-name tk-${entry.kind}`} href={`#${entry.anchor}`}>
          {entry.name}
        </a>
        <Show when={entry.operator}>
          {(operator) => (
            <span class="ref-operator" title="Operator form">
              {operator()}
            </span>
          )}
        </Show>
        <For each={entry.tags}>{(tag) => <span class="ref-tag">{tag}</span>}</For>
        <span class="ref-spacer" />
        <Show when={entry.link}>
          {(link) => (
            <a class="ref-link" href={link()} target="_blank" rel="noreferrer">
              standard ↗
            </a>
          )}
        </Show>
      </header>
      <For each={entry.descriptions}>
        {(description) => (
          <p class="ref-description">
            <Markdown text={description} />
          </p>
        )}
      </For>
      <Show when={entry.fn}>
        {(fn) => (
          <div class="ref-signatures">
            <For each={fn().overloads}>{(overload) => <Signature name={fn().name} template={overload.template} />}</For>
          </div>
        )}
      </Show>
      <Show when={entry.types.length > 0 || entry.value !== undefined || entry.example !== undefined}>
        <dl class="ref-facts">
          <Show when={entry.types.length > 0}>
            <dt>{entry.fn === undefined ? "Type" : "Returns"}</dt>
            <dd>
              <Types types={entry.types} />
            </dd>
          </Show>
          <Show when={entry.value}>
            {(value) => (
              <>
                <dt>{entry.kind === "variable" ? "Default" : "Value"}</dt>
                <dd>
                  <code class="ref-value">{value()}</code>
                </dd>
              </>
            )}
          </Show>
          <Show when={entry.example}>
            {(example) => (
              <>
                <dt>Example</dt>
                <dd>
                  <code class="ref-value">{example()}</code>
                </dd>
              </>
            )}
          </Show>
        </dl>
      </Show>
    </article>
  );
}

/** API reference of the preview: the functions, procedures, constants and variables a formula can use. */
export function Reference() {
  const all = sections();
  const [query, setQuery] = createSignal("");
  const [target, setTarget] = createSignal(location.hash.slice(1));
  const filtered = createMemo(() => {
    const needle = query().trim().toLowerCase();
    return all
      .map((section) => ({
        ...section,
        entries:
          needle === ""
            ? section.entries
            : section.entries.filter(
                (e) =>
                  e.name.toLowerCase().includes(needle) || e.descriptions.some((d) => d.toLowerCase().includes(needle)),
              ),
      }))
      .filter((section) => section.entries.length > 0);
  });

  const reveal = (): void => {
    setQuery("");
    setTarget(location.hash.slice(1));
    queueMicrotask(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "center" }));
  };
  onMount(() => {
    reveal();
    window.addEventListener("hashchange", reveal);
    onCleanup(() => window.removeEventListener("hashchange", reveal));
  });

  return (
    <div class="reference">
      <header class="topbar">
        <div class="brand" style="display: flex; align-items: center;">
          <img class="logo" src={`${import.meta.env.BASE_URL}monogram.svg`} alt="" width="30" height="30" />
          <span class="brand-name">FormuLang-TS</span>
          <span class="brand-tag">API reference</span>
        </div>
        <a class="link" href="./">
          ← Back to the preview
        </a>
      </header>
      <div class="reference-body">
        <nav class="reference-nav">
          <input
            type="search"
            placeholder="Search names and descriptions…"
            value={query()}
            aria-label="Search the reference"
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          <For each={filtered()}>
            {(section) => (
              <a href={`#${section.id}`} onClick={() => setQuery("")}>
                {section.title} <span class="muted">{section.entries.length}</span>
              </a>
            )}
          </For>
        </nav>
        <main class="reference-main">
          <p class="muted">
            Every element that the formulas of the preview can use ({STANDARDS.map((s) => s.identifier).join(", ")}),
            read from its environment; the descriptions and return types come from the function indexes of the standard.{" "}
            <kbd>Ctrl</kbd> + click in the editor opens the element under the mouse.
          </p>
          <For each={filtered()}>
            {(section) => (
              <section id={section.id}>
                <h2>{section.title}</h2>
                <For each={section.entries}>
                  {(entry) => <EntryView entry={entry} targeted={entry.anchor === target()} />}
                </For>
              </section>
            )}
          </For>
        </main>
      </div>
    </div>
  );
}
