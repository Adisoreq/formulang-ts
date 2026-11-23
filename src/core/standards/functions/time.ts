/**
 * Time functions (docs/standards/core/functions/README.md, "10. Time functions"). A point in time is a **Number**:
 * Unix time in milliseconds, UTC. The parts are computed in the local time defined by `@time_offset` (minutes from
 * UTC). Supported years: 1 - 9999.
 *
 * @module
 */
import type { IValue } from "../../../abstractions/primitives.js";
import type { IContext } from "../../../abstractions/structures.js";
import { ArgumentTemplate } from "../../functions/argument-template.js";
import type { FlFunction } from "../../functions/function.js";
import { Types } from "../../primitives/types.js";
import { timeOffset } from "../../structures/context-variables.js";
import { N, T, fn, isWhole, num, numberArg, operationError, overload, textArg, txt } from "../helpers.js";

const MILLISECONDS_PER_MINUTE = 60_000;
/** 0001-01-01T00:00:00.000Z */
const MIN_TIME = -62_135_596_800_000;
/** 9999-12-31T23:59:59.999Z */
const MAX_TIME = 253_402_300_799_999;

const optionalNumberArg = (name: string): ArgumentTemplate =>
  ArgumentTemplate.of(name, Types.Number, { optional: true });

/** Parts of a point in time in the local time of the execution. */
interface LocalTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  /** ISO day of the week: 1 (Monday) - 7 (Sunday). */
  readonly weekday: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
}

/** Converts a point in time to the local time of the execution, or returns the Error. */
function localTime(time: number, context: IContext): LocalTime | IValue {
  if (!isWhole(time)) return operationError('"time" is not a whole number.');
  const milliseconds = time + timeOffset(context) * MILLISECONDS_PER_MINUTE;
  if (!(milliseconds >= MIN_TIME && milliseconds <= MAX_TIME)) {
    return operationError("The point in time is outside of the supported range (years 1 - 9999).");
  }
  const date = new Date(milliseconds);
  const day = date.getUTCDay();
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: day === 0 ? 7 : day,
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    millisecond: date.getUTCMilliseconds(),
  };
}

const isLocalTime = (value: LocalTime | IValue): value is LocalTime => "year" in value;

function timePart(name: string, part: (time: LocalTime) => number): FlFunction {
  return fn(
    name,
    overload((a, c) => {
      const local = localTime(num(a[0]), c);
      return isLocalTime(local) ? N(part(local)) : local;
    }, numberArg("time")),
  );
}

function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DATE_PARTS: readonly (readonly [name: string, min: number, max: number])[] = [
  ["year", 1, 9999],
  ["month", 1, 12],
  ["day", 1, 31],
  ["hour", 0, 23],
  ["minute", 0, 59],
  ["second", 0, 59],
  ["millisecond", 0, 999],
];

function createDate(args: readonly IValue[], context: IContext): IValue {
  const values: number[] = [];
  for (let i = 0; i < DATE_PARTS.length; i++) {
    const [name, min, partMax] = DATE_PARTS[i]!;
    const value = i < args.length ? num(args[i]) : 0;
    if (!isWhole(value)) return operationError(`"${name}" is not a whole number.`);
    const max = i === 2 ? daysInMonth(values[0]!, values[1]!) : partMax;
    if (value < min || value > max) return operationError(`"${name}" is outside of its range (${min} - ${max}).`);
    values.push(value);
  }
  const date = new Date(0);
  date.setUTCFullYear(values[0]!, values[1]! - 1, values[2]!);
  date.setUTCHours(values[3]!, values[4]!, values[5]!, values[6]!);
  return N(date.getTime() - timeOffset(context) * MILLISECONDS_PER_MINUTE);
}

const pad = (value: number, length: number): string => String(value).padStart(length, "0");

/** Tokens of `FORMAT_TIME`; the first one that matches at a position is replaced. */
const TOKENS: readonly (readonly [token: string, write: (time: LocalTime) => string])[] = [
  ["YYYY", (t) => pad(t.year, 4)],
  ["iii", (t) => pad(t.millisecond, 3)],
  ["MM", (t) => pad(t.month, 2)],
  ["DD", (t) => pad(t.day, 2)],
  ["hh", (t) => pad(t.hour, 2)],
  ["mm", (t) => pad(t.minute, 2)],
  ["ss", (t) => pad(t.second, 2)],
];

/**
 * docs/standards/core/functions/FORMAT_TIME.md: the tokens are replaced; text in square brackets is copied; `[[`
 * and `]]` are literal brackets.
 */
function formatTime(time: number, format: string, context: IContext): IValue {
  const local = localTime(time, context);
  if (!isLocalTime(local)) return local;
  let result = "";
  for (let i = 0; i < format.length; i++) {
    const c = format[i]!;
    const next = format[i + 1];
    if ((c === "[" && next === "[") || (c === "]" && next === "]")) {
      result += c;
      i++;
      continue;
    }
    if (c === "[") {
      const end = format.indexOf("]", i + 1);
      if (end < 0) return operationError('The format has a "[" without a closing "]".');
      result += format.slice(i + 1, end);
      i = end;
      continue;
    }
    const match = TOKENS.find(([token]) => format.startsWith(token, i));
    if (match !== undefined) {
      result += match[1](local);
      i += match[0].length - 1;
    } else {
      result += c;
    }
  }
  return T(result);
}

export const timeFunctions = (): FlFunction[] => [
  timePart("YEAR", (t) => t.year),
  timePart("MONTH", (t) => t.month),
  timePart("DAY", (t) => t.day),
  timePart("WEEKDAY", (t) => t.weekday),
  timePart("HOUR", (t) => t.hour),
  timePart("MINUTE", (t) => t.minute),
  timePart("SECOND", (t) => t.second),
  timePart("MILLISECOND", (t) => t.millisecond),
  fn(
    "DATE",
    overload(
      (a, c) => createDate(a, c),
      numberArg("year"),
      numberArg("month"),
      numberArg("day"),
      optionalNumberArg("hour"),
      optionalNumberArg("minute"),
      optionalNumberArg("second"),
      optionalNumberArg("millisecond"),
    ),
  ),
  fn(
    "FORMAT_TIME",
    overload((a, c) => formatTime(num(a[0]), txt(a[1]), c), numberArg("time"), textArg("format")),
  ),
];
