/**
 * Character classes of the FormuLang syntax (docs/syntax/symbols.md). Every function takes one UTF-16 code unit.
 *
 * @module
 */

/** Tab, new line or a printable ASCII character (space to `~`). */
export function isValidSymbol(c: string): boolean {
  return c === "\t" || c === "\n" || (c >= " " && c <= "~");
}

export function isLetter(c: string): boolean {
  return (c >= "A" && c <= "Z") || (c >= "a" && c <= "z");
}

export function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

export function isHexDigit(c: string): boolean {
  return isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
}

/** Letter, digit or `_` (`\w` of the identifier pattern). */
export function isWordCharacter(c: string): boolean {
  return isLetter(c) || isDigit(c) || c === "_";
}

export function isIdentifierStart(c: string): boolean {
  return isLetter(c) || c === "_";
}

export function isWhitespace(c: string): boolean {
  return c === " " || c === "\t";
}

/** Punctuation character other than `_`, i.e. a character that can be part of an operator. */
export function isOperatorCharacter(c: string): boolean {
  return (
    c !== "_" && ((c >= "!" && c <= "/") || (c >= ":" && c <= "@") || (c >= "[" && c <= "`") || (c >= "{" && c <= "~"))
  );
}

/** `U+XXXX` for a control character, the character itself otherwise. */
export function displayCharacter(c: string): string {
  return /\p{Cc}/u.test(c) ? `U+${hex4(c)}` : c;
}

/** Code unit of a character in 4 uppercase hexadecimal digits. */
export function hex4(c: string): string {
  return c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0");
}
