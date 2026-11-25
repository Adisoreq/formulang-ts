/**
 * Arithmetic functions (docs/standards/core/functions/README.md, "1. Arithmetic").
 *
 * @module
 */
import type { IValue } from "../../../abstractions/primitives.js";
import { ArgumentTemplate } from "../../functions/argument-template.js";
import type { FlFunction } from "../../functions/function.js";
import { Types } from "../../primitives/types.js";
import { roundDecimal, roundDouble, roundHalfToEven, type RoundingMode } from "../../utils/number-format.js";
import { N, fn, isWhole, num, numberArg, operationError, overload, textArg, txt, T } from "../helpers.js";

function pow(base: number, exponent: number): IValue {
  if (base === 0 && exponent < 0) return operationError("0 cannot be raised to a negative power.");
  if (base < 0 && !isWhole(exponent)) {
    return operationError("A negative number raised to a fractional power is not a real number.");
  }
  return N(Math.pow(base, exponent));
}

function realRoot(value: number, n: number): number {
  const result = n === 2 ? Math.sqrt(value) : n === 3 ? Math.cbrt(value) : Math.pow(value, 1 / n);
  // Prefer the exact whole root when there is one, e.g. ROOT(16, 4) = 2
  const rounded = roundHalfToEven(result);
  return isWhole(n) && n > 0 && Math.pow(rounded, n) === value ? rounded : result;
}

function root(value: number, n: number): IValue {
  if (n === 0) return operationError("The 0-th root is not defined.");
  if (value < 0) {
    if (isWhole(n) && Math.abs(n % 2) === 1) return N(-realRoot(-value, n));
    return operationError("Root of a negative number is not a real number.");
  }
  return N(realRoot(value, n));
}

function log(value: number, base: number): IValue {
  if (value <= 0) return operationError("Logarithm of a number that is not greater than 0.");
  if (base <= 0 || base === 1) {
    return operationError("The base of a logarithm must be greater than 0 and different from 1.");
  }
  return N(base === 10 ? Math.log10(value) : base === 2 ? Math.log2(value) : Math.log(value) / Math.log(base));
}

/** `CEIL`, `FLOOR`, `ROUND`, `TRUNC`: rounding to `precision` decimal places on the decimal representation. */
function round(value: number, precision: number, mode: RoundingMode): IValue {
  if (!isWhole(precision)) return operationError('"precision" is not a whole number.');
  if (Math.abs(precision) <= 20) {
    const result = roundDecimal(value, precision, mode);
    if (result !== undefined) return N(result);
  }
  return N(roundDouble(value, precision, mode));
}

const binary = (name: string, operation: (a: number, b: number) => IValue): FlFunction =>
  fn(
    name,
    overload((a) => operation(num(a[0]), num(a[1])), numberArg("a"), numberArg("b")),
  );

const rounding = (name: string, mode: RoundingMode): FlFunction =>
  fn(
    name,
    // core-1.1: the precision is optional, 0 by default
    overload(
      (a) => round(num(a[0]), a.length > 1 ? num(a[1]) : 0, mode),
      numberArg("number"),
      ArgumentTemplate.of("precision", Types.Number, { optional: true }),
    ),
  );

export const arithmeticFunctions = (): FlFunction[] => [
  fn(
    "ADD",
    overload((a) => N(num(a[0]) + num(a[1])), numberArg("a"), numberArg("b")),
    overload((a) => T(txt(a[0]) + txt(a[1])), textArg("text1"), textArg("text2")),
  ),
  binary("SUB", (a, b) => N(a - b)),
  binary("MUL", (a, b) => N(a * b)),
  binary("DIV", (a, b) => (b === 0 ? operationError("Division by zero.") : N(a / b))),
  binary("MOD", (a, b) => (b === 0 ? operationError("Division by zero.") : N(a % b))),
  fn(
    "POW",
    overload((a) => pow(num(a[0]), num(a[1])), numberArg("base"), numberArg("exp")),
  ),
  fn(
    "EXP",
    overload((a) => N(Math.exp(num(a[0]))), numberArg("base")),
  ),
  fn(
    "ROOT",
    overload((a) => root(num(a[0]), num(a[1])), numberArg("num"), numberArg("n")),
  ),
  fn(
    "SQRT",
    overload(
      (a) => (num(a[0]) < 0 ? operationError("Square root of a negative number.") : N(Math.sqrt(num(a[0])))),
      numberArg("num"),
    ),
  ),
  fn(
    "LOG",
    overload((a) => log(num(a[0]), num(a[1])), numberArg("value"), numberArg("base")),
  ),
  fn(
    "LN",
    overload(
      (a) =>
        num(a[0]) <= 0 ? operationError("Logarithm of a number that is not greater than 0.") : N(Math.log(num(a[0]))),
      numberArg("value"),
    ),
  ),
  fn(
    "ABS",
    overload((a) => N(Math.abs(num(a[0]))), numberArg("num")),
  ),
  fn(
    "NEG",
    overload((a) => N(0 - num(a[0])), numberArg("num")),
  ),
  rounding("CEIL", "ceiling"),
  rounding("FLOOR", "floor"),
  rounding("ROUND", "awayFromZero"),
  fn(
    "CLAMP",
    overload(
      (a) => {
        const [value, min, max] = [num(a[0]), num(a[1]), num(a[2])];
        return min > max ? operationError('"min" is greater than "max".') : N(Math.min(Math.max(value, min), max));
      },
      numberArg("value"),
      numberArg("min"),
      numberArg("max"),
    ),
  ),
  fn(
    "SIGN",
    overload((a) => N(Math.sign(num(a[0]))), numberArg("num")),
  ),
  rounding("TRUNC", "truncate"),
];
