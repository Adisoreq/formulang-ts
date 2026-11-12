import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { type Suggestion, type Vocabulary, filterSuggestions, highlight, wordBefore } from "../model/language";

interface EditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly vocabulary: Vocabulary;
  readonly suggestions: readonly Suggestion[];
}

const escape = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const KIND_LABEL: Record<Suggestion["kind"], string> = {
  function: "fn",
  procedure: "proc",
  constant: "const",
  variable: "$",
  environment: "@",
  keyword: "lit",
};

/**
 * Formula editor: a textarea over a highlighted copy of its text, with a list of the keywords that contain the
 * word being typed (↑ ↓ to choose, Enter or Tab to insert, Esc to close).
 */
export function Editor(props: EditorProps) {
  let textarea!: HTMLTextAreaElement;
  let layer!: HTMLPreElement;
  let mirror!: HTMLDivElement;
  let marker!: HTMLSpanElement;

  const [caret, setCaret] = createSignal(0);
  const [open, setOpen] = createSignal(false);
  const [selected, setSelected] = createSignal(0);
  const [position, setPosition] = createSignal({ top: 0, left: 0 });

  const html = createMemo(() =>
    highlight(props.value, props.vocabulary)
      .map((t) => (t.cls === "plain" ? escape(t.text) : `<span class="tk-${t.cls}">${escape(t.text)}</span>`))
      .join(""),
  );
  createEffect(() => {
    // A trailing new line keeps the height of the layer equal to the textarea
    layer.innerHTML = html() + "\n";
  });

  const word = createMemo(() => wordBefore(props.value, caret()));
  const matches = createMemo(() => (open() ? filterSuggestions(props.suggestions, word().word) : []));

  createEffect(() => {
    if (matches().length === 0) return;
    // Position of the caret, measured in a hidden copy of the text before it
    mirror.textContent = props.value.slice(0, word().start);
    mirror.appendChild(marker);
    setPosition({
      top: marker.offsetTop - textarea.scrollTop + 22,
      left: Math.min(marker.offsetLeft - textarea.scrollLeft, textarea.clientWidth - 260),
    });
  });

  const syncScroll = (): void => {
    layer.scrollTop = textarea.scrollTop;
    layer.scrollLeft = textarea.scrollLeft;
  };

  const update = (): void => {
    setCaret(textarea.selectionStart);
    syncScroll();
  };

  const insert = (item: Suggestion): void => {
    const { start } = word();
    const end = caret();
    const after = props.value.slice(end);
    const call = (item.kind === "function" || item.kind === "procedure") && !after.startsWith("(");
    const text = item.label + (call ? "(" : "");
    props.onChange(props.value.slice(0, start) + text + after);
    queueMicrotask(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
      setCaret(start + text.length);
    });
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const list = matches();
    if (list.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setSelected((selected() + step + list.length) % list.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insert(list[selected()]!);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
    }
    if (event.key === "Tab") {
      event.preventDefault();
      textarea.setRangeText("  ", textarea.selectionStart, textarea.selectionEnd, "end");
      props.onChange(textarea.value);
      update();
    }
  };

  return (
    <div class="editor">
      <pre class="editor-layer" ref={layer} aria-hidden="true" />
      <textarea
        ref={textarea}
        class="editor-input"
        value={props.value}
        spellcheck={false}
        wrap="off"
        aria-label="Formula"
        placeholder={"# Write a formula, e.g.\n$x := 2\n$x ^ 10"}
        onInput={(event) => {
          props.onChange(event.currentTarget.value);
          update();
          setSelected(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => {
          if (event.key.startsWith("Arrow") && !open()) update();
        }}
        onClick={() => {
          update();
          setOpen(false);
        }}
        onScroll={syncScroll}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      <div class="editor-mirror" ref={mirror} aria-hidden="true">
        <span ref={marker}>|</span>
      </div>
      <Show when={matches().length > 0}>
        <ul
          class="suggestions"
          role="listbox"
          style={{ top: `${position().top}px`, left: `${Math.max(0, position().left)}px` }}
        >
          <For each={matches()}>
            {(item, i) => (
              <li
                role="option"
                aria-selected={i() === selected()}
                classList={{ active: i() === selected() }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insert(item);
                }}
                onMouseEnter={() => setSelected(i())}
              >
                <span class={`kind kind-${item.kind}`}>{KIND_LABEL[item.kind]}</span>
                <span class="label">{item.label}</span>
                <span class="detail" title={item.detail}>
                  {item.detail}
                </span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
