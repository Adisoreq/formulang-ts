/**
 * Lexical rules of identifiers and number literals.
 *
 * @see https://github.com/Adisoreq/FormuLang/blob/main/docs/syntax/naming.md
 * @see https://github.com/Adisoreq/FormuLang/blob/main/docs/syntax/literals.md
 * @module
 */
import { isIdentifierStart, isWordCharacter } from "../utils/chars.js";

/** Identifiers: `^[a-zA-Z_]\w*$` */
export const IdentifierValidator = {
  validate(identifier: string): boolean {
    if (identifier.length === 0 || !isIdentifierStart(identifier[0] ?? "")) return false;
    for (const c of identifier) {
      if (!isWordCharacter(c)) return false;
    }
    return true;
  },
} as const;

const INTEGER = /^\d+(?:_\d+)*$/;
const FRACTION = /^(?:\d+\.\d*|\d*\.\d+|\d+)$/;
const SCIENTIFIC = /^\d+(?:\.\d+)?[eE][+-]?\d+$/;
const HEXADECIMAL = /^0[xX][0-9a-fA-F]+$/;

/** Number literals: integer (with `_` separators), fraction, scientific and hexadecimal notation. */
export const NumberValidator = {
  isValidInteger: (expression: string): boolean => INTEGER.test(expression),
  isValidRealNumber: (expression: string): boolean => FRACTION.test(expression),
  isValidScientificNotation: (expression: string): boolean => SCIENTIFIC.test(expression),
  isValidHexadecimal: (expression: string): boolean => HEXADECIMAL.test(expression),

  isValidNumber(expression: string): boolean {
    return (
      INTEGER.test(expression) ||
      FRACTION.test(expression) ||
      SCIENTIFIC.test(expression) ||
      HEXADECIMAL.test(expression)
    );
  },

  /** The value of a number literal, or `undefined` if the literal is not valid. */
  parse(expression: string): number | undefined {
    if (HEXADECIMAL.test(expression)) {
      // Leading zeros after the prefix are ignored; the value can exceed 2^53, so it is accumulated as a number
      let value = 0;
      for (const c of expression.slice(2)) value = value * 16 + Number.parseInt(c, 16);
      return value;
    }
    if (INTEGER.test(expression) || FRACTION.test(expression) || SCIENTIFIC.test(expression)) {
      return Number(expression.replaceAll("_", ""));
    }
    return undefined;
  },
} as const;
