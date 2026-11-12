/**
 * Number arithmetic and formatting that gives the same results as the reference implementation
 * (FormuLang.NET), where JavaScript differs:
 *
 * - numbers are written without exponent notation; very large and very small numbers are written
 *   with 15 significant digits (like `double.ToString("0.###…")` in .NET);
 * - rounding to decimal places is done on the decimal representation of the number with 15 significant
 *   digits (like `System.Decimal`), so `ROUND(1.005, 2)` is `1.01`, not `1`;
 * - midpoints are rounded away from zero.
 *
 * @module
 */

/** Rounding of a decimal number to a whole number. */
export type RoundingMode = "awayFromZero" | "truncate" | "floor" | "ceiling";

/** Largest magnitude of `System.Decimal` (2^96 - 1). */
const DECIMAL_MAX = 79228162514264337593543950335n;
const DECIMAL_MAX_SCALE = 28;
/** Largest number written with `decimal_place` through the decimal representation. */
const DECIMAL_FORMAT_LIMIT = 7.9e27;
const SIGNIFICANT_DIGITS = 15;

interface ScientificParts {
  /** Significant digits, without a leading or trailing zero (except for the number 0). */
  readonly digits: string;
  /** Decimal exponent of the first digit. */
  readonly exponent: number;
}

/** Splits the output of `Number.prototype.toExponential` into digits and exponent. */
function scientific(text: string): ScientificParts {
  const [mantissa = "0", exponent = "0"] = text.split("e");
  return { digits: mantissa.replace(".", ""), exponent: Number(exponent) };
}

/** Writes `0.digits × 10^(exponent + 1)` in fixed-point notation. */
function fixedPoint(digits: string, exponent: number, negative: boolean): string {
  let integer: string;
  let fraction: string;
  if (exponent >= 0) {
    integer = digits.length > exponent + 1 ? digits.slice(0, exponent + 1) : digits.padEnd(exponent + 1, "0");
    fraction = digits.slice(exponent + 1);
  } else {
    integer = "0";
    fraction = "0".repeat(-exponent - 1) + digits;
  }
  return (negative ? "-" : "") + integer + (fraction.length > 0 ? "." + fraction : "");
}

function nonFinite(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  return value > 0 ? "Infinity" : "-Infinity";
}

/** Largest number of integer digits written in the shortest notation (like the `R` format of .NET, i.e. `G17`). */
const MAX_FIXED_INTEGER_DIGITS = 17;
/** Smallest decimal exponent of the first digit written in the shortest notation (`0.0001`). */
const MIN_FIXED_EXPONENT = -4;

/**
 * Shortest decimal notation of a number that converts back to the same number, without exponent notation.
 * A number that the shortest notation would write with an exponent (at least 10^17, or less than 10^-4) is
 * written with 15 significant digits.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return nonFinite(value);
  if (value === 0) return Object.is(value, -0) ? "-0" : "0";
  const negative = value < 0;
  const magnitude = Math.abs(value);
  const shortest = scientific(magnitude.toExponential());
  if (shortest.exponent + 1 > MAX_FIXED_INTEGER_DIGITS || shortest.exponent < MIN_FIXED_EXPONENT) {
    const rounded = scientific(magnitude.toExponential(SIGNIFICANT_DIGITS - 1));
    const digits = rounded.digits.replace(/0+$/, "") || "0";
    return fixedPoint(digits, rounded.exponent, negative);
  }
  return fixedPoint(shortest.digits, shortest.exponent, negative);
}

// Decimal arithmetic

/** Decimal number `mantissa × 10^-scale`. */
interface DecimalNumber {
  readonly mantissa: bigint;
  readonly scale: number;
}

const POWERS_OF_TEN: bigint[] = [];
function pow10(exponent: number): bigint {
  let cached = POWERS_OF_TEN[exponent];
  if (cached === undefined) {
    cached = 10n ** BigInt(exponent);
    POWERS_OF_TEN[exponent] = cached;
  }
  return cached;
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/** Divides by `10^digits` and rounds the quotient to a whole number. */
function roundDivide(mantissa: bigint, digits: number, mode: RoundingMode): bigint {
  if (digits <= 0) return mantissa * pow10(-digits);
  const divisor = pow10(digits);
  const quotient = mantissa / divisor; // truncated towards zero
  const remainder = mantissa % divisor;
  if (remainder === 0n) return quotient;
  const sign = mantissa < 0n ? -1n : 1n;
  switch (mode) {
    case "truncate":
      return quotient;
    case "floor":
      return sign < 0n ? quotient - 1n : quotient;
    case "ceiling":
      return sign > 0n ? quotient + 1n : quotient;
    case "awayFromZero":
      return abs(remainder) * 2n >= divisor ? quotient + sign : quotient;
  }
}

/**
 * Conversion of a number to a decimal, like the conversion of a `double` to `System.Decimal`:
 * 15 significant digits, at most 28 decimal places. `undefined` if the number is out of the decimal range.
 */
function toDecimal(value: number): DecimalNumber | undefined {
  if (!Number.isFinite(value)) return undefined;
  if (value === 0) return { mantissa: 0n, scale: 0 };
  const { digits, exponent } = scientific(Math.abs(value).toExponential(SIGNIFICANT_DIGITS - 1));
  let mantissa = BigInt(digits) * (value < 0 ? -1n : 1n);
  let scale = SIGNIFICANT_DIGITS - 1 - exponent;
  if (scale < 0) {
    mantissa *= pow10(-scale);
    scale = 0;
  } else if (scale > DECIMAL_MAX_SCALE) {
    mantissa = roundDivide(mantissa, scale - DECIMAL_MAX_SCALE, "awayFromZero");
    scale = DECIMAL_MAX_SCALE;
  }
  return abs(mantissa) > DECIMAL_MAX ? undefined : { mantissa, scale };
}

/** Decimal notation of `mantissa × 10^-scale` with exactly `scale` decimal places. */
function decimalToString(mantissa: bigint, scale: number): string {
  const negative = mantissa < 0n;
  let digits = abs(mantissa).toString();
  if (scale > 0) {
    digits = digits.padStart(scale + 1, "0");
    digits = digits.slice(0, digits.length - scale) + "." + digits.slice(digits.length - scale);
  }
  return (negative ? "-" : "") + digits;
}

/**
 * Rounds a number to `precision` decimal places (tens, hundreds, ... for a negative precision) on its decimal
 * representation. Returns `undefined` when the number is out of the range of the decimal representation;
 * then the caller falls back to {@link roundDouble}.
 */
export function roundDecimal(value: number, precision: number, mode: RoundingMode): number | undefined {
  const decimal = toDecimal(value);
  if (decimal === undefined) return undefined;
  if (precision >= 0) {
    // Scaled value: mantissa × 10^(precision - scale); it must stay in the decimal range
    const shift = precision - decimal.scale;
    if (shift > 0 && abs(decimal.mantissa) * pow10(shift) > DECIMAL_MAX) return undefined;
    const whole = roundDivide(decimal.mantissa, decimal.scale - precision, mode);
    return Number(decimalToString(whole, precision)) + 0;
  }
  const whole = roundDivide(decimal.mantissa, decimal.scale - precision, mode);
  return Number(whole * pow10(-precision)) + 0;
}

/** `Math.Round(value, MidpointRounding.AwayFromZero)` */
export function roundHalfAwayFromZero(value: number): number {
  const whole = Math.trunc(value);
  const fraction = value - whole;
  return Math.abs(fraction) >= 0.5 ? whole + Math.sign(fraction) : whole;
}

/** `Math.Round(value)`: midpoints are rounded to the even number (banker's rounding). */
export function roundHalfToEven(value: number): number {
  const rounded = Math.round(value);
  return Math.abs(value % 1) === 0.5 && rounded % 2 !== 0 ? rounded - 1 : rounded;
}

const DOUBLE_OPERATIONS: Record<RoundingMode, (value: number) => number> = {
  awayFromZero: roundHalfAwayFromZero,
  truncate: Math.trunc,
  floor: Math.floor,
  ceiling: Math.ceil,
};

/** Rounding with binary floating point arithmetic, for numbers out of the decimal range. */
export function roundDouble(value: number, precision: number, mode: RoundingMode): number {
  const factor = Math.pow(10, precision);
  return DOUBLE_OPERATIONS[mode](value * factor) / factor;
}

/**
 * A number written with exactly `decimalPlaces` decimal places (`decimal_place` of serialization),
 * rounded away from zero. A number rounded to zero is never written with a sign.
 */
export function formatNumberFixed(value: number, decimalPlaces: number): string {
  let result: string | undefined;
  if (decimalPlaces <= DECIMAL_MAX_SCALE && Math.abs(value) < DECIMAL_FORMAT_LIMIT) {
    const decimal = toDecimal(value);
    if (decimal !== undefined) {
      const rounded =
        decimal.scale > decimalPlaces
          ? roundDivide(decimal.mantissa, decimal.scale - decimalPlaces, "awayFromZero")
          : decimal.mantissa * pow10(decimalPlaces - decimal.scale);
      result = decimalToString(rounded, decimalPlaces);
    }
  }
  result ??= fixedDouble(value, decimalPlaces);
  return /^-[0.]*$/.test(result) ? result.slice(1) : result;
}

/** Exact fixed-point notation of a binary floating point number. */
function fixedDouble(value: number, decimalPlaces: number): string {
  if (!Number.isFinite(value)) return nonFinite(value);
  const places = Math.min(decimalPlaces, 100);
  let text: string;
  if (Math.abs(value) >= 1e21) {
    // toFixed switches to exponent notation; such numbers are whole
    text = BigInt(value).toString() + (places > 0 ? "." + "0".repeat(places) : "");
  } else {
    text = value.toFixed(places);
  }
  return decimalPlaces > 100 ? text + "0".repeat(decimalPlaces - 100) : text;
}
