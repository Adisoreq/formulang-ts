import type { ICleaner } from "../../abstractions/processing.js";
import { Errors } from "../errors.js";
import { isOperatorCharacter } from "../utils/chars.js";
import { CleanUpResult } from "./results.js";

const TEXT_DELIMITER = '"';
const ESCAPE = "\\";
const COMMENT = "#";
const SCOPED_COMMENT_OPENING = "<";
const SCOPED_COMMENT_END = "#>";

/** Position of a character in the original formula: line and column (in code points), both from 1. */
export interface SourcePosition {
  readonly line: number;
  readonly column: number;
}

/** A character (one code point) of the formula with its position in the original text. */
interface Char {
  readonly c: string;
  readonly position: SourcePosition;
}

interface Segment {
  readonly content: Char[];
  readonly isText: boolean;
}

/** The code points of the formula with their positions; tabs become spaces and line breaks become `\n`. */
function normalize(expression: string): Char[] {
  const chars: Char[] = [];
  let line = 1;
  let column = 0;
  let previous = "";
  for (const c of expression) {
    if (c === "\n" && previous === "\r") {
      previous = c;
      continue;
    }
    previous = c;
    column++;
    const position = { line, column };
    if (c === "\n" || c === "\r") {
      chars.push({ c: "\n", position });
      line++;
      column = 0;
    } else {
      chars.push({ c: c === "\t" ? " " : c, position });
    }
  }
  return chars;
}

/** Splits a line into code and text literal segments, and drops a comment outside of text. */
function splitLine(line: readonly Char[]): Segment[] {
  const segments: Segment[] = [];
  let current: Char[] = [];
  let insideText = false;
  let escape = false;
  for (const char of line) {
    const c = char.c;
    if (insideText) {
      current.push(char);
      if (escape) escape = false;
      else if (c === ESCAPE) escape = true;
      else if (c === TEXT_DELIMITER) {
        segments.push({ content: current, isText: true });
        current = [];
        insideText = false;
      }
      continue;
    }
    if (c === COMMENT) break;
    if (c === TEXT_DELIMITER) {
      if (current.length > 0) segments.push({ content: current, isText: false });
      current = [char];
      insideText = true;
      continue;
    }
    current.push(char);
  }
  if (current.length > 0) segments.push({ content: current, isText: insideText });
  return segments;
}

/**
 * Replaces every scoped comment (`<# ... #>`) located outside a text literal and outside a line comment with one
 * new line if it contains a line break, or with one space otherwise (docs/semantics/cleanup.md, "Removing
 * comments"). Line comments are left for {@link splitLine}. A scoped comment that is not closed (reported by the
 * validation) is removed up to the end of the formula.
 */
function removeScopedComments(chars: Char[]): Char[] {
  if (!chars.some((char, i) => char.c === SCOPED_COMMENT_OPENING && chars[i + 1]?.c === COMMENT)) return chars;
  const result: Char[] = [];
  let insideText = false;
  let insideLineComment = false;
  let escape = false;
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]!;
    const c = char.c;
    if (c === "\n") {
      insideText = insideLineComment = escape = false;
      result.push(char);
      continue;
    }
    if (insideLineComment) {
      result.push(char);
      continue;
    }
    if (insideText) {
      result.push(char);
      if (escape) escape = false;
      else if (c === ESCAPE) escape = true;
      else if (c === TEXT_DELIMITER) insideText = false;
      continue;
    }
    if (c === SCOPED_COMMENT_OPENING && chars[i + 1]?.c === COMMENT) {
      let stop = chars.length;
      for (let j = i + 2; j + 1 < chars.length; j++) {
        if (chars[j]!.c === SCOPED_COMMENT_END[0] && chars[j + 1]!.c === SCOPED_COMMENT_END[1]) {
          stop = j + 2;
          break;
        }
      }
      const multiline = chars.slice(i, stop).some((inner) => inner.c === "\n");
      result.push({ c: multiline ? "\n" : " ", position: char.position });
      i = stop - 1;
      continue;
    }
    if (c === COMMENT) insideLineComment = true;
    else if (c === TEXT_DELIMITER) insideText = true;
    result.push(char);
  }
  return result;
}

const isCompressibleOperator = (char: Char | undefined): boolean =>
  char !== undefined && char.c !== TEXT_DELIMITER && isOperatorCharacter(char.c);

/** Collapses runs of spaces and removes the spaces next to operators. */
function compressCode(code: readonly Char[]): Char[] {
  const result: Char[] = [];
  for (let i = 0; i < code.length; i++) {
    const char = code[i]!;
    if (char.c !== " ") {
      result.push(char);
      continue;
    }
    // A run of spaces: keep only the last one
    if (code[i + 1]?.c === " ") continue;
    if (isCompressibleOperator(result.at(-1)) || isCompressibleOperator(code[i + 1])) continue;
    result.push(char);
  }
  return result;
}

function cleanLine(line: readonly Char[]): Char[] {
  const segments = splitLine(line);
  const result: Char[] = [];
  segments.forEach((segment, i) => {
    if (segment.isText) {
      result.push(...segment.content);
      return;
    }
    let code = compressCode(segment.content);
    // Spaces at the start and the end of the line (never inside a text literal)
    if (i === 0) {
      let start = 0;
      while (start < code.length && code[start]!.c === " ") start++;
      code = code.slice(start);
    }
    if (i === segments.length - 1) {
      let end = code.length;
      while (end > 0 && code[end - 1]!.c === " ") end--;
      code = code.slice(0, end);
    }
    result.push(...code);
  });
  return result;
}

/** The cleaned lines of the formula, each character with its position in the original text. */
function cleanLines(expression: string): Char[][] {
  const lines: Char[][] = [[]];
  for (const char of removeScopedComments(normalize(expression))) {
    if (char.c === "\n") lines.push([]);
    else lines.at(-1)!.push(char);
  }
  return lines.map(cleanLine).filter((line) => line.length > 0);
}

/**
 * The positions of the characters of a cleaned formula in the original formula: for every line of the cleaned
 * formula, the position of every UTF-16 code unit of the line.
 */
export class CleanUpPositions {
  /** @internal */
  constructor(private readonly lines: readonly (readonly SourcePosition[])[]) {}

  /**
   * The original position of the character at `column` (from 1, in UTF-16 code units) of the cleaned `line`; a
   * column after the end of the line is one column after its last character.
   */
  at(line: number, column: number): SourcePosition | undefined {
    const positions = this.lines[line - 1];
    if (positions === undefined || positions.length === 0) return undefined;
    const position = positions[column - 1];
    if (position !== undefined) return position;
    const last = positions.at(-1)!;
    return { line: last.line, column: last.column + 1 };
  }
}

/**
 * Clean-up stage (docs/semantics/cleanup.md): normalizes white space and line breaks, removes comments,
 * compresses white space outside of text literals and removes empty lines.
 */
export class Cleaner implements ICleaner {
  cleanUp(expression: string): CleanUpResult {
    return this.cleanUpWithPositions(expression).result;
  }

  /**
   * {@link cleanUp}, and the position of every character of the cleaned formula in `expression`, used for the
   * positions of the warnings and of the parsing errors.
   */
  cleanUpWithPositions(expression: string): { readonly result: CleanUpResult; readonly positions: CleanUpPositions } {
    if (expression.trim().length === 0) {
      return {
        result: new CleanUpResult("", Errors.operationError("Input string is empty.")),
        positions: new CleanUpPositions([]),
      };
    }
    // 2. Comments: scoped comments first, line comments line by line; 3. white spaces
    const lines = cleanLines(expression);
    const text = lines.map((line) => line.map((char) => char.c).join("")).join("\n");
    // A code point outside the BMP is 2 code units of the cleaned text
    const positions = lines.map((line) =>
      line.flatMap((char) => (char.c.length === 2 ? [char.position, char.position] : [char.position])),
    );
    return { result: new CleanUpResult(text), positions: new CleanUpPositions(positions) };
  }
}
