import type { ICleaner } from "../../abstractions/processing.js";
import { Errors } from "../errors.js";
import { isOperatorCharacter } from "../utils/chars.js";
import { CleanUpResult } from "./results.js";

const TEXT_DELIMITER = '"';
const ESCAPE = "\\";
const COMMENT = "#";

interface Segment {
  readonly content: string;
  readonly isText: boolean;
}

/** Splits a line into code and text literal segments, and drops a comment outside of text. */
function splitLine(line: string): Segment[] {
  const segments: Segment[] = [];
  let current = "";
  let insideText = false;
  let escape = false;
  for (const c of line) {
    if (insideText) {
      current += c;
      if (escape) escape = false;
      else if (c === ESCAPE) escape = true;
      else if (c === TEXT_DELIMITER) {
        segments.push({ content: current, isText: true });
        current = "";
        insideText = false;
      }
      continue;
    }
    if (c === COMMENT) break;
    if (c === TEXT_DELIMITER) {
      if (current.length > 0) segments.push({ content: current, isText: false });
      current = c;
      insideText = true;
      continue;
    }
    current += c;
  }
  if (current.length > 0) segments.push({ content: current, isText: insideText });
  return segments;
}

const isCompressibleOperator = (c: string | undefined): boolean =>
  c !== undefined && c !== TEXT_DELIMITER && isOperatorCharacter(c);

/** Collapses runs of spaces and removes the spaces next to operators. */
function compressCode(code: string): string {
  let result = "";
  for (let i = 0; i < code.length; i++) {
    const c = code[i]!;
    if (c !== " ") {
      result += c;
      continue;
    }
    // A run of spaces: keep only the last one
    if (code[i + 1] === " ") continue;
    if (isCompressibleOperator(result.at(-1)) || isCompressibleOperator(code[i + 1])) continue;
    result += c;
  }
  return result;
}

function cleanLine(line: string): string {
  const segments = splitLine(line);
  let result = "";
  segments.forEach((segment, i) => {
    if (segment.isText) {
      result += segment.content;
      return;
    }
    let code = compressCode(segment.content);
    // Spaces at the start and the end of the line (never inside a text literal)
    if (i === 0) code = code.replace(/^ +/, "");
    if (i === segments.length - 1) code = code.replace(/ +$/, "");
    result += code;
  });
  return result;
}

/**
 * Clean-up stage (docs/semantics/cleanup.md): normalizes white space and line breaks, removes comments,
 * compresses white space outside of text literals and removes empty lines.
 */
export class Cleaner implements ICleaner {
  cleanUp(expression: string): CleanUpResult {
    if (expression.trim().length === 0) return new CleanUpResult("", Errors.operationError("Input string is empty."));
    const normalized = expression.replaceAll("\t", " ").replaceAll("\r\n", "\n").replaceAll("\r", "\n");
    const lines = normalized
      .split("\n")
      .map(cleanLine)
      .filter((line) => line.length > 0);
    return new CleanUpResult(lines.join("\n"));
  }
}
