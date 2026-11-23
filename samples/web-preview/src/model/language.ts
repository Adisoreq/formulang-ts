/**
 * Syntax highlighting and suggestions of the editor. The lexer is tolerant: it highlights incomplete formulas
 * (an unclosed text, an unknown character) that the tokenizer of the library would reject.
 */
import { ContainerType, FunctionType, type IEnvironment } from "formulang-ts";
import type { ContextDefinition } from "./types";

export type TokenClass =
  | "comment"
  | "text"
  | "number"
  | "variable"
  | "environment"
  | "function"
  | "procedure"
  | "constant"
  | "keyword"
  | "parameter"
  | "operator"
  | "bracket"
  | "plain";

export interface HighlightToken {
  readonly text: string;
  readonly cls: TokenClass;
}

const KEYWORDS = new Set(["true", "false", "null"]);

const RULES: readonly [RegExp, TokenClass | "identifier"][] = [
  // A scoped comment may span lines; an unclosed one ends with the formula
  [/<#[\s\S]*?(?:#>|$(?![\s\S]))/y, "comment"],
  [/#[^\n]*/y, "comment"],
  [/"(?:[^"\\\n]|\\.)*"?/y, "text"],
  [/0[xX][0-9a-fA-F]+|(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y, "number"],
  [/\$[A-Za-z_]\w*/y, "variable"],
  [/@[A-Za-z_]\w*/y, "environment"],
  [/[A-Za-z_]\w*/y, "identifier"],
  [/:=|\?=|=>|&&|\|\||>=|<=|==|<>|!=|[-+*/%^=<>!.,:;]/y, "operator"],
  [/[()[\]{}]/y, "bracket"],
];

/** Names known to the highlighter. */
export interface Vocabulary {
  readonly functions: ReadonlySet<string>;
  readonly procedures: ReadonlySet<string>;
  readonly constants: ReadonlySet<string>;
}

export function vocabulary(environment: IEnvironment, context: ContextDefinition): Vocabulary {
  const functions = new Set<string>();
  const procedures = new Set<string>();
  for (const fn of environment.functions)
    (fn.functionType === FunctionType.Procedure ? procedures : functions).add(fn.name);
  const constants = new Set(context.constants.map((c) => c.name));
  for (const key of environment.keys) {
    if (environment.getProperty(key)?.containerType === ContainerType.Constant) constants.add(key);
  }
  return { functions, procedures, constants };
}

export function highlight(formula: string, words: Vocabulary): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let position = 0;
  outer: while (position < formula.length) {
    for (const [pattern, cls] of RULES) {
      pattern.lastIndex = position;
      const match = pattern.exec(formula);
      if (match === null || match[0].length === 0) continue;
      const text = match[0];
      position += text.length;
      if (cls !== "identifier") tokens.push({ text, cls });
      else if (KEYWORDS.has(text)) tokens.push({ text, cls: "keyword" });
      else if (words.procedures.has(text)) tokens.push({ text, cls: "procedure" });
      else if (words.functions.has(text)) tokens.push({ text, cls: "function" });
      else if (words.constants.has(text) || /^[A-Z][A-Z0-9_]*$/.test(text)) tokens.push({ text, cls: "constant" });
      else tokens.push({ text, cls: "parameter" });
      continue outer;
    }
    tokens.push({ text: formula[position]!, cls: "plain" });
    position++;
  }
  return tokens;
}

// Suggestions

export type SuggestionKind = "function" | "procedure" | "constant" | "variable" | "environment" | "keyword";

export interface Suggestion {
  /** Text inserted into the formula. */
  readonly label: string;
  readonly kind: SuggestionKind;
  readonly detail: string;
}

/** Everything a formula of the context type can refer to. */
export function suggestions(environment: IEnvironment, context: ContextDefinition, formula: string): Suggestion[] {
  const items: Suggestion[] = [];
  for (const fn of environment.functions) {
    const procedure = fn.functionType === FunctionType.Procedure;
    items.push({
      label: fn.name,
      kind: procedure ? "procedure" : "function",
      detail: fn.overloads.map((o) => `${fn.name}${o.toString()}`).join("  ·  "),
    });
  }
  for (const c of context.constants) items.push({ label: c.name, kind: "constant", detail: c.detail });
  for (const key of environment.keys) {
    const container = environment.getProperty(key);
    if (container?.containerType === ContainerType.Constant) {
      items.push({ label: key, kind: "constant", detail: `environment constant = ${container.getValue().toString()}` });
    } else if (container !== undefined) {
      items.push({
        label: `@${key}`,
        kind: "environment",
        detail: `environment variable, default ${container.getValue().toString()}`,
      });
    }
  }
  for (const keyword of KEYWORDS) items.push({ label: keyword, kind: "keyword", detail: "literal" });
  const variables = new Set(formula.match(/\$[A-Za-z_]\w*/g) ?? []);
  for (const name of variables)
    items.push({ label: name, kind: "variable", detail: "context variable of the formula" });
  return items;
}

/** The word being typed before the caret, with its sigil: `$va`, `@arr`, `SU`. */
export function wordBefore(formula: string, caret: number): { readonly start: number; readonly word: string } {
  const match = /[$@]?[A-Za-z_]\w*$|[$@]$/.exec(formula.slice(0, caret));
  return match === null ? { start: caret, word: "" } : { start: caret - match[0].length, word: match[0] };
}

/** Suggestions that contain the phrase (case-insensitive); the ones that start with it first. */
export function filterSuggestions(items: readonly Suggestion[], phrase: string, limit = 12): Suggestion[] {
  if (phrase.length === 0) return [];
  const needle = phrase.toLowerCase();
  const sigil = phrase[0] === "$" || phrase[0] === "@" ? phrase[0] : "";
  const matches = items.filter((item) => {
    const label = item.label.toLowerCase();
    if (sigil !== "" && !label.startsWith(sigil)) return false;
    // A word typed in full is still offered for a function (it inserts the parenthesis), not for other words
    const callable = item.kind === "function" || item.kind === "procedure";
    return label.includes(needle) && (label !== needle || callable);
  });
  matches.sort((a, b) => {
    const as = a.label.toLowerCase().startsWith(needle) ? 0 : 1;
    const bs = b.label.toLowerCase().startsWith(needle) ? 0 : 1;
    return as - bs || a.label.localeCompare(b.label);
  });
  const unique = matches.filter((item, i) => matches.findIndex((m) => m.label === item.label) === i);
  return unique.slice(0, limit);
}
