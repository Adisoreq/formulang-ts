// Generated from FormuLang.NET/tests/*/StandardDefinitionsTests.cs (Adisoreq/formulang-dotnet@21ce986).
// Test cases of the reference implementation; regenerate instead of editing by hand.

/** `NumberLiterals_AreParsed(string literal, double expected)` */
export const numberLiterals_AreParsed = [
  ["42", 42],
  ["042", 42],
  ["1_000_000", 1000000],
  ["12.5", 12.5],
  [".45", 0.45],
  ["1.", 1],
  ["1.2E+3", 1200],
  ["5.2e-3", 0.0052],
  ["0xFF", 255],
  ["0x1A", 26],
  ["0x40C", 1036],
  ["0x00ff", 255],
] as const;

/** `InvalidNumberLiterals_AreRejected(string literal)` */
export const invalidNumberLiterals_AreRejected = [
  ["abc"],
  [""],
  ["1.2.3"],
  ["_1"],
  ["1_"],
  ["0xG"],
  ["-1"],
] as const;

/** `Identifiers(string identifier, bool valid)` */
export const identifiers = [
  ["x", true],
  ["_tmp1", true],
  ["MAX_VALUE", true],
  ["1st", false],
  ["my key", false],
  ["żółw", false],
  ["", false],
] as const;
