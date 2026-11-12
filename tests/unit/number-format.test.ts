/* eslint-disable no-loss-of-precision -- the literals are the inputs of the reference implementation, as written there */
import { describe, expect, it } from "vitest";
import { formatNumber, formatNumberFixed, roundDecimal, roundHalfToEven } from "../../src/core/utils/number-format.js";
import { run } from "../helpers.js";

// The expected values are the results of FormuLang.NET (System.Double / System.Decimal of .NET 8).
describe("Number formatting", () => {
  it.each([
    [1234567890123456789, "1234567890123460000"],
    [1e15, "1000000000000000"],
    [123456789012345, "123456789012345"],
    [1234567890123456, "1234567890123456"],
    [999999999999999.9, "999999999999999.9"],
    [0.00001, "0.00001"],
    [0.0001, "0.0001"],
    [0.000012345678901234567, "0.0000123456789012346"],
    [0.00012345678901234567, "0.00012345678901234567"],
    [1.2345678901234567e-7, "0.000000123456789012346"],
    [0.1 + 0.2, "0.30000000000000004"],
    [2 ** 60, "1152921504606850000"],
    [16331239353195370, "16331239353195370"],
    [12345678901234567, "12345678901234568"],
    [123456789012345678, "123456789012346000"],
    [999999999999999999, "1000000000000000000"],
    [-1.5e-10, "-0.00000000015"],
    [Infinity, "Infinity"],
    [-Infinity, "-Infinity"],
    [NaN, "NaN"],
    [-0, "-0"],
  ])("%d → %s", (value, expected) => expect(formatNumber(value)).toBe(expected));

  it.each([
    [1.005, 2, "1.01"],
    [2.675, 2, "2.68"],
    [-0.0001, 3, "0.000"],
    [0.1, 30, "0.100000000000000005551115123126"],
    [1e30, 2, "1000000000000000019884624838656.00"],
    [1.5, 0, "2"],
    [12, 3, "12.000"],
    [1, 120, "1." + "0".repeat(120)],
  ])("%d with %d decimal places → %s", (value, places, expected) =>
    expect(formatNumberFixed(value, places)).toBe(expected),
  );
});

describe("Decimal rounding", () => {
  it.each([
    [1.005, 2, "awayFromZero", 1.01],
    [-2.5, 0, "awayFromZero", -3],
    [123.456, -1, "awayFromZero", 120],
    [1.0000000000000002, 0, "ceiling", 1],
    [-1.5, 0, "floor", -2],
    [-1.5, 0, "truncate", -1],
    [0.1 + 0.2, 20, "awayFromZero", 0.3],
  ] as const)("%d to %d places (%s) → %d", (value, precision, mode, expected) =>
    expect(roundDecimal(value, precision, mode)).toBe(expected),
  );

  it("falls back for numbers out of the decimal range", () => {
    expect(roundDecimal(1e30, 0, "awayFromZero")).toBeUndefined();
    expect(roundDecimal(1e20, 10, "awayFromZero")).toBeUndefined();
  });

  it("rounds midpoints to even like Math.Round", () => {
    expect(roundHalfToEven(2.5)).toBe(2);
    expect(roundHalfToEven(3.5)).toBe(4);
    expect(roundHalfToEven(-2.5)).toBe(-2);
  });

  it.each([
    ["ROUND(1e-25, 30)", "0.0000000000000000000000001"],
    ["TRUNC(5e28, 0)", "50000000000000000000000000000"],
    ["ROUND(2.5, 0)", "3"],
    ["SIN(PI)", "0.000000000000000122464679914735"],
    ["@decimal_place=2; TEXT(2.675)", "2.68"],
    ["@decimal_place=0; TEXT(-0.4)", "0"],
  ])("%j → %s", (formula, expected) => expect(run(formula)).toBe(expected));
});
