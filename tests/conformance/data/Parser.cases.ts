// Generated from FormuLang.NET/tests/*/ParserTests.cs (Adisoreq/formulang-dotnet@21ce986).
// Test cases of the reference implementation; regenerate instead of editing by hand.

/** `OperatorTranslation(string formula, string expected)` */
export const operatorTranslation = [
  ["1+2", "ADD(1,2)"],
  ["1-2", "SUB(1,2)"],
  ["1*2", "MUL(1,2)"],
  ["1/2", "DIV(1,2)"],
  ["1%2", "MOD(1,2)"],
  ["1^2", "POW(1,2)"],
  ["-1", "NEG(1)"],
  ["1==2", "EQU(1,2)"],
  ["1!=2", "NEQ(1,2)"],
  ["1<>2", "NEQ(1,2)"],
  ["1>2", "GRE(1,2)"],
  ["1<2", "LES(1,2)"],
  ["1>=2", "GEQ(1,2)"],
  ["1<=2", "LEQ(1,2)"],
  ["true&&false", "AND(true,false)"],
  ["true||false", "OR(true,false)"],
  ["!true", "NOT(true)"],
  ["$x=1", "SET($x,1)"],
  ["@x=1", "SET(@x,1)"],
  ["$x:=1", "INIT($x,1)"],
  ["$x?=1", "COND_SET($x,1)"],
  ["$a[1]", "GET($a,1)"],
  ["$a[\"key\"]", "GET($a,\"key\")"],
  ["$a.key", "GET($a,\"key\")"],
  ["[1, 2, 3]", "ARRAY(1,2,3)"],
  ["[]", "ARRAY()"],
  ["{ k1: 1, \"k2\": 2 }", "OBJECT(\"k1\",1,\"k2\",2)"],
  ["(p1, p2) => p1", "(p1,p2)=>p1"],
] as const;

/** `BindingPower(string formula, string expected)` */
export const bindingPower = [
  ["-$x^2", "POW(NEG($x),2)"],
  ["-2^2", "POW(NEG(2),2)"],
  ["2^3^2", "POW(2,POW(3,2))"],
  ["$a = $b = 1", "SET($a,SET($b,1))"],
  ["$a.key", "GET($a,\"key\")"],
  ["1 + 2 * 3", "ADD(1,MUL(2,3))"],
  ["1 - 2 - 3", "SUB(SUB(1,2),3)"],
  ["true || false && false", "OR(true,AND(false,false))"],
  ["(1 + 2) * 3", "MUL(ADD(1,2),3)"],
  ["$m[1][0]", "GET(GET($m,1),0)"],
] as const;

/** `ProcedureCallWithoutParentheses(string formula, string expected)` */
export const procedureCallWithoutParentheses = [
  ["SET $x 100", "SET($x,100)"],
  ["SET $x 1 + 2", "SET($x,ADD(1,2))"],
  ["REQUIRE \"core-0.2+\"", "REQUIRE(\"core-0.2+\")"],
  ["SET($x, 100)", "SET($x,100)"],
] as const;

/** `SyntaxErrors(string formula)` */
export const syntaxErrors = [
  ["1 +"],
  ["* 2"],
  ["(1, 2)"],
  ["1 2"],
  ["1 = 2"],
  ["ABS(1) = 2"],
  ["(1) => 2"],
  ["(x, x) => x"],
  ["1 < 2 < 3"],
  ["1 == 2 != 3"],
  ["$a.1"],
  ["$ 1"],
  ["{ \"my key\": 1 }"],
  ["{ 1: 1 }"],
  ["{ x: 1, \"x\": 2 }"],
  ["[1,]"],
  ["ABS(1,)"],
  ["{ x 1 }"],
] as const;
