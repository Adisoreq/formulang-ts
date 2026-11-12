import { describe, expect, it } from "vitest";
import { CoreStandard, numberToString, arrayToString, SerializationOptions, Value } from "../../src/index.js";
import { expectResult, run } from "../helpers.js";
import { examples } from "./data/CoreFunctions.cases.js";
import {
  functionExamples,
  functionExamples_WithArrayIndexing1,
  serialization_DecimalPlace,
  serialization_MaxArrayPreview,
  serialization_VariablesOfTheExecution,
} from "./data/Core03.cases.js";

// Examples and Errors sections of docs/standards/core/functions/*.md
describe("Core functions", () => {
  it("defines every documented function and procedure", () => {
    const documented = [
      "ABS",
      "ADD",
      "AND",
      "ARRAY",
      "AVG",
      "BOOL",
      "CEIL",
      "CLAMP",
      "CONCAT",
      "DIV",
      "EQU",
      "ERROR",
      "EXP",
      "FILTER",
      "FLOOR",
      "GEQ",
      "GET",
      "GRE",
      "IF",
      "ISARR",
      "ISBOOL",
      "ISDEL",
      "ISERR",
      "ISNULL",
      "ISNUM",
      "ISOBJ",
      "ISTEXT",
      "JOIN",
      "LEN",
      "LEQ",
      "LES",
      "LN",
      "LOG",
      "LOWERCASE",
      "MAP",
      "MAX",
      "MIN",
      "MOD",
      "MUL",
      "NEG",
      "NEQ",
      "NOT",
      "NUMBER",
      "OR",
      "POW",
      "PROD",
      "RANGE",
      "ROOT",
      "ROUND",
      "SPLIT",
      "SQRT",
      "SUB",
      "SUM",
      "TEXT",
      "TRIM",
      "UPPERCASE",
      "XOR",
      "SET",
      "INIT",
      "COND_SET",
      "REQUIRE",
      // Core 0.3
      "SIN",
      "COS",
      "TAN",
      "ASIN",
      "ACOS",
      "ATAN",
      "ATAN2",
      "DEG",
      "RAD",
      "SIGN",
      "TRUNC",
      "SUBSTR",
      "FIND",
      "CONTAINS",
      "STARTS",
      "ENDS",
      "REPLACE",
      "REVERSE",
      "REDUCE",
      "ANY",
      "ALL",
      "SORT",
      "KEYS",
      "HAS",
      "SEQ",
    ];
    const defined = new Set(CoreStandard.instance.namedFunctions.map((f) => f.name));
    expect(documented.filter((name) => !defined.has(name))).toEqual([]);
  });

  it.each(examples)("%j → %s", (formula, expected) => expectResult(run(formula), expected));
});

describe("Core 0.3 functions", () => {
  it.each(functionExamples)("%j → %s", (formula, expected) => expectResult(run(formula), expected));

  it.each(functionExamples_WithArrayIndexing1)("@array_indexing = 1: %j → %s", (formula, expected) =>
    expectResult(run("@array_indexing = 1\n" + formula), expected),
  );
});

// docs/standards/core/semantics/serialization.md
describe("Serialization", () => {
  it.each(serialization_DecimalPlace)("%d with decimal_place %d → %s", (value, decimalPlace, expected) =>
    expect(numberToString(value, decimalPlace)).toBe(expected),
  );

  it.each(serialization_MaxArrayPreview)("max_array_preview %d of %d elements → %s", (preview, count, expected) => {
    const array = Array.from({ length: count }, (_, i) => Value.number(i + 1));
    expect(arrayToString(array, new SerializationOptions(-1, false, false, false, preview))).toBe(expected);
  });

  it.each(serialization_VariablesOfTheExecution)("%j → %s", (formula, expected) =>
    expectResult(run(formula), expected),
  );
});
