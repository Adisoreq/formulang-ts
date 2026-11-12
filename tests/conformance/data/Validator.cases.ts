// Generated from FormuLang.NET/tests/*/ValidatorTests.cs (Adisoreq/formulang-dotnet@21ce986).
// Test cases of the reference implementation; regenerate instead of editing by hand.

/** `Validation_Example_NoErrors(string formula)` */
export const validation_Example_NoErrors = [
  ["$x = 4 # ok ; ( \""],
  ["$x = \"Item #1\""],
  ["$x = (1 +\n 2)"],
  ["$x = \"a\\\"b\\\\\""],
] as const;

/** `Validation_Example_OneError(string formula, string expected)` */
export const validation_Example_OneError = [
  ["MUL(2, 3", "[SYNTAX_ERROR (2)] Unclosed \"(\" at line 1, column 4."],
  ["ADD(1, 2))", "[SYNTAX_ERROR (2)] Unmatched \")\" at line 1, column 10."],
  ["ADD(1, 2]", "[SYNTAX_ERROR (2)] \"]\" does not match the opening delimiter at line 1, column 9."],
  ["$x = \"a\\qb\"", "[SYNTAX_ERROR (2)] Invalid escape sequence \"\\q\" at line 1, column 9."],
  ["SUM([1; 2])", "[SYNTAX_ERROR (2)] Unexpected \";\" inside a delimiter at line 1, column 7."],
  ["$x = 1 € 2", "[SYNTAX_ERROR (2)] Invalid symbol \"€\" at line 1, column 8."],
] as const;
