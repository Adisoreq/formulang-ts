/**
 * Logic, comparison and control flow functions (docs/standards/core/functions/README.md, sections 2 and 3).
 *
 * @module
 */
import type { FlFunction } from "../../functions/function.js";
import { Errors } from "../../errors.js";
import { shortCircuitFunctions } from "./core12.js";
import {
  B,
  anyArg,
  bool,
  booleanArg,
  errorValue,
  fn,
  num,
  numberArg,
  overload,
  textArg,
  txt,
  valuesEqual,
} from "../helpers.js";

const booleans = (name: string, operation: (a: boolean, b: boolean) => boolean): FlFunction =>
  fn(
    name,
    overload((a) => B(operation(bool(a[0]), bool(a[1]))), booleanArg("a"), booleanArg("b")),
  );

const comparison = (name: string, operation: (a: number, b: number) => boolean): FlFunction =>
  fn(
    name,
    overload((a) => B(operation(num(a[0]), num(a[1]))), numberArg("a"), numberArg("b")),
  );

export const logicFunctions = (): FlFunction[] => [
  // Logic and comparison. Arguments are always computed; since core-1.2 the first false (AND) or true (OR) decides
  // the result of AND and OR, and the arguments after it are discarded
  ...shortCircuitFunctions(),
  booleans("XOR", (a, b) => a !== b),
  fn(
    "NOT",
    overload((a) => B(!bool(a[0])), booleanArg("val")),
  ),
  fn(
    "EQU",
    overload((a) => B(valuesEqual(a[0]!, a[1]!)), anyArg("a"), anyArg("b")),
  ),
  fn(
    "NEQ",
    overload((a) => B(!valuesEqual(a[0]!, a[1]!)), anyArg("a"), anyArg("b")),
  ),
  comparison("GRE", (a, b) => a > b),
  comparison("LES", (a, b) => a < b),
  comparison("GEQ", (a, b) => a >= b),
  comparison("LEQ", (a, b) => a <= b),
];

export const controlFunctions = (): FlFunction[] => [
  // The unselected value is discarded, even if it is an Error
  fn(
    "IF",
    overload((a) => (bool(a[0]) ? a[1]! : a[2]!), booleanArg("condition"), anyArg("then"), anyArg("else")),
  ),
  fn(
    "ERROR",
    overload((a) => errorValue(Errors.customError(txt(a[0]))), textArg("message")),
  ),
];
