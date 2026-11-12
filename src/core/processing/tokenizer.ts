import type { IError } from "../../abstractions/primitives.js";
import type { IToken, ITokenizer } from "../../abstractions/processing.js";
import { TokenType } from "../../abstractions/processing.js";
import { Errors } from "../errors.js";
import { canBeginTwoCharacterOperator, isOperatorSpelling } from "../operators.js";
import { NumberValidator } from "../validation/validators.js";
import {
  hex4,
  isDigit,
  isHexDigit,
  isIdentifierStart,
  isLetter,
  isValidSymbol,
  isWhitespace,
  isWordCharacter,
} from "../utils/chars.js";
import { TokenizationResult } from "./results.js";

const TEXT_DELIMITER = '"';
const ESCAPE = "\\";
const ESCAPES: Readonly<Record<string, string>> = { "\\": "\\", '"': '"', n: "\n", t: "\t" };

/** Immutable token. */
export class Token implements IToken {
  constructor(
    readonly type: TokenType,
    readonly value: string,
  ) {
    Object.freeze(this);
  }

  /** `(Operator: '+')` */
  toString(): string {
    const display = this.value.replaceAll("\n", "\\n").replaceAll("\r", "\\r").replaceAll("\t", "\\t");
    return `(${this.type}: '${display}')`;
  }
}

/** Signals a syntax error inside the tokenizer; never leaves {@link Tokenizer.tokenize}. */
class TokenizationError extends Error {
  constructor(readonly error: IError) {
    super(error.message);
  }
}

/** State of the tokenization: the tokens and the open token (docs/semantics/tokenization.md). */
class TokenizationState {
  readonly tokens: Token[] = [];
  mode: TokenType = TokenType.None;
  current = "";
  // Number flags
  dotPresent = false;
  exponentPresent = false;
  hexadecimal = false;
  // Text flags
  escapeSequence = false;

  get isTokenOpen(): boolean {
    return this.mode !== TokenType.None;
  }

  open(mode: TokenType): void {
    this.mode = mode;
    this.current = "";
  }

  append(c: string): void {
    this.current += c;
  }

  close(): void {
    this.tokens.push(new Token(this.mode, this.current));
    this.mode = TokenType.None;
    this.current = "";
    this.dotPresent = false;
    this.exponentPresent = false;
    this.hexadecimal = false;
    this.escapeSequence = false;
  }

  insert(type: TokenType, value: string): void {
    this.tokens.push(new Token(type, value));
  }
}

/** Tokenization of one line. */
class LineRun {
  #index = 0;

  constructor(
    private readonly line: string,
    private readonly lineNumber: number,
    private readonly state: TokenizationState,
  ) {}

  private get previous(): string | undefined {
    return this.#index > 0 ? this.line[this.#index - 1] : undefined;
  }

  private get next(): string | undefined {
    return this.line[this.#index + 1];
  }

  private syntaxError(message: string): TokenizationError {
    return new TokenizationError(
      Errors.syntaxError(`${message} (line ${this.lineNumber}, column ${this.#index + 1}).`),
    );
  }

  execute(): void {
    const state = this.state;
    for (this.#index = 0; this.#index < this.line.length; this.#index++) {
      const c = this.line[this.#index]!;
      if (!isValidSymbol(c)) throw this.syntaxError(`Invalid symbol U+${hex4(c)}`);
      switch (state.mode) {
        case TokenType.None:
          this.start(c);
          break;
        case TokenType.Operator:
          this.continueOperator(c);
          break;
        case TokenType.Identifier:
          this.continueIdentifier(c);
          break;
        case TokenType.Number:
          this.continueNumber(c);
          break;
        case TokenType.Text:
          this.continueText(c);
          break;
      }
    }
    // End of the line
    if (state.mode === TokenType.Text) {
      throw this.syntaxError("Unclosed text literal; a text literal must be a single-line character sequence");
    }
    if (state.isTokenOpen) this.close();
  }

  private start(c: string): void {
    const state = this.state;
    if (isWhitespace(c)) return;
    if (isDigit(c)) {
      state.open(TokenType.Number);
      state.append(c);
    } else if (isIdentifierStart(c)) {
      state.open(TokenType.Identifier);
      state.append(c);
    } else if (c === TEXT_DELIMITER) {
      state.insert(TokenType.Operator, c);
      state.open(TokenType.Text);
    } else if (c === "." && this.next !== undefined && isDigit(this.next)) {
      state.open(TokenType.Number);
      state.append(c);
      state.dotPresent = true;
    } else {
      state.open(TokenType.Operator);
      state.append(c);
      // A character that cannot begin a 2-character operator is closed at once (conformance I1)
      if (!canBeginTwoCharacterOperator(c)) this.close();
    }
  }

  private continueOperator(c: string): void {
    if (isOperatorSpelling(this.state.current + c)) {
      this.state.append(c);
      this.close();
      return;
    }
    this.close();
    this.start(c);
  }

  private continueIdentifier(c: string): void {
    if (isWordCharacter(c)) {
      this.state.append(c);
      return;
    }
    this.close();
    this.start(c);
  }

  private continueNumber(c: string): void {
    const state = this.state;
    if (isDigit(c) || c === "_") {
      state.append(c);
    } else if (c === ".") {
      if (state.dotPresent || state.hexadecimal || state.exponentPresent) {
        throw this.syntaxError(`Unexpected '.' in number literal '${state.current}'`);
      }
      state.append(c);
      state.dotPresent = true;
    } else if (isLetter(c) && this.extendsNumber(c)) {
      state.append(c);
    } else if (
      (c === "+" || c === "-") &&
      (this.previous === "e" || this.previous === "E") &&
      !state.hexadecimal &&
      this.next !== undefined &&
      isDigit(this.next)
    ) {
      // Sign of the exponent
      state.append(c);
    } else if (c === TEXT_DELIMITER) {
      throw this.syntaxError(`Unexpected quotation mark after number literal '${state.current}'`);
    } else {
      // Letter, white space or operator character
      this.close();
      this.start(c);
    }
  }

  private extendsNumber(c: string): boolean {
    const state = this.state;
    if (state.hexadecimal) return isHexDigit(c);
    if ((c === "x" || c === "X") && state.current === "0") {
      state.hexadecimal = true;
      return true;
    }
    if ((c === "e" || c === "E") && !state.exponentPresent) {
      state.exponentPresent = true;
      return true;
    }
    return false;
  }

  private continueText(c: string): void {
    const state = this.state;
    if (state.escapeSequence) {
      const output = ESCAPES[c];
      if (output === undefined) throw this.syntaxError(`Invalid escape sequence '\\${c}'`);
      state.append(output);
      state.escapeSequence = false;
    } else if (c === TEXT_DELIMITER) {
      state.close();
      state.insert(TokenType.Operator, c);
    } else if (c === ESCAPE) {
      state.escapeSequence = true;
    } else {
      state.append(c);
    }
  }

  private close(): void {
    const { mode, current } = this.state;
    if (mode === TokenType.Number && !NumberValidator.isValidNumber(current)) {
      throw this.syntaxError(`Invalid number literal '${current}'`);
    }
    if (mode === TokenType.Operator && !isOperatorSpelling(current)) {
      throw this.syntaxError(`Unknown operator '${current}'`);
    }
    this.state.close();
  }
}

/**
 * Tokenization stage (docs/semantics/tokenization.md): splits the cleaned formula into operator, identifier,
 * number and text tokens. Lines are separated by a new line operator token. A text literal is three tokens:
 * `"`, the text (escape sequences resolved) and `"`.
 */
export class Tokenizer implements ITokenizer {
  tokenize(expression: string): TokenizationResult {
    const state = new TokenizationState();
    const lines = expression.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
    try {
      lines.forEach((line, i) => {
        new LineRun(line, i + 1, state).execute();
        if (i < lines.length - 1) state.insert(TokenType.Operator, "\n");
      });
    } catch (error) {
      if (error instanceof TokenizationError) return new TokenizationResult(state.tokens, error.error);
      throw error;
    }
    return new TokenizationResult(state.tokens);
  }
}
