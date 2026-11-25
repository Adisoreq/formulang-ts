import { describe, expect, it } from "vitest";
import {
  Environment,
  ErrorCode,
  ExpressionKind,
  type ILambdaExpression,
  TokenType,
  Validator,
  Value,
} from "../../src/index.js";
import { clean, cleaner, execute, parse, roots, tokenize, tokenizer } from "../helpers.js";

const { Operator: Op, Identifier: Id, Text: Txt, Number: Num } = TokenType;

// docs/semantics/tokenization.md
describe("Tokenization", () => {
  it("tokenizes the example of the standard", () => {
    const formula =
      '$message = "12.5[rad] in [deg] is:"\n' +
      "$angle := 12.5 * 180 / PI\n" +
      'FORMAT("%s\\n%.1f", [$message, $angle])';
    expect(tokenize(formula)).toEqual([
      [Op, "$"],
      [Id, "message"],
      [Op, "="],
      [Op, '"'],
      [Txt, "12.5[rad] in [deg] is:"],
      [Op, '"'],
      [Op, "\n"],
      [Op, "$"],
      [Id, "angle"],
      [Op, ":="],
      [Num, "12.5"],
      [Op, "*"],
      [Num, "180"],
      [Op, "/"],
      [Id, "PI"],
      [Op, "\n"],
      [Id, "FORMAT"],
      [Op, "("],
      [Op, '"'],
      [Txt, "%s\n%.1f"],
      [Op, '"'],
      [Op, ","],
      [Op, "["],
      [Op, "$"],
      [Id, "message"],
      [Op, ","],
      [Op, "$"],
      [Id, "angle"],
      [Op, "]"],
      [Op, ")"],
    ]);
  });

  it("gives the same tokens after the clean-up", () => {
    const formula = "$angle := 12.5 * 180 / PI";
    expect(tokenize(clean(formula))).toEqual(tokenize(formula));
  });

  it("tokenizes a text concatenation", () =>
    expect(tokenize('"a"+"b"')).toEqual([
      [Op, '"'],
      [Txt, "a"],
      [Op, '"'],
      [Op, "+"],
      [Op, '"'],
      [Txt, "b"],
      [Op, '"'],
    ]));

  it("closes single-character operators immediately", () =>
    expect(tokenize("$x:=2;$y=3")).toEqual([
      [Op, "$"],
      [Id, "x"],
      [Op, ":="],
      [Num, "2"],
      [Op, ";"],
      [Op, "$"],
      [Id, "y"],
      [Op, "="],
      [Num, "3"],
    ]));

  it("never makes a minus part of a number", () => {
    expect(tokenize("$a==-1")).toEqual([
      [Op, "$"],
      [Id, "a"],
      [Op, "=="],
      [Op, "-"],
      [Num, "1"],
    ]);
    expect(tokenize("3-2")).toEqual([
      [Num, "3"],
      [Op, "-"],
      [Num, "2"],
    ]);
  });

  it("gives an empty text all three tokens", () =>
    expect(tokenize('""')).toEqual([
      [Op, '"'],
      [Txt, ""],
      [Op, '"'],
    ]));
  it("starts an identifier at a letter after a number", () =>
    expect(tokenize("2x")).toEqual([
      [Num, "2"],
      [Id, "x"],
    ]));
  it("requires a digit after the sign of an exponent", () =>
    expect(tokenizer.tokenize("1e+x").error.code).toBe(ErrorCode.SyntaxError));
  it("tokenizes member access", () =>
    expect(tokenize("$obj.name")).toEqual([
      [Op, "$"],
      [Id, "obj"],
      [Op, "."],
      [Id, "name"],
    ]));

  it("tokenizes a procedure call without parentheses", () => {
    const expected = [
      [Id, "SET"],
      [Op, "$"],
      [Id, "x"],
      [Num, "100"],
    ];
    expect(tokenize("SET $x 100")).toEqual(expected);
    expect(tokenize(clean("SET $x 100"))).toEqual(expected);
  });

  it("emits a new line token only between lines", () =>
    expect(tokenize("1\n2")).toEqual([
      [Num, "1"],
      [Op, "\n"],
      [Num, "2"],
    ]));

  it("reports the position of a syntax error", () =>
    expect(tokenizer.tokenize("$x = 1\n$y = 1.2.3").error.message).toContain("line 2"));
});

// docs/semantics/cleanup.md
describe("Clean-up", () => {
  it("removes comments (example of the standard)", () =>
    expect(clean("# First comment\n\n$x = 4 # Second comment\n\n$x ^ 2 # Third comment")).toBe("$x=4\n$x^2"));
  it("compresses white space and lines (example of the standard)", () =>
    expect(clean("$x = 2\n$y = 3\n\nMUL($x, $y)")).toBe("$x=2\n$y=3\nMUL($x,$y)"));
  it("normalizes tabs and carriage returns", () => expect(clean("$a\t=\t1\r\n$b = 2\r")).toBe("$a=1\n$b=2"));
  it("removes a semicolon after a comment", () => expect(clean("$x = 1; # note; ignored")).toBe("$x=1;"));
  it("keeps the spaces of an unclosed text literal at the end of the line", () =>
    expect(clean('$x = "abc  ')).toBe('$x="abc  '));
  it("fails for an empty input", () => expect(cleaner.cleanUp("   \n ").successful).toBe(false));
});

// docs/semantics/parsing.md, docs/standards/core/semantics/parsing.md
describe("Parsing", () => {
  const example = 'REQUIRE "core-1+"\n\n$a = 4\n$b = 3\n$c = $a^2 + $b^2\n\nSQRT($c)';

  it("splits the example into sequences", () =>
    expect(roots(example)).toEqual([
      'REQUIRE("core-1+")',
      "SET($a,4)",
      "SET($b,3)",
      "SET($c,ADD(POW($a,2),POW($b,2)))",
      "SQRT($c)",
    ]));

  it("builds the parsing queue of the example", () => {
    const sequence = parse(example).sequences[3]!;
    expect(sequence.queue.map((n) => n.key)).toEqual([
      "$a",
      "2",
      "$b",
      "2",
      "POW($a,2)",
      "POW($b,2)",
      "$c",
      "ADD(POW($a,2),POW($b,2))",
      "SET($c,ADD(POW($a,2),POW($b,2)))",
    ]);
    expect(sequence.queue.map((n) => n.level)).toEqual([4, 4, 4, 4, 3, 3, 2, 2, 1]);
  });

  it("builds the primitive map of the example", () => {
    const map = parse(example).primitiveMap;
    expect(map.size).toBe(15);
    expect(map.get('"core-1+"')?.kind).toBe(ExpressionKind.Value);
    expect(map.get("$a")?.kind).toBe(ExpressionKind.Variable);
    expect(map.get("POW($a,2)")?.kind).toBe(ExpressionKind.FunctionCall);
    expect(map.get("SQRT($c)")?.kind).toBe(ExpressionKind.FunctionCall);
  });

  it("splits sequences only outside of delimiters", () => {
    expect(roots("$x = 1; $y = 2")).toEqual(["SET($x,1)", "SET($y,2)"]);
    expect(roots("[1,\n2]")).toEqual(["ARRAY(1,2)"]);
  });

  it("parses a lambda body as a separate tree", () => {
    const map = parse("MAP($arr, (e) => e * 2)").primitiveMap;
    expect(map.has("(e)=>MUL(e,2)")).toBe(true);
    expect(map.has("MUL(e,2)")).toBe(false);
    const lambda = map.get("(e)=>MUL(e,2)") as ILambdaExpression;
    expect(lambda.body.queue.map((n) => n.key)).toEqual(["e", "2", "MUL(e,2)"]);
    expect(lambda.body.queue[0]?.kind).toBe(ExpressionKind.Parameter);
  });

  it("classifies identifiers", () => {
    const map = parse("[PI, null, true, false, ABS(1)]").primitiveMap;
    expect(map.get("PI")?.kind).toBe(ExpressionKind.Constant);
    expect(map.get("null")?.kind).toBe(ExpressionKind.Value);
    expect(map.get("true")?.kind).toBe(ExpressionKind.Value);
    expect(map.get("ABS(1)")?.kind).toBe(ExpressionKind.FunctionCall);
  });

  it("parses a parenthesized identifier as a grouped expression", () => expect(roots("(x) + 1")).toEqual(["ADD(x,1)"]));
  it("treats an object key spelled like a keyword as a key", () =>
    expect(roots("{ null: 1 }")).toEqual(['OBJECT("null",1)']));
  // core-1.1: a delegate call is translated into CALL (docs/standards/core/semantics/parsing.md, "Delegate call")
  it("translates a delegate call into CALL", () => {
    expect(roots("$square(5)")).toEqual(["CALL($square,5)"]);
    expect(roots("$o.f(1)(2)")).toEqual(['CALL(CALL(GET($o,"f"),1),2)']);
  });
});

// docs/standards/core/semantics/validation.md
describe("Validation", () => {
  const validate = (formula: string, environment = Environment.create()): string[] =>
    new Validator().validate(formula, environment).errors.map((e) => e.toString());

  it("reports every error at once", () =>
    expect(validate('$x = (1\n$y = "a')).toEqual([
      "[SYNTAX_ERROR (2)] Text literal is not closed at line 2, column 6.",
      '[SYNTAX_ERROR (2)] Unclosed "(" at line 1, column 6.',
    ]));

  it("checks the types of the environment variables", () => {
    const environment = Environment.create();
    environment.removeProperty("suppress_errors");
    environment.initVariable("suppress_errors", Value.text("yes"));
    expect(validate("$x = 1", environment)).toEqual([
      '[ENVIRONMENT_ERROR (10)] Environment variable "suppress_errors" is missing or is not of type Boolean.',
    ]);
  });

  it("counts every kind of line break once", () =>
    expect(validate("1\r\n2\r(")).toEqual(['[SYNTAX_ERROR (2)] Unclosed "(" at line 3, column 1.']));

  it("aborts the execution with the validation errors", () => {
    const result = execute('$x = (1\n$y = "a');
    expect(result.validationErrors).toHaveLength(2);
    expect(result.error.code).toBe(ErrorCode.SyntaxError);
    expect(result.successful).toBe(false);
  });
});
