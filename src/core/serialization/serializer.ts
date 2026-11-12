/**
 * Serialization of values to text (docs/standards/core/semantics/serialization.md).
 *
 * @module
 */
import type { IFunction, ILambda } from "../../abstractions/functions.js";
import type { IError, IObject, IValue } from "../../abstractions/primitives.js";
import { FunctionType } from "../../abstractions/primitives.js";
import type { IContext, IEnvironment } from "../../abstractions/structures.js";
import { TypeNames } from "../primitives/types.js";
import { formatNumber, formatNumberFixed } from "../utils/number-format.js";

/** Names of the serialization variables of the Core environment. */
export const SerializationVariables = {
  decimalPlace: "decimal_place",
  splitArray: "split_array",
  splitObject: "split_object",
  includeObjectClass: "include_object_class",
  maxArrayPreview: "max_array_preview",
} as const;

/** Options of serialization, read from the environment variables of an execution. */
export class SerializationOptions {
  /** Default values of the serialization variables. */
  static readonly default = new SerializationOptions();

  constructor(
    /** Decimal places of a number; `-1` writes the shortest notation. */
    readonly decimalPlace: number = -1,
    /** Writes every element of an array on its own line. */
    readonly splitArray: boolean = false,
    /** Writes every property of an object on its own line. */
    readonly splitObject: boolean = false,
    /** Writes the class of an object before it: `[Object] { }`. */
    readonly includeObjectClass: boolean = false,
    /** Maximal number of elements of an array that are written; `-1` writes every element. */
    readonly maxArrayPreview: number = -1,
  ) {
    Object.freeze(this);
  }

  /** Options of an execution: the (possibly overridden) environment variables of the context. */
  static fromContext(context: IContext): SerializationOptions {
    return SerializationOptions.fromVariables((name) => {
      const variable = context.environmentVariables.getProperty(name) ?? context.environment.getProperty(name);
      return variable?.getValue();
    });
  }

  /** Options given by the default values of the environment variables. */
  static fromEnvironment(environment: IEnvironment): SerializationOptions {
    return SerializationOptions.fromVariables((name) => environment.getProperty(name)?.getValue());
  }

  private static fromVariables(read: (name: string) => IValue | undefined): SerializationOptions {
    const defaults = SerializationOptions.default;
    const whole = (name: string, fallback: number): number => {
      const raw = read(name)?.raw;
      return typeof raw === "number" && Number.isInteger(raw)
        ? Math.min(Math.max(raw, -2147483648), 2147483647)
        : fallback;
    };
    const flag = (name: string, fallback: boolean): boolean => {
      const raw = read(name)?.raw;
      return typeof raw === "boolean" ? raw : fallback;
    };
    return new SerializationOptions(
      whole(SerializationVariables.decimalPlace, defaults.decimalPlace),
      flag(SerializationVariables.splitArray, defaults.splitArray),
      flag(SerializationVariables.splitObject, defaults.splitObject),
      flag(SerializationVariables.includeObjectClass, defaults.includeObjectClass),
      whole(SerializationVariables.maxArrayPreview, defaults.maxArrayPreview),
    );
  }
}

const INDENT = "  ";
const OMITTED = "...";

/** Text of a value. Texts nested in arrays and objects are written as literals. */
export function serialize(value: IValue, options: SerializationOptions = SerializationOptions.default): string {
  return serializeValue(value, options, false);
}

function serializeValue(value: IValue, options: SerializationOptions, nested: boolean): string {
  switch (value.type.base) {
    case TypeNames.Null:
      return "null";
    case TypeNames.Undefined:
      return "undefined";
    case TypeNames.Boolean:
      return value.raw === true ? "true" : "false";
    case TypeNames.Number:
      return numberToString(typeof value.raw === "number" ? value.raw : 0, options.decimalPlace);
    case TypeNames.Text: {
      const text = typeof value.raw === "string" ? value.raw : "";
      return nested ? textToLiteral(text) : text;
    }
    case TypeNames.Error:
      return errorToString(value.raw as IError | undefined);
    case TypeNames.Array:
      return arrayToString(Array.isArray(value.raw) ? (value.raw as IValue[]) : [], options);
    case TypeNames.Object:
      return objectToString(value.raw as IObject | undefined, value.type.extended, options);
    case TypeNames.Delegate:
      return delegateToString(value.raw as IFunction | undefined);
    case TypeNames.Variable:
      return String(value.raw);
    default:
      throw new Error(`Unsupported value type: ${value.type.base}`);
  }
}

/** A number with `decimalPlace` decimal places, or in the shortest notation for a negative `decimalPlace`. */
export function numberToString(value: number, decimalPlace = -1): string {
  return decimalPlace < 0 ? formatNumber(value) : formatNumberFixed(value, decimalPlace);
}

const ESCAPES: Readonly<Record<string, string>> = { "\\": "\\\\", '"': '\\"', "\n": "\\n", "\t": "\\t" };

/** A text written as a literal: quoted, with `\\`, `\"`, `\n` and `\t` escaped. */
export function textToLiteral(value: string): string {
  return '"' + value.replace(/[\\"\n\t]/g, (c) => ESCAPES[c] ?? c) + '"';
}

export function errorToString(value: IError | undefined): string {
  return value === undefined ? "[UNKNOWN_ERROR]" : `[${value.name} (${value.code})] ${value.message}`;
}

export function arrayToString(
  value: readonly IValue[],
  options: SerializationOptions = SerializationOptions.default,
): string {
  if (value.length === 0) return "[]";
  const k = options.maxArrayPreview;
  const element = (v: IValue): string => serializeValue(v, options, true);
  let elements: string[];
  if (k < 0 || value.length <= k) {
    elements = value.map(element);
  } else {
    const head = Math.floor((k + 1) / 2);
    const tail = Math.floor(k / 2);
    elements = [...value.slice(0, head).map(element), OMITTED, ...value.slice(value.length - tail).map(element)];
  }
  return enclose("[", elements, "]", options.splitArray, "");
}

export function objectToString(
  value: IObject | undefined,
  extendedType: string | undefined = undefined,
  options: SerializationOptions = SerializationOptions.default,
): string {
  const prefix = options.includeObjectClass ? `[${extendedType ?? TypeNames.Object}] ` : "";
  if (value === undefined || value.isEmpty()) return prefix + "{ }";
  const pairs = value.keys.map((key) => {
    const property = value.getProperty(key);
    const text = property === undefined ? "undefined" : serializeValue(property.getValue(), options, true);
    return `${key}: ${text}`;
  });
  return prefix + enclose("{", pairs, "}", options.splitObject, " ");
}

function enclose(open: string, parts: readonly string[], close: string, split: boolean, padding: string): string {
  if (!split) return open + padding + parts.join(", ") + padding + close;
  const lines = parts.map((part) => INDENT + part.replaceAll("\n", "\n" + INDENT));
  return open + "\n" + lines.join(",\n") + "\n" + close;
}

export function delegateToString(fn: IFunction | undefined): string {
  if (fn === undefined) return "() => any";
  return fn.functionType === FunctionType.Lambda
    ? `(${(fn as ILambda).parameters.join(", ")}) => any`
    : `${fn.name}(args) => any`;
}
