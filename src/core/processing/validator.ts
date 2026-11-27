import type { IError, IValue } from "../../abstractions/primitives.js";
import { ContainerType } from "../../abstractions/primitives.js";
import type { IValidator } from "../../abstractions/processing.js";
import type { IEnvironment } from "../../abstractions/structures.js";
import { Errors } from "../errors.js";
import { TypeNames } from "../primitives/types.js";
import { SerializationVariables } from "../serialization/serializer.js";
import { CoreStandard } from "../standards/core-standard.js";
import { EnvironmentConstants, EnvironmentVariables } from "../structures/context-variables.js";
import { displayCharacter, isTextCharacter, isValidSymbol } from "../utils/chars.js";
import { ValidationResult } from "./results.js";

type Mode = "code" | "text" | "comment" | "scopedComment";

interface Position {
  readonly line: number;
  readonly column: number;
}

const at = (position: Position): string => `line ${position.line}, column ${position.column}`;
const OPENING: Readonly<Record<string, string>> = { ")": "(", "]": "[", "}": "{" };

/**
 * Validation stage (docs/semantics/validation.md, docs/standards/core/semantics/validation.md): checks the
 * environment and scans the raw formula, and reports every problem at once, with its line and column.
 */
export class Validator implements IValidator {
  validate(formula: string, environment: IEnvironment): ValidationResult {
    const errors: IError[] = [];
    checkEnvironment(environment, errors);
    scanFormula(formula, errors);
    return new ValidationResult(errors);
  }

  /**
   * Only the checks of the environment, without a formula: done once for every context before its first hot
   * execution of a prepared formula (docs/semantics/execution.md, "Execution modes", rule 2).
   */
  validateEnvironment(environment: IEnvironment): ValidationResult {
    const errors: IError[] = [];
    checkEnvironment(environment, errors);
    return new ValidationResult(errors);
  }
}

// Environment checks

function read(environment: IEnvironment, name: string, kind: ContainerType): IValue | undefined {
  const container = environment.getProperty(name);
  return container?.containerType === kind && container.canAccessValue ? container.getValue() : undefined;
}

const missingConstant = (name: string, type: string): IError =>
  Errors.environmentError(`Environment constant "${name}" is missing or is not of type ${type}.`);
const missingVariable = (name: string, type: string): IError =>
  Errors.environmentError(`Environment variable "${name}" is missing or is not of type ${type}.`);

function checkEnvironment(environment: IEnvironment, errors: IError[]): void {
  const standards = read(environment, "STANDARDS", ContainerType.Constant)?.raw;
  if (!Array.isArray(standards) || (standards as IValue[]).some((s) => s.type.base !== TypeNames.Text)) {
    errors.push(missingConstant("STANDARDS", "Array"));
  } else if (!(standards as IValue[]).some((s) => s.raw === CoreStandard.identifier)) {
    errors.push(Errors.environmentError('Environment constant "STANDARDS" does not contain the Core standard.'));
  }
  for (const name of ["E", "PI", "PHI"]) {
    if (read(environment, name, ContainerType.Constant)?.type.base !== TypeNames.Number) {
      errors.push(missingConstant(name, TypeNames.Number));
    }
  }
  const now = read(environment, EnvironmentConstants.now, ContainerType.Constant);
  if (now?.type.base !== TypeNames.Number) errors.push(missingConstant(EnvironmentConstants.now, TypeNames.Number));
  else if (typeof now.raw === "number" && Math.floor(now.raw) !== now.raw) {
    errors.push(Errors.environmentError(`Environment constant "${EnvironmentConstants.now}" must be a whole number.`));
  }
  if (read(environment, "NULL", ContainerType.Constant)?.type.base !== TypeNames.Null) {
    errors.push(missingConstant("NULL", TypeNames.Null));
  }
  checkBooleanConstant(environment, "TRUE", true, errors);
  checkBooleanConstant(environment, "FALSE", false, errors);
  checkWholeNumberVariable(environment, EnvironmentVariables.arrayIndexing, errors);
  checkVariable(environment, EnvironmentVariables.suppressErrors, TypeNames.Boolean, errors);
  checkWholeNumberVariable(environment, EnvironmentVariables.timeOffset, errors);
  // Serialization variables
  checkWholeNumberVariable(environment, SerializationVariables.decimalPlace, errors);
  checkVariable(environment, SerializationVariables.splitArray, TypeNames.Boolean, errors);
  checkVariable(environment, SerializationVariables.splitObject, TypeNames.Boolean, errors);
  checkVariable(environment, SerializationVariables.includeObjectClass, TypeNames.Boolean, errors);
  checkWholeNumberVariable(environment, SerializationVariables.maxArrayPreview, errors);
}

function checkBooleanConstant(environment: IEnvironment, name: string, expected: boolean, errors: IError[]): void {
  const value = read(environment, name, ContainerType.Constant);
  if (value?.type.base !== TypeNames.Boolean) errors.push(missingConstant(name, TypeNames.Boolean));
  else if (value.raw !== expected) {
    errors.push(Errors.environmentError(`Environment constant "${name}" must be ${expected ? "true" : "false"}.`));
  }
}

function checkVariable(environment: IEnvironment, name: string, type: string, errors: IError[]): void {
  if (read(environment, name, ContainerType.Variable)?.type.base !== type) errors.push(missingVariable(name, type));
}

function checkWholeNumberVariable(environment: IEnvironment, name: string, errors: IError[]): void {
  const value = read(environment, name, ContainerType.Variable);
  if (value?.type.base !== TypeNames.Number) errors.push(missingVariable(name, TypeNames.Number));
  else if (typeof value.raw === "number" && Math.floor(value.raw) !== value.raw) {
    errors.push(Errors.environmentError(`Environment variable "${name}" must be a whole number.`));
  }
}

// Formula scan

function scanFormula(formula: string, errors: IError[]): void {
  let mode: Mode = "code";
  let escape = false;
  const delimiters: { symbol: string; position: Position }[] = [];
  let textStart: Position = { line: 0, column: 0 };
  let commentStart: Position = { line: 0, column: 0 };
  let line = 1;
  let column = 0;
  let i = 0;

  while (i < formula.length) {
    // Characters are Unicode code points: a surrogate pair is one character, a lone surrogate is U+FFFD
    let value = formula.codePointAt(i)!;
    i += value > 0xffff ? 2 : 1;
    if (value >= 0xd800 && value <= 0xdfff) value = 0xfffd;
    const c = String.fromCodePoint(value);
    const lineBreak = c === "\n" || c === "\r";
    if (c === "\r" && formula[i] === "\n") i++;
    if (!lineBreak) column++;
    const position: Position = { line, column };

    if (mode === "comment") {
      if (lineBreak) {
        mode = "code";
        line++;
        column = 0;
      }
      continue;
    }
    if (mode === "scopedComment") {
      if (lineBreak) {
        line++;
        column = 0;
      } else if (c === "#" && formula[i] === ">") {
        i++;
        column++;
        mode = "code";
      }
      continue;
    }
    const allowed = mode === "text" ? isTextCharacter(value) : value < 128 && isValidSymbol(c);
    if (!lineBreak && !allowed) {
      errors.push(Errors.syntaxError(`Invalid symbol "${displayCharacter(c)}" at ${at(position)}.`));
      continue;
    }
    if (lineBreak) {
      if (mode === "text") {
        errors.push(Errors.syntaxError(`Text literal is not closed at ${at(textStart)}.`));
        mode = "code";
        escape = false;
      }
      line++;
      column = 0;
      continue;
    }
    if (mode === "text") {
      if (escape) {
        escape = false;
        if (c !== "\\" && c !== '"' && c !== "n" && c !== "t") {
          errors.push(Errors.syntaxError(`Invalid escape sequence "\\${c}" at ${at(position)}.`));
        }
      } else if (c === '"') mode = "code";
      else if (c === "\\") escape = true;
      continue;
    }
    // Code: only ASCII symbols reach this point
    switch (c) {
      case "<":
        if (formula[i] === "#") {
          i++;
          column++;
          commentStart = position;
          mode = "scopedComment";
        }
        break;
      case "#":
        mode = "comment";
        break;
      case '"':
        mode = "text";
        textStart = position;
        break;
      case "(":
      case "[":
      case "{":
        delimiters.push({ symbol: c, position });
        break;
      case ")":
      case "]":
      case "}":
        if (delimiters.length === 0) errors.push(Errors.syntaxError(`Unmatched "${c}" at ${at(position)}.`));
        else if (delimiters.pop()!.symbol !== OPENING[c]) {
          errors.push(Errors.syntaxError(`"${c}" does not match the opening delimiter at ${at(position)}.`));
        }
        break;
      case ";":
        if (delimiters.length > 0) {
          errors.push(Errors.syntaxError(`Unexpected ";" inside a delimiter at ${at(position)}.`));
        }
        break;
    }
  }
  if (mode === "text") errors.push(Errors.syntaxError(`Text literal is not closed at ${at(textStart)}.`));
  if (mode === "scopedComment") {
    errors.push(Errors.syntaxError(`Scoped comment is not closed at ${at(commentStart)}.`));
  }
  // The innermost unclosed delimiter first, like a stack
  for (const { symbol, position } of [...delimiters].reverse()) {
    errors.push(Errors.syntaxError(`Unclosed "${symbol}" at ${at(position)}.`));
  }
}
