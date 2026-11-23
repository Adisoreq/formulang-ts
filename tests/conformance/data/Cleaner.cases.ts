// Generated from FormuLang.NET/tests/*/CleanerTests.cs (Adisoreq/formulang-dotnet@7e85d55).
// Test cases of the reference implementation; regenerate instead of editing by hand.

/** `HashInsideTextLiteral_IsNotAComment(string input, string expected)` */
export const hashInsideTextLiteral_IsNotAComment = [
  ["$x = \"Item #1\"", "$x=\"Item #1\""],
  ["$x = \"a\\\"#b\" # comment", "$x=\"a\\\"#b\""],
  ["$x = \"a\\\\\" # comment", "$x=\"a\\\\\""],
] as const;

/** `OnlySpacesNextToOperatorsAreRemoved(string input, string expected)` */
export const onlySpacesNextToOperatorsAreRemoved = [
  ["SET $x 100", "SET$x 100"],
  ["SET   $x    100", "SET$x 100"],
  ["\"hello  world\"  +  \"x\"", "\"hello  world\"+\"x\""],
  ["REQUIRE \"core-1+\"", "REQUIRE \"core-1+\""],
] as const;
