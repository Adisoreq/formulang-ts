/**
 * `FORMAT(template, values)` (docs/standards/core/functions/FORMAT.md): placeholders `{}`, `{index}` (follows
 * `@array_indexing`), `{key}`, the decimal places specifier `{:.n}`, and the escapes `{{` and `}}`.
 *
 * @module
 */
import type { IValue } from "../../../abstractions/primitives.js";
import type { IContext } from "../../../abstractions/structures.js";
import { Errors } from "../../errors.js";
import type { FlFunction } from "../../functions/function.js";
import { TypeNames } from "../../primitives/types.js";
import { Value } from "../../primitives/value.js";
import { numberToString, SerializationOptions, serialize } from "../../serialization/serializer.js";
import { isDigit } from "../../utils/chars.js";
import { IdentifierValidator } from "../../validation/validators.js";
import {
  T,
  arr,
  arrayArg,
  fn,
  invalidIndexError,
  isError,
  obj,
  objectArg,
  operationError,
  overload,
  resolveIndex,
  textArg,
  txt,
} from "../helpers.js";

type SelectorKind = "sequential" | "index" | "key";

/** Literal part of the template, or a placeholder with its selector and its optional specifier. */
type TemplatePart =
  | { readonly literal: string }
  | { readonly literal?: undefined; readonly selector: string; readonly specifier: string | undefined };

export const formatFunction = (): FlFunction =>
  fn(
    "FORMAT",
    overload((a, c) => format(txt(a[0]), a[1]!, c), textArg("template"), arrayArg("values")),
    overload((a, c) => format(txt(a[0]), a[1]!, c), textArg("template"), objectArg("values")),
  );

function format(template: string, values: IValue, context: IContext): IValue {
  const parts = parseTemplate(template);
  if (parts === undefined) return operationError('The template has a "{" without a closing "}", or a single "}".');

  const isArray = values.type.base === TypeNames.Array;
  let sequential = false;
  let indexed = false;

  for (const part of parts) {
    if (part.literal !== undefined) continue;
    const kind = classify(part.selector);
    if (kind === "sequential" && isArray) sequential = true;
    else if (kind === "index" && isArray) indexed = true;
    else if (!(kind === "key" && !isArray)) {
      return operationError(`Placeholder "{${part.selector}}" does not match the type of "values".`);
    }
  }
  if (sequential && indexed) return operationError("A template uses either {} or {index} placeholders, not both.");

  let result = "";
  let next = 0;

  for (const part of parts) {
    if (part.literal !== undefined) {
      result += part.literal;
      continue;
    }
    let value: IValue;
    if (isArray) {
      const elements = arr(values);
      if (part.selector.length === 0) {
        if (next >= elements.length) {
          return invalidIndexError("The template has more {} placeholders than elements of the array.");
        }
        value = elements[next++]!;
      } else {
        const index = resolveIndex(Number(part.selector), elements.length, context);
        if (typeof index !== "number") return index;
        value = elements[index]!;
      }
    } else {
      const object = obj(values);
      if (!object.hasKey(part.selector)) {
        return Value.error(Errors.invalidKeyError(`Key "${part.selector}" does not exist.`));
      }
      value = object.getProperty(part.selector)!.getValue();
    }

    if (isError(value)) return value;

    if (part.specifier === undefined) {
      result += serialize(value, SerializationOptions.fromContext(context));
      continue;
    }
    const places = parseDecimalPlaces(part.specifier);
    if (places === undefined) return operationError(`"${part.specifier}" is not a valid format specifier.`);
    if (typeof value.raw !== "number" || value.type.base !== TypeNames.Number) {
      return operationError(`The specifier "${part.specifier}" can be used only with a Number.`);
    }
    result += numberToString(value.raw, places);
  }
  return T(result);
}

/** Splits the template into literals and placeholders, or returns `undefined` for an unclosed `{` or a single `}`. */
function parseTemplate(template: string): TemplatePart[] | undefined {
  const parts: TemplatePart[] = [];
  let literal = "";
  const flushLiteral = (): void => {
    if (literal.length > 0) parts.push({ literal });
    literal = "";
  };

  for (let i = 0; i < template.length; i++) {
    const c = template[i]!;
    const next = template[i + 1];
    if ((c === "{" && next === "{") || (c === "}" && next === "}")) {
      literal += c;
      i++;
    } else if (c === "{") {
      const end = template.indexOf("}", i + 1);
      if (end < 0) return undefined;
      const content = template.slice(i + 1, end);
      const colon = content.indexOf(":");
      flushLiteral();
      parts.push(
        colon < 0
          ? { selector: content, specifier: undefined }
          : { selector: content.slice(0, colon), specifier: content.slice(colon + 1) },
      );
      i = end;
    } else if (c === "}") {
      return undefined;
    } else {
      literal += c;
    }
  }
  flushLiteral();
  return parts;
}

const allDigits = (text: string): boolean => [...text].every(isDigit);

function classify(selector: string): SelectorKind | undefined {
  if (selector.length === 0) return "sequential";
  const digits = selector.startsWith("-") ? selector.slice(1) : selector;
  if (digits.length > 0 && allDigits(digits)) return "index";
  return IdentifierValidator.validate(selector) ? "key" : undefined;
}

/** The `.n` specifier: `n` is a whole number from 0 to 100. */
function parseDecimalPlaces(specifier: string): number | undefined {
  if (specifier.length < 2 || specifier[0] !== "." || !allDigits(specifier.slice(1))) return undefined;
  const places = Number(specifier.slice(1));
  return places <= 100 ? places : undefined;
}
