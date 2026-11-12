// Generated from FormuLang.NET/tests/*/TokenizerTests.cs (Adisoreq/formulang-dotnet@21ce986).
// Test cases of the reference implementation; regenerate instead of editing by hand.

/** `TextAfterAssignment(string formula)` */
export const textAfterAssignment = [
  ["$x=\"a\""],
  ["$x = \"a\""],
] as const;

/** `TwoCharacterOperators(string op)` */
export const twoCharacterOperators = [
  [":="],
  ["?="],
  ["=>"],
  ["&&"],
  ["||"],
  [">="],
  ["<="],
  ["=="],
  ["<>"],
  ["!="],
] as const;

/** `EscapeSequences(string literal, string content)` */
export const escapeSequences = [
  ["a\\\"b", "a\"b"],
  ["C:\\\\dir", "C:\\dir"],
  ["line\\nnext", "line\nnext"],
  ["tab\\there", "tab\there"],
  ["# not a comment", "# not a comment"],
] as const;

/** `InvalidTextLiterals(string formula)` */
export const invalidTextLiterals = [
  ["\"abc"],
  ["\"abc\\\""],
  ["\"a\nb\""],
  ["\"bad \\x escape\""],
] as const;

/** `NumberLiterals(string literal)` */
export const numberLiterals = [
  ["42"],
  ["042"],
  ["1_000_000"],
  ["12.5"],
  [".45"],
  ["1."],
  ["1.2E+3"],
  ["5.2e-3"],
  ["1e5"],
  ["0xFF"],
  ["0x40C"],
] as const;

/** `InvalidNumberLiterals(string formula)` */
export const invalidNumberLiterals = [
  ["1.2.3"],
  ["0x1.5"],
  ["1e5.5"],
  ["1_"],
  ["1__0"],
  ["1e"],
  ["0x"],
  ["12\"a\""],
] as const;

/** `InvalidSymbols(string formula)` */
export const invalidSymbols = [
  ["$żółw = 1"],
  ["$x = 1 € 2"],
  ["$x\u0001"],
] as const;

/** `UnknownOperators(string formula)` */
export const unknownOperators = [
  ["a & b"],
  ["a | b"],
  ["a ? b"],
  ["a ~ b"],
  ["a ' b"],
] as const;
