// Generated from FormuLang.NET/tests/*/ExecutionTests.cs (Adisoreq/formulang-dotnet@21ce986).
// Test cases of the reference implementation; regenerate instead of editing by hand.

/** `ReadingVariables(string formula, string expected)` */
export const readingVariables = [
  ["$x", "[SUCCESS (0)] Operation completed successfully."],
  ["$x\n$x + 1", "[UNDEFINED_ERROR (12)] Variable \"x\" has no value."],
  ["$y + 1", "[UNKNOWN_SYMBOL_ERROR (5)] Variable \"y\" is not defined."],
  ["$x\n$x = 2\n$x", "2"],
  ["@x", "[ENVIRONMENT_ERROR (10)] Environment variable \"x\" is not defined."],
  ["UNKNOWN", "[UNKNOWN_SYMBOL_ERROR (5)] Constant \"UNKNOWN\" is not defined."],
  ["UNKNOWN(1)", "[UNKNOWN_SYMBOL_ERROR (5)] Function \"UNKNOWN\" is not defined."],
] as const;

/** `Set(string formula, string expected)` */
export const set = [
  ["SET $x 4.25\n$x", "4.25"],
  ["$x = 4.25\n$x", "4.25"],
  ["$x\n$x = 1.2\n$x", "1.2"],
  ["$x = TRUE\n$x = 1.2", "[TYPE_ERROR (4)] Trying to override BOOLEAN value with NUMBER."],
  ["$array_indexing = 1", "[INVALID_IDENTIFIER_ERROR (9)] \"array_indexing\" symbol is already defined by environment."],
  ["@array_indexing = 1\n@array_indexing", "1"],
  ["@x = 1", "[ENVIRONMENT_ERROR (10)] Environment variable \"x\" is not defined."],
  ["@array_indexing = \"one\"", "[TYPE_ERROR (4)] Trying to override NUMBER value with TEXT."],
  ["SET(5, 1)", "[ARGUMENT_ERROR (6)] No overload of \"SET\" matches the arguments (Number, Number)."],
  ["$x = ERROR(\"e\")", "[CUSTOM_ERROR (1)] e"],
] as const;

/** `Init(string formula, string expected)` */
export const init = [
  ["INIT $count 0\n$count", "0"],
  ["$count := 0\n$count", "0"],
  ["$count = 5\n$count := 0\n$count", "5"],
  ["$count\n$count := 0\n$count", "0"],
  ["@array_indexing := 1\n@array_indexing", "0"],
  ["@x := 1", "[ENVIRONMENT_ERROR (10)] Environment variable \"x\" is not defined."],
] as const;

/** `ConditionalSet(string formula, string expected)` */
export const conditionalSet = [
  ["$x = 1\nCOND_SET $x 2\n$x", "2"],
  ["$x = 1\n$x ?= 2\n$x", "2"],
  ["$x ?= 2\n$x + 0", "[UNKNOWN_SYMBOL_ERROR (5)] Variable \"x\" is not defined."],
  ["$x = 1\n$x ?= \"text\"", "[TYPE_ERROR (4)] Trying to override NUMBER value with TEXT."],
  ["@array_indexing ?= 1\n@array_indexing", "1"],
  ["@x ?= 1", "[SUCCESS (0)] Operation completed successfully."],
] as const;

/** `Require(string formula, string expected)` */
export const require = [
  ["REQUIRE \"core-0.2+\"", "[SUCCESS (0)] Operation completed successfully."],
  ["REQUIRE([\"core-0.x\", \"core-0.3\"])", "[SUCCESS (0)] Operation completed successfully."],
  ["REQUIRE \"stock-5.2+\"", "[NOT_SUPPORTED_ERROR (11)] Standard \"stock-5.2+\" is not supported."],
  ["REQUIRE \"core-1.0+\"", "[NOT_SUPPORTED_ERROR (11)] Standard \"core-1.0+\" is not supported."],
  ["REQUIRE \"core\"", "[OPERATION_ERROR (3)] \"core\" is not a valid standard requirement."],
  ["REQUIRE([1])", "[ARGUMENT_ERROR (6)] No overload of \"REQUIRE\" matches the arguments (Array)."],
] as const;

/** `RequirementFormat(string requirement, string standard, bool satisfied)` */
export const requirementFormat = [
  ["core-0.2", "core-0.2", true],
  ["core-0.2", "core-0.1", false],
  ["core-0.2", "core-1.0", false],
  ["core-0.2+", "core-0.5", true],
  ["core-0.2+", "core-1.0", false],
  ["core-0.x", "core-0.1", true],
  ["core-0.x", "core-1.0", false],
  ["core-1", "core-1.4", true],
  ["core-1", "core-2.0", false],
  ["core-1+", "core-2.3", true],
  ["core-1+", "core-0.2", false],
  ["stock-5.2+", "stock-5.7", true],
  ["stock-5.2+", "stock-6.0", false],
] as const;

/** `ContextExamples(string formula, string expected)` */
export const contextExamples = [
  ["$elements = ARRAY(1, 2, 3, 4, 5)\n$n = 5\n$sum = SUM($elements)\nDIV($sum, $n)", "3"],
  ["$elements = ARRAY(10, 20, 30, 40, 50)\nSUB(MAX($elements), MIN($elements))", "40"],
  ["$x\nCLAMP($x, 0, 1)", "[UNDEFINED_ERROR (12)] Variable \"x\" has no value."],
  ["$x\n$x = 1.2\nCLAMP($x, 0, 1)", "1"],
] as const;

/** `EnvironmentExamples(string formula, string expected)` */
export const environmentExamples = [
  ["$standards = JOIN(STANDARDS, \", \")\nCONCAT(\"Supported standards: \", $standards)", "Supported standards: core-0.3"],
  ["REQUIRE \"core-0.3\"\nREQUIRE \"stock-5.2+\"\n$diff = CLOSE[I] - OPEN[I]", "[NOT_SUPPORTED_ERROR (11)] Standard \"stock-5.2+\" is not supported."],
  ["$radius = 2\nMUL(PI, POW($radius, 2))", "12.566370614359172"],
  ["@array_indexing = 1\n$elements = ARRAY(10, 20, 30, 40)\n$elements[1]", "10"],
] as const;

/** `CoreExamples(string formula, string expected)` */
export const coreExamples = [
  ["5 + 3", "8"],
  ["15 * 0.5", "7.5"],
  ["4.2E+3 * 2E-2", "84"],
  ["$a = -40\n$b = .8\n$c = 2.5e-1\n$d = 0x2c\n$a * $b + $c * $d", "-21"],
  ["\"Hello, world!\"", "Hello, world!"],
  ["\"A1\\tB1\\nA2\\tB2\"", "A1\tB1\nA2\tB2"],
  ["\"Backslash: \\\\\\nHashtag: #\\nQuotation: \\\"\"", "Backslash: \\\nHashtag: #\nQuotation: \""],
  ["$text1 = \"Hello\"\n$text2 = \"world!\"\nJOIN([$text1, $text2], \", \")", "Hello, world!"],
  ["$text = \"apples | bananas | lemons\"\nSPLIT($text, \" | \")", "[\"apples\", \"bananas\", \"lemons\"]"],
  ["$a1 = ARRAY(1, 2, 3)\n$a2 = ARRAY(\"a\", \"b\", \"c\")\n[$a1, $a2]", "[[1, 2, 3], [\"a\", \"b\", \"c\"]]"],
  ["$a = 1\n$b = -3\n$c = 2\n$delta = $b^2 - 4*$a*$c\n$delta", "1"],
  ["$arr = [2, 4, 4, 4, 5, 5, 7, 9]\n$stdev = ROOT(SUM(MAP($arr, (e) => (e - AVG($arr))^2)) / LEN($arr), 2)\n$stdev", "2"],
  ["$arr = [2, 4, 4, 4, 5, 5, 7, 9]\nROOT(DIV(SUM(MAP($arr, (e) => POW(SUB(e, AVG($arr)), 2))), LEN($arr)), 2)", "2"],
  ["$x1 = 0\n$y1 = 0\n$x2 = 3\n$y2 = 4\n$d = (($x2 - $x1)^2 + ($y2 - $y1)^2) ^ 0.5\n$d", "5"],
  ["$p = 1000\n$r = 0.1\n$n = 1\n$t = 2\n$a = $p * (1 + $r/$n)^($n*$t)\nROUND($a, 2)", "1210"],
] as const;

/** `Lambdas(string formula, string expected)` */
export const lambdas = [
  ["$f = (x) => x * 2\nISDEL($f)", "true"],
  ["$f = (x, y) => x * y\nTEXT($f)", "(x, y) => any"],
  ["MAP([1, 2], (a, b, c) => a)", "[ARGUMENT_ERROR (6)] The lambda passed to \"MAP\" must have 1 or 2 parameter(s)."],
  ["MAP([1, 2], (e) => DIV(1, e - 1))", "[OPERATION_ERROR (3)] Division by zero."],
  ["$k = 10\nMAP([1, 2], (e) => e + $k)", "[11, 12]"],
  ["MAP([[1, 2], [3]], (row) => SUM(MAP(row, (e) => e * 10)))", "[30, 30]"],
  ["MAP([-1, 2], ABS)", "[1, 2]"],
] as const;
