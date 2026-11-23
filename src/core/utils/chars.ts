/**
 * Character classes of the FormuLang syntax (docs/syntax/symbols.md). The code of a formula allows only ASCII
 * characters, so the symbol checks take one UTF-16 code unit; text literals allow every Unicode text character
 * ({@link isTextCharacter}), and the characters of a **Text** are Unicode code points.
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

/** `U+XXXX` for a control character, the character (one code point) itself otherwise. */
export function displayCharacter(c: string): string {
  return /\p{Cc}/u.test(c) ? `U+${codePointHex(c.codePointAt(0) ?? 0)}` : c;
}

/** Code unit of a character in 4 uppercase hexadecimal digits. */
export function hex4(c: string): string {
  return c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Text character (docs/syntax/symbols.md, "Text characters"): every Unicode scalar value except the control
 * characters U+0000 - U+001F and U+007F - U+009F. [Tab] is allowed. Takes a code point.
 */
export function isTextCharacter(codePoint: number): boolean {
  return (
    codePoint === 0x09 ||
    (codePoint >= 0x20 && codePoint < 0x7f) ||
    (codePoint > 0x9f && codePoint <= 0x10ffff && (codePoint < 0xd800 || codePoint > 0xdfff))
  );
}

/** Whether the UTF-16 code unit is a high or a low surrogate. */
export function isSurrogate(c: string): boolean {
  const code = c.charCodeAt(0);
  return code >= 0xd800 && code <= 0xdfff;
}

/**
 * Splits a text into its characters: Unicode code points (docs/standards/core/types/Text.md, "Characters"). A lone
 * surrogate is one character.
 */
export function codePoints(text: string): string[] {
  return Array.from(text);
}

/** Number of characters (Unicode code points) of a text. */
export function codePointLength(text: string): number {
  let count = 0;
  for (const _ of text) count++;
  return count;
}

/** Compares texts by their code points (ordinal UTF-16 comparison orders surrogate pairs differently). */
export function compareCodePoints(a: string, b: string): number {
  const x = a[Symbol.iterator]();
  const y = b[Symbol.iterator]();
  for (;;) {
    const p = x.next();
    const q = y.next();
    if (p.done === true || q.done === true) return p.done === q.done ? 0 : p.done === true ? -1 : 1;
    const difference = p.value.codePointAt(0)! - q.value.codePointAt(0)!;
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
}

/** Code point in at least 4 uppercase hexadecimal digits (`U+XXXX`). */
export function codePointHex(codePoint: number): string {
  return codePoint.toString(16).toUpperCase().padStart(4, "0");
}
