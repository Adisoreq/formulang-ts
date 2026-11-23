/**
 * Type checks, conversions, trigonometric and object functions
 * (docs/standards/core/functions/README.md, sections 6 to 9).
 *
 * @module
 */
import type { IValue } from "../../../abstractions/primitives.js";
import { ArgumentTemplate } from "../../functions/argument-template.js";
import type { FlFunction } from "../../functions/function.js";
import { FlObject } from "../../primitives/object.js";
import { TypeNames, Types } from "../../primitives/types.js";
import { Value } from "../../primitives/value.js";
import { SerializationOptions, serialize } from "../../serialization/serializer.js";
import { IdentifierValidator, NumberValidator } from "../../validation/validators.js";
import {
  A,
  B,
  N,
  T,
  anyArg,
  argumentError,
  arr,
  arrayArg,
  bool,
  booleanArg,
  fn,
  num,
  numberArg,
  obj,
  objectArg,
  operationError,
  overload,
  textArg,
  txt,
} from "../helpers.js";

const isType = (name: string, base: string): FlFunction =>
  fn(
    name,
    overload((a) => B(a[0]!.type.base === base), anyArg("value")),
  );

/** `NUMBER(text)`: a number literal with an optional sign, surrounded by white space; 0 if it is not valid. */
function parseNumber(text: string): number {
  let trimmed = text.trim();
  let sign = 1;
  if (trimmed.startsWith("-") || trimmed.startsWith("+")) {
    sign = trimmed[0] === "-" ? -1 : 1;
    trimmed = trimmed.slice(1);
  }
  const value = NumberValidator.parse(trimmed);
  return value === undefined ? 0 : sign * value;
}

/** Target of the object literal translation: `{ k1: a, "k2": b }` is `OBJECT("k1", a, "k2", b)`. */
function createObject(entries: readonly IValue[]): IValue {
  if (entries.length % 2 !== 0) return argumentError('"OBJECT" expects key-value pairs.');
  const object = new FlObject();
  for (let i = 0; i < entries.length; i += 2) {
    const key = entries[i]!.raw;
    if (typeof key !== "string" || !IdentifierValidator.validate(key)) {
      return argumentError("An object key must be a Text that is a valid identifier.");
    }
    if (!object.initVariable(key, entries[i + 1]!)) return argumentError(`Key "${key}" is defined more than once.`);
  }
  return Value.object(object);
}

export const typeFunctions = (): FlFunction[] => [
  isType("ISNULL", TypeNames.Null),
  isType("ISBOOL", TypeNames.Boolean),
  isType("ISNUM", TypeNames.Number),
  isType("ISTEXT", TypeNames.Text),
  isType("ISERR", TypeNames.Error),
  isType("ISARR", TypeNames.Array),
  isType("ISOBJ", TypeNames.Object),
  isType("ISDEL", TypeNames.Delegate),
];

export const conversionFunctions = (): FlFunction[] => [
  fn(
    "BOOL",
    overload(() => B(false), ArgumentTemplate.of("value", Types.Null)),
    overload((a) => a[0]!, booleanArg("value")),
    overload((a) => B(num(a[0]) !== 0), numberArg("value")),
    overload((a) => B(txt(a[0]).length > 0), textArg("value")),
    overload((a) => B(arr(a[0]).length > 0), arrayArg("value")),
    overload((a) => B(!obj(a[0]).isEmpty()), objectArg("value")),
  ),
  fn(
    "NUMBER",
    overload(() => N(0), ArgumentTemplate.of("value", Types.Null)),
    overload((a) => N(bool(a[0]) ? 1 : 0), booleanArg("value")),
    overload((a) => a[0]!, numberArg("value")),
    overload((a) => N(parseNumber(txt(a[0]))), textArg("value")),
  ),
  // Every type except Error, which is propagated
  fn(
    "TEXT",
    ...[Types.Null, Types.Boolean, Types.Number, Types.Text, Types.Array, Types.Object, Types.Delegate].map((type) =>
      overload((a, c) => T(serialize(a[0]!, SerializationOptions.fromContext(c))), ArgumentTemplate.of("value", type)),
    ),
  ),
];

const OUT_OF_UNIT_RANGE = '"value" is outside of the range from -1 to 1.';

export const trigonometricFunctions = (): FlFunction[] => [
  fn(
    "SIN",
    overload((a) => N(Math.sin(num(a[0]))), numberArg("angle")),
  ),
  fn(
    "COS",
    overload((a) => N(Math.cos(num(a[0]))), numberArg("angle")),
  ),
  fn(
    "TAN",
    overload((a) => N(Math.tan(num(a[0]))), numberArg("angle")),
  ),
  fn(
    "ASIN",
    overload(
      (a) => (Math.abs(num(a[0])) > 1 ? operationError(OUT_OF_UNIT_RANGE) : N(Math.asin(num(a[0])))),
      numberArg("value"),
    ),
  ),
  fn(
    "ACOS",
    overload(
      (a) => (Math.abs(num(a[0])) > 1 ? operationError(OUT_OF_UNIT_RANGE) : N(Math.acos(num(a[0])))),
      numberArg("value"),
    ),
  ),
  fn(
    "ATAN",
    overload((a) => N(Math.atan(num(a[0]))), numberArg("value")),
  ),
  fn(
    "ATAN2",
    overload(
      (a) => (num(a[0]) === 0 && num(a[1]) === 0 ? N(0) : N(Math.atan2(num(a[0]), num(a[1])))),
      numberArg("y"),
      numberArg("x"),
    ),
  ),
  fn(
    "DEG",
    overload((a) => N((num(a[0]) * 180) / Math.PI), numberArg("radians")),
  ),
  fn(
    "RAD",
    overload((a) => N((num(a[0]) * Math.PI) / 180), numberArg("degrees")),
  ),
];

export const objectFunctions = (): FlFunction[] => [
  fn(
    "KEYS",
    overload((a) => A(obj(a[0]).keys.map(T)), objectArg("object")),
  ),
];

/** Target of the object literal translation: `{ k1: a, "k2": b }` is `OBJECT("k1", a, "k2", b)`. */
export const objectLiteralFunctions = (): FlFunction[] => [
  fn(
    "OBJECT",
    overload((a) => createObject(a), ArgumentTemplate.any("entries", { optional: true, multiple: true })),
  ),
];
