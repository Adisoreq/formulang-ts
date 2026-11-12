import { describe, expect, it } from "vitest";
import {
  Environment,
  ErrorCode,
  IdentifierValidator,
  NumberValidator,
  TokenType,
  Validator,
  Value,
} from "../../src/index.js";
import { clean, parse, roots, tokenize, tokenizer } from "../helpers.js";
import { hashInsideTextLiteral_IsNotAComment, onlySpacesNextToOperatorsAreRemoved } from "./data/Cleaner.cases.js";
import {
  bindingPower,
  operatorTranslation,
  procedureCallWithoutParentheses,
  syntaxErrors,
} from "./data/Parser.cases.js";
import { serialization_Numbers } from "./data/Primitives.cases.js";
import {
  identifiers,
  invalidNumberLiterals_AreRejected,
  numberLiterals_AreParsed,
} from "./data/StandardDefinitions.cases.js";
import {
  escapeSequences,
  invalidNumberLiterals,
  invalidSymbols,
  invalidTextLiterals,
  numberLiterals,
  textAfterAssignment,
  twoCharacterOperators,
  unknownOperators,
} from "./data/Tokenizer.cases.js";
import { validation_Example_NoErrors, validation_Example_OneError } from "./data/Validator.cases.js";

const { Operator: Op, Identifier: Id, Text: Txt, Number: Num } = TokenType;

// docs/semantics/cleanup.md
describe("Clean-up", () => {
  it.each(hashInsideTextLiteral_IsNotAComment)("%j → %j", (input, expected) => expect(clean(input)).toBe(expected));
  it.each(onlySpacesNextToOperatorsAreRemoved)("%j → %j", (input, expected) => expect(clean(input)).toBe(expected));
});

// docs/semantics/tokenization.md
describe("Tokenization", () => {
  it.each(textAfterAssignment)("%j", (formula) =>
    expect(tokenize(formula)).toEqual([
      [Op, "$"],
      [Id, "x"],
      [Op, "="],
      [Op, '"'],
      [Txt, "a"],
      [Op, '"'],
    ]),
  );
  it.each(twoCharacterOperators)("2-character operator %s", (op) =>
    expect(tokenize(`a${op}b`)).toEqual([
      [Id, "a"],
      [Op, op],
      [Id, "b"],
    ]),
  );
  it.each(escapeSequences)("escape sequence %j", (literal, content) =>
    expect(tokenize(`"${literal}"`)).toEqual([
      [Op, '"'],
      [Txt, content],
      [Op, '"'],
    ]),
  );
  it.each(numberLiterals)("number literal %s", (literal) => expect(tokenize(literal)).toEqual([[Num, literal]]));

  const syntaxError = (formula: string): void =>
    expect(tokenizer.tokenize(formula).error.code).toBe(ErrorCode.SyntaxError);
  it.each(invalidTextLiterals)("invalid text literal %j", syntaxError);
  it.each(invalidNumberLiterals)("invalid number literal %j", syntaxError);
  it.each(invalidSymbols)("invalid symbol %j", syntaxError);
  it.each(unknownOperators)("unknown operator %j", syntaxError);
});

// docs/standards/core/semantics/parsing.md
describe("Parsing", () => {
  it.each(operatorTranslation)("translates %j into %s", (formula, expected) =>
    expect(roots(formula)).toEqual([expected]),
  );
  it.each(bindingPower)("binding power: %j is %s", (formula, expected) => expect(roots(formula)).toEqual([expected]));
  it.each(procedureCallWithoutParentheses)("procedure call %j is %s", (formula, expected) =>
    expect(roots(formula)).toEqual([expected]),
  );
  it.each(syntaxErrors)("syntax error: %j", (formula) => expect(parse(formula).error.code).toBe(ErrorCode.SyntaxError));
});

// docs/standards/core/semantics/validation.md
describe("Validation", () => {
  const validate = (formula: string): string[] =>
    new Validator().validate(formula, Environment.create()).errors.map((e) => e.toString());
  it.each(validation_Example_NoErrors)("%j has no errors", (formula) => expect(validate(formula)).toEqual([]));
  it.each(validation_Example_OneError)("%j → %s", (formula, expected) => expect(validate(formula)).toEqual([expected]));
});

describe("Literals and identifiers (docs/syntax)", () => {
  it.each(numberLiterals_AreParsed)("number literal %s is %d", (literal, expected) =>
    expect(NumberValidator.parse(literal)).toBeCloseTo(expected, 12),
  );
  it.each(invalidNumberLiterals_AreRejected)("invalid number literal %j", (literal) => {
    expect(NumberValidator.isValidNumber(literal)).toBe(false);
    expect(NumberValidator.parse(literal)).toBeUndefined();
  });
  it.each(identifiers)("identifier %j is valid: %s", (identifier, valid) =>
    expect(IdentifierValidator.validate(identifier)).toBe(valid),
  );
  it.each(serialization_Numbers)("number %d is written as %s", (number, expected) =>
    expect(Value.number(number).toString()).toBe(expected),
  );
});
