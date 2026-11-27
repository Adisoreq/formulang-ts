import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import {
  type PositionedToken,
  type Suggestion,
  type TokenTarget,
  type Vocabulary,
  filterSuggestions,
  positionedTokens,
  wordBefore,
} from "../model/language";

interface EditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly vocabulary: Vocabulary;
  readonly suggestions: readonly Suggestion[];
  /** What a Ctrl + click on a token does; `undefined` for a token that is not a link. */
  readonly target?: (token: PositionedToken) => TokenTarget | undefined;
  /** Opens an element of the API reference. */
  readonly onReference?: (anchor: string) => void;
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
 *
 * With Ctrl (⌘ on macOS) held, the token under the mouse is underlined if it is a link: a click opens its element
 * of the API reference (a function, procedure, constant, environment variable or literal), or selects the
 * definition of a variable of the formula and scrolls to it.
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

  const tokens = createMemo(() => positionedTokens(props.value, props.vocabulary));
  const [link, setLink] = createSignal<{ token: PositionedToken; target: TokenTarget } | undefined>();

  const html = createMemo(() => {
    const linked = link()?.token;
    return tokens()
      .map((t) => {
        if (t.cls === "plain") return escape(t.text);
        const cls = linked !== undefined && t.start === linked.start ? `tk-${t.cls} tk-link` : `tk-${t.cls}`;
        return `<span class="${cls}">${escape(t.text)}</span>`;
      })
      .join("");
  });
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

  // Ctrl + hover and Ctrl + click

  let pointer: { x: number; y: number } | undefined;
  let characterWidth: number | undefined;

  /** Width of a character of the monospace font of the editor. */
  const charWidth = (style: CSSStyleDeclaration): number => {
    if (characterWidth === undefined) {
      const canvas = document.createElement("canvas").getContext("2d")!;
      canvas.font = `${style.fontSize} ${style.fontFamily}`;
      characterWidth = canvas.measureText("0".repeat(100)).width / 100;
    }
    return characterWidth;
  };

  /** The offset of the character under a point of the screen, from the grid of the monospace font. */
  const offsetAt = (x: number, y: number): number | undefined => {
    const style = getComputedStyle(textarea);
    const rect = textarea.getBoundingClientRect();
    const left = x - rect.left - parseFloat(style.paddingLeft) + textarea.scrollLeft;
    const top = y - rect.top - parseFloat(style.paddingTop) + textarea.scrollTop;
    if (left < 0 || top < 0) return undefined;
    const lines = props.value.split("\n");
    const row = Math.floor(top / parseFloat(style.lineHeight));
    if (row >= lines.length) return undefined;
    const tabSize = parseInt(style.tabSize, 10) || 2;
    let offset = lines.slice(0, row).reduce((sum, line) => sum + line.length + 1, 0);
    let column = 0;
    const width = charWidth(style);
    for (const c of lines[row]!) {
      const next = column + (c === "\t" ? tabSize : 1);
      if (left < next * width) return offset;
      column = next;
      offset += c.length;
    }
    return undefined;
  };

  const updateLink = (active: boolean): void => {
    const offset = active && pointer !== undefined ? offsetAt(pointer.x, pointer.y) : undefined;
    const token = offset === undefined ? undefined : tokens().find((t) => t.start <= offset && offset < t.end);
    const target = token === undefined ? undefined : props.target?.(token);
    setLink(token !== undefined && target !== undefined ? { token, target } : undefined);
  };

  const follow = (target: TokenTarget): void => {
    if (target.kind === "reference") {
      props.onReference?.(target.anchor);
      return;
    }
    textarea.focus();
    textarea.setSelectionRange(target.start, target.end);
    const style = getComputedStyle(textarea);
    const line = props.value.slice(0, target.start).split("\n").length - 1;
    const top = line * parseFloat(style.lineHeight);
    if (top < textarea.scrollTop || top > textarea.scrollTop + textarea.clientHeight - 40) {
      textarea.scrollTop = Math.max(0, top - textarea.clientHeight / 3);
    }
    update();
  };

  const isModifier = (event: KeyboardEvent | MouseEvent): boolean => event.ctrlKey || event.metaKey;

  onMount(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Control" || event.key === "Meta") updateLink(event.type === "keydown");
    };
    const onBlur = (): void => setLink(undefined);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    onCleanup(() => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    });
  });

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
    <div class="editor" classList={{ linking: link() !== undefined }}>
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
        onMouseMove={(event) => {
          pointer = { x: event.clientX, y: event.clientY };
          updateLink(isModifier(event));
        }}
        onMouseLeave={() => {
          pointer = undefined;
          setLink(undefined);
        }}
        onMouseDown={(event) => {
          const current = link();
          if (!isModifier(event) || current === undefined || event.button !== 0) return;
          event.preventDefault();
          setOpen(false);
          follow(current.target);
        }}
        onScroll={() => {
          syncScroll();
          updateLink(link() !== undefined);
        }}
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
