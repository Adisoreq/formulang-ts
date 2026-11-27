import type { IError, IValue } from "../../abstractions/primitives.js";
import type { IExpressionNode, IMetadataResult } from "../../abstractions/processing.js";
import { ExpressionKind } from "../../abstractions/processing.js";
import { Errors } from "../errors.js";
import { FlObject } from "../primitives/object.js";
import { TypeNames } from "../primitives/types.js";
import { Value } from "../primitives/value.js";
import { Cleaner, type SourcePosition } from "./cleaner.js";
import { Parser } from "./parser.js";
import { Tokenizer } from "./tokenizer.js";

const OPENING = "<@";
const CLOSING = "@>";

/** Result of the metadata reading (docs/core/metadata.md, "Metadata reading", since `core-1.2`). */
export class MetadataResult implements IMetadataResult {
  constructor(
    readonly metadata: IValue,
    readonly formula: string,
    /** Position of the `<` of the metadata block, or `undefined` if the formula has no block. */
    readonly position: SourcePosition | undefined,
    readonly error: IError = Errors.success(),
  ) {}

  get successful(): boolean {
    return this.error.isSuccess();
  }

  /** Whether the formula has a metadata block. */
  get hasBlock(): boolean {
    return this.position !== undefined;
  }
}

const emptyMetadata = (): IValue => Value.object(new FlObject());

/** Line and column (in code points) of a UTF-16 index of the text. */
function positionOf(text: string, index: number): SourcePosition {
  let line = 1;
  let column = 1;
  for (const c of text.slice(0, index).replace(/\r\n?/g, "\n")) {
    if (c === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

/** Index of the end of the white space and the comments at the beginning of the formula. */
function skipLeadingTrivia(formula: string): number {
  let i = 0;
  while (i < formula.length) {
    const c = formula[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
    } else if (c === "#") {
      while (i < formula.length && formula[i] !== "\n" && formula[i] !== "\r") i++;
    } else if (c === "<" && formula[i + 1] === "#") {
      const end = formula.indexOf("#>", i + 2);
      if (end < 0) return formula.length;
      i = end + 2;
    } else {
      break;
    }
  }
  return i;
}

/**
 * Index of the `@` of the `@>` that closes the block opened at `start`: the first one outside of a text literal
 * and of a comment; `-1` if there is none.
 */
function findClosing(formula: string, start: number): number {
  let insideText = false;
  let escape = false;
  for (let i = start + OPENING.length; i < formula.length; i++) {
    const c = formula[i]!;
    if (insideText) {
      if (c === "\n" || c === "\r") insideText = false;
      else if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') insideText = false;
      continue;
    }
    if (c === '"') insideText = true;
    else if (c === "#") {
      while (i + 1 < formula.length && formula[i + 1] !== "\n" && formula[i + 1] !== "\r") i++;
    } else if (c === "<" && formula[i + 1] === "#") {
      const end = formula.indexOf("#>", i + 2);
      if (end < 0) return -1;
      i = end + 1;
    } else if (c === "@" && formula[i + 1] === ">") {
      return i;
    }
  }
  return -1;
}

const NOT_CONSTANT =
  "may contain only constant values: Number, Text and Boolean literals, null, and Arrays and Objects of them";

/** The value of a constant node of the metadata block, or `undefined` for a node that is not constant. */
function constantValue(node: IExpressionNode): IValue | undefined {
  switch (node.kind) {
    case ExpressionKind.Value:
      return node.value;
    case ExpressionKind.FunctionCall: {
      const children = node.children;
      if (node.name === "NEG") {
        const operand = children[0];
        return children.length === 1 &&
          operand?.kind === ExpressionKind.Value &&
          operand.value.type.base === TypeNames.Number
          ? Value.number(0 - (operand.value.raw as number))
          : undefined;
      }
      if (node.name === "ARRAY") {
        const elements: IValue[] = [];
        for (const child of children) {
          const element = constantValue(child);
          if (element === undefined) return undefined;
          elements.push(element);
        }
        return Value.array(elements);
      }
      if (node.name === "OBJECT") {
        const object = new FlObject();
        for (let i = 0; i + 1 < children.length; i += 2) {
          const key = children[i]!;
          const value = constantValue(children[i + 1]!);
          if (key.kind !== ExpressionKind.Value || typeof key.value.raw !== "string" || value === undefined) {
            return undefined;
          }
          object.initVariable(key.value.raw, value);
        }
        return Value.object(object);
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Metadata reading (docs/core/metadata.md, "Metadata reading"): reads the metadata block `<@ { ... } @>` at the
 * beginning of a formula, if there is one, and replaces it with white space. A block that is not closed, or whose
 * content is not one Object literal of constant values, is a `SYNTAX_ERROR`.
 *
 * The block is replaced character by character (a space for every character, a line break stays), so the lines and
 * columns of the rest of the formula do not change; the result is the same as with the one new line or space of the
 * standard, because the clean-up removes empty lines and repeated spaces.
 *
 * The formula is expected to be validated; the reading needs no environment and no context.
 */
export function readMetadata(formula: string): MetadataResult {
  const start = skipLeadingTrivia(formula);
  if (!formula.startsWith(OPENING, start)) return new MetadataResult(emptyMetadata(), formula, undefined);
  const position = positionOf(formula, start);
  const at = `(line ${position.line}, column ${position.column})`;
  const fail = (message: string): MetadataResult =>
    new MetadataResult(emptyMetadata(), formula, position, Errors.syntaxError(message));

  const end = findClosing(formula, start);
  if (end < 0) return fail(`The metadata block is not closed ${at}.`);
  const content = formula.slice(start + OPENING.length, end);
  const mustBeObject = `The metadata block ${at} must contain one Object literal.`;

  const cleanUp = new Cleaner().cleanUp(content);
  if (!cleanUp.successful) return fail(mustBeObject);
  const tokenization = new Tokenizer().tokenize(cleanUp.result);
  if (!tokenization.successful) return fail(`The metadata block ${at}: ${tokenization.error.message}`);
  const parsing = new Parser().parse(tokenization.tokens);
  if (!parsing.successful) return fail(`The metadata block ${at}: ${parsing.error.message}`);
  const root = parsing.sequences.length === 1 ? parsing.sequences[0]!.root : undefined;
  if (root?.kind !== ExpressionKind.FunctionCall || root.name !== "OBJECT") return fail(mustBeObject);
  const metadata = constantValue(root);
  if (metadata === undefined) return fail(`The metadata block ${at} ${NOT_CONSTANT}.`);

  const block = formula.slice(start, end + CLOSING.length).replace(/[^\r\n]/gu, " ");
  return new MetadataResult(metadata, formula.slice(0, start) + block + formula.slice(end + CLOSING.length), position);
}
