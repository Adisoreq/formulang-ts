/**
 * Text functions (docs/standards/core/functions/README.md, "4. Text"). Characters are Unicode code points;
 * positions follow `@array_indexing`.
 *
 * @module
 */
import type { IValue } from "../../../abstractions/primitives.js";
import type { IContext } from "../../../abstractions/structures.js";
import type { FlFunction } from "../../functions/function.js";
import { Value } from "../../primitives/value.js";
import { numberToString, SerializationOptions, serialize } from "../../serialization/serializer.js";
import {
  A,
  B,
  N,
  T,
  anyArg,
  arr,
  arrayArg,
  arrayIndexing,
  fn,
  invalidIndexError,
  isError,
  isWhole,
  num,
  numberArg,
  operationError,
  overload,
  textArg,
  txt,
  valuesEqual,
} from "../helpers.js";
import { codePointLength, codePoints } from "../../utils/chars.js";
import { formatFunction } from "./format.js";

/** Case mapping of every character on its own (like the invariant culture of .NET): `ß` stays `ß`. */
function mapCase(text: string, map: (c: string) => string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const mapped = map(c);
    result += mapped.length === 1 ? mapped : c;
  }
  return result;
}

function trim(text: string): string {
  return text.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, "");
}

function join(elements: readonly IValue[], separator: string, context: IContext): IValue {
  const error = elements.find(isError);
  if (error !== undefined) return error;
  const options = SerializationOptions.fromContext(context);
  return T(elements.map((element) => serialize(element, options)).join(separator));
}

function split(text: string, separator: string): IValue {
  return A((separator.length === 0 ? codePoints(text) : text.split(separator)).map(T));
}

/** Positions and lengths are counted in characters: Unicode code points. */
function substring(value: string, start: number, length: number | undefined, context: IContext): IValue {
  const text = codePoints(value);
  const from = start - arrayIndexing(context);
  if (!isWhole(from) || from < 0 || from > text.length) {
    return invalidIndexError(`Position ${numberToString(start)} is outside of the text.`);
  }
  const count = length ?? text.length - from;
  if (!isWhole(count) || count < 0) return operationError('"length" is not a whole number or is negative.');
  if (from + count > text.length) return invalidIndexError("The part ends after the last character of the text.");
  return T(text.slice(from, from + count).join(""));
}

function findText(text: string, part: string, context: IContext): IValue {
  const index = text.indexOf(part);
  return index < 0 ? Value.null() : N(codePointLength(text.slice(0, index)) + arrayIndexing(context));
}

function findElement(array: readonly IValue[], value: IValue, context: IContext): IValue {
  const index = array.findIndex((element) => valuesEqual(element, value));
  return index < 0 ? Value.null() : N(index + arrayIndexing(context));
}

export const textFunctions = (): FlFunction[] => [
  fn(
    "CONCAT",
    overload((a) => T(txt(a[0]) + txt(a[1])), textArg("text1"), textArg("text2")),
  ),
  fn(
    "TRIM",
    overload((a) => T(trim(txt(a[0]))), textArg("text")),
  ),
  fn(
    "UPPERCASE",
    overload((a) => T(mapCase(txt(a[0]), (c) => c.toUpperCase())), textArg("text")),
  ),
  fn(
    "LOWERCASE",
    overload((a) => T(mapCase(txt(a[0]), (c) => c.toLowerCase())), textArg("text")),
  ),
  fn(
    "JOIN",
    overload(
      (a, c) => join(arr(a[0]), a.length > 1 ? txt(a[1]) : "", c),
      arrayArg("array"),
      textArg("separator", true),
    ),
  ),
  fn(
    "SPLIT",
    overload((a) => split(txt(a[0]), txt(a[1])), textArg("text"), textArg("separator")),
  ),
  fn(
    "SUBSTR",
    overload((a, c) => substring(txt(a[0]), num(a[1]), undefined, c), textArg("text"), numberArg("start")),
    overload(
      (a, c) => substring(txt(a[0]), num(a[1]), num(a[2]), c),
      textArg("text"),
      numberArg("start"),
      numberArg("length"),
    ),
  ),
  fn(
    "FIND",
    overload((a, c) => findText(txt(a[0]), txt(a[1]), c), textArg("text"), textArg("part")),
    overload((a, c) => findElement(arr(a[0]), a[1]!, c), arrayArg("array"), anyArg("value")),
  ),
  fn(
    "CONTAINS",
    overload((a) => B(txt(a[0]).includes(txt(a[1]))), textArg("text"), textArg("part")),
    overload((a) => B(arr(a[0]).some((e) => valuesEqual(e, a[1]!))), arrayArg("array"), anyArg("value")),
  ),
  fn(
    "STARTS",
    overload((a) => B(txt(a[0]).startsWith(txt(a[1]))), textArg("text"), textArg("part")),
  ),
  fn(
    "ENDS",
    overload((a) => B(txt(a[0]).endsWith(txt(a[1]))), textArg("text"), textArg("part")),
  ),
  fn(
    "REPLACE",
    overload(
      (a) =>
        txt(a[1]).length === 0
          ? operationError('"search" is an empty text.')
          : T(txt(a[0]).split(txt(a[1])).join(txt(a[2]))),
      textArg("text"),
      textArg("search"),
      textArg("replacement"),
    ),
  ),
  fn(
    "REVERSE",
    overload((a) => A([...arr(a[0])].reverse()), arrayArg("array")),
    overload((a) => T(codePoints(txt(a[0])).reverse().join("")), textArg("text")),
  ),
  formatFunction(),
];
