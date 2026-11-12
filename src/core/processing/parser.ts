import type { IFunction } from "../../abstractions/functions.js";
import type { IExpressionNode, IParser, IToken } from "../../abstractions/processing.js";
import { ExpressionKind, TokenType, VariableScope } from "../../abstractions/processing.js";
import type { IEnvironment } from "../../abstractions/structures.js";
import { Errors } from "../errors.js";
import { isProcedure } from "../functions/function.js";
import { BindingPower } from "../operators.js";
import { Value } from "../primitives/value.js";
import { textToLiteral } from "../serialization/serializer.js";
import { CoreProcedures } from "../standards/core-standard.js";
import { IdentifierValidator, NumberValidator } from "../validation/validators.js";
import { CallNode, ConstantNode, LambdaNode, LiteralNode, ParameterNode, Sequence, VariableNode } from "./nodes.js";
import { ParsingResult } from "./results.js";

/** Translation of the infix operators into Core functions (docs/standards/core/semantics/parsing.md). */
export const infixTranslation: Readonly<Record<string, string>> = Object.freeze({
  "+": "ADD",
  "-": "SUB",
  "*": "MUL",
  "/": "DIV",
  "%": "MOD",
  "^": "POW",
  "==": "EQU",
  "!=": "NEQ",
  "<>": "NEQ",
  ">": "GRE",
  "<": "LES",
  ">=": "GEQ",
  "<=": "LEQ",
  "&&": "AND",
  "||": "OR",
  "=": "SET",
  ":=": "INIT",
  "?=": "COND_SET",
});

const COMPARISONS: ReadonlySet<string> = new Set([">", "<", ">=", "<=", "==", "<>", "!="]);
const ASSIGNMENTS: ReadonlySet<string> = new Set(["=", ":=", "?="]);
const RIGHT_ASSOCIATIVE: ReadonlySet<string> = new Set(["=", ":=", "?=", "=>", "^"]);
const OPENING: Readonly<Record<string, string>> = { ")": "(", "]": "[", "}": "{" };

/** Signals a syntax error inside the parser; never leaves {@link Parser.parse}. */
class ParseError extends Error {}

function isOperator(token: IToken | undefined, symbol: string): boolean {
  return token !== undefined && token.type === TokenType.Operator && token.value === symbol;
}

function describe(token: IToken): string {
  switch (token.type) {
    case TokenType.Operator:
      return token.value === "\n" ? "new line" : `"${token.value}"`;
    case TokenType.Text:
      return "text";
    default:
      return `${token.type.toLowerCase()} "${token.value}"`;
  }
}

function infixPower(symbol: string): number {
  switch (symbol) {
    case "=":
    case ":=":
    case "?=":
      return BindingPower.Assignment;
    case "=>":
      return BindingPower.Lambda;
    case "||":
      return BindingPower.Or;
    case "&&":
      return BindingPower.And;
    case "+":
    case "-":
      return BindingPower.Additive;
    case "*":
    case "/":
    case "%":
      return BindingPower.Multiplicative;
    case "^":
      return BindingPower.Exponential;
    case ".":
    case "[":
      return BindingPower.Postfix;
    default:
      return COMPARISONS.has(symbol) ? BindingPower.Comparison : -1;
  }
}

function rightBindingPower(symbol: string): number {
  const power = infixPower(symbol);
  return RIGHT_ASSOCIATIVE.has(symbol) ? power - 1 : power;
}

function textLiteral(content: string): LiteralNode {
  const literal = textToLiteral(content);
  return new LiteralNode(Value.text(content, literal), literal);
}

/** Lambda parameter list `(a, b)`; it exists only until `=>` turns it into a lambda. */
class ParameterList {
  readonly kind = ExpressionKind.Lambda;
  readonly level = 0;
  readonly children: readonly IExpressionNode[] = [];

  constructor(readonly names: readonly string[]) {}

  get key(): string {
    return `(${this.names.join(",")})`;
  }
}

type ParsedNode = IExpressionNode | ParameterList;

/** Splits the tokens into sequences at a new line or `;` outside of delimiters. */
function splitIntoSequences(tokens: readonly IToken[]): IToken[][] {
  const sequences: IToken[][] = [];
  let current: IToken[] = [];
  const delimiters: string[] = [];
  const close = (): void => {
    if (current.length > 0) sequences.push(current);
    current = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (isOperator(token, '"')) {
      if (i + 2 >= tokens.length || tokens[i + 1]!.type !== TokenType.Text || !isOperator(tokens[i + 2], '"')) {
        throw new ParseError("A text literal must be enclosed by quotation marks.");
      }
      current.push(token, tokens[i + 1]!, tokens[i + 2]!);
      i += 2;
    } else if (isOperator(token, "(") || isOperator(token, "[") || isOperator(token, "{")) {
      delimiters.push(token.value);
      current.push(token);
    } else if (isOperator(token, ")") || isOperator(token, "]") || isOperator(token, "}")) {
      if (delimiters.length === 0 || delimiters.pop() !== OPENING[token.value]) {
        throw new ParseError(`Unmatched "${token.value}".`);
      }
      current.push(token);
    } else if (isOperator(token, "\n") || isOperator(token, ";")) {
      if (delimiters.length === 0) close();
      else if (token.value === ";") throw new ParseError('Unexpected ";" inside a delimiter.');
      // A new line inside a delimiter is ignored
    } else if (token.type === TokenType.Text) {
      throw new ParseError("A text literal must be enclosed by quotation marks.");
    } else {
      current.push(token);
    }
  }
  if (delimiters.length > 0) throw new ParseError(`Unclosed "${delimiters.at(-1)}".`);
  close();
  return sequences;
}

/** Pratt parser of one sequence (docs/standards/core/semantics/parsing.md). */
class SequenceParser {
  #position = 0;
  readonly #lambdaScopes: (readonly string[])[] = [];

  constructor(
    private readonly tokens: readonly IToken[],
    private readonly procedures: ReadonlyMap<string, number>,
  ) {}

  peek(offset = 0): IToken | undefined {
    return this.tokens[this.#position + offset];
  }

  private next(): IToken {
    const token = this.tokens[this.#position];
    if (token === undefined) throw new ParseError("Missing operand at the end of the expression.");
    this.#position++;
    return token;
  }

  private expect(symbol: string): void {
    const token = this.peek();
    if (!isOperator(token, symbol)) {
      throw new ParseError(
        token === undefined
          ? `Expected "${symbol}" at the end of the expression.`
          : `Expected "${symbol}" instead of ${describe(token)}.`,
      );
    }
    this.#position++;
  }

  parseExpression(rbp: number): IExpressionNode {
    let left: ParsedNode = this.parsePrefix();
    for (let token = this.peek(); token !== undefined; token = this.peek()) {
      if (token.type !== TokenType.Operator || infixPower(token.value) <= rbp) break;
      left = this.parseInfix(left, this.next());
    }
    if (left instanceof ParameterList) throw new ParseError('A lambda parameter list must be followed by "=>".');
    return left;
  }

  // Prefix step

  private parsePrefix(): ParsedNode {
    const token = this.next();
    switch (token.type) {
      case TokenType.Number: {
        const number = NumberValidator.parse(token.value);
        if (number === undefined) throw new ParseError(`Invalid number literal "${token.value}".`);
        return new LiteralNode(Value.number(number, token.value), token.value);
      }
      case TokenType.Identifier:
        return this.parseIdentifier(token.value);
      case TokenType.Operator:
        switch (token.value) {
          case '"':
            return this.parseText();
          case "$":
            return this.parseVariable(VariableScope.Context);
          case "@":
            return this.parseVariable(VariableScope.Environment);
          case "(":
            return this.parseParenthesis();
          case "[":
            return new CallNode("ARRAY", this.parseList("]"));
          case "{":
            return this.parseObject();
          case "!":
            return new CallNode("NOT", [this.parseExpression(BindingPower.PrefixUnary)]);
          case "-":
            return new CallNode("NEG", [this.parseExpression(BindingPower.PrefixUnary)]);
          default:
            throw new ParseError(`Unexpected ${describe(token)} where an operand is expected.`);
        }
      default:
        throw new ParseError(`Unexpected ${describe(token)}.`);
    }
  }

  private parseText(): IExpressionNode {
    const content = this.next().value;
    this.expect('"');
    return textLiteral(content);
  }

  private parseIdentifier(name: string): IExpressionNode {
    switch (name) {
      case "null":
        return new LiteralNode(Value.null("null"), "null");
      case "true":
        return new LiteralNode(Value.boolean(true, "true"), "true");
      case "false":
        return new LiteralNode(Value.boolean(false, "false"), "false");
    }
    if (isOperator(this.peek(), "(")) {
      this.#position++;
      return new CallNode(name, this.parseList(")"));
    }
    const parameterCount = this.procedures.get(name);
    if (parameterCount !== undefined) return this.parseProcedureCall(name, parameterCount);
    if (this.#lambdaScopes.some((scope) => scope.includes(name))) return new ParameterNode(name);
    return new ConstantNode(name);
  }

  /** A procedure call without parentheses: `SET $x 100`, `REQUIRE "core-0.3"`. */
  private parseProcedureCall(name: string, parameterCount: number): IExpressionNode {
    const args: IExpressionNode[] = [];
    for (let i = 0; i < parameterCount - 1; i++) args.push(this.parseExpression(BindingPower.Postfix));
    if (parameterCount > 0) args.push(this.parseExpression(0));
    return new CallNode(name, args);
  }

  private parseVariable(scope: VariableScope): IExpressionNode {
    const token = this.peek();
    if (token?.type !== TokenType.Identifier) {
      throw new ParseError("A scope sigil must be directly followed by an identifier.");
    }
    this.#position++;
    return new VariableNode(scope, token.value);
  }

  private parseList(closing: string): IExpressionNode[] {
    const items: IExpressionNode[] = [];
    if (isOperator(this.peek(), closing)) {
      this.#position++;
      return items;
    }
    for (;;) {
      items.push(this.parseExpression(0));
      const token = this.next();
      if (isOperator(token, closing)) return items;
      if (!isOperator(token, ",")) throw new ParseError(`Expected "," or "${closing}" instead of ${describe(token)}.`);
    }
  }

  private parseParenthesis(): ParsedNode {
    if (this.isParameterList()) return this.parseParameterList();
    const inner = this.parseExpression(0);
    this.expect(")");
    return inner;
  }

  /** Whether the matching `)` of the current `(` is directly followed by `=>`. */
  private isParameterList(): boolean {
    let depth = 1;
    for (let i = this.#position; i < this.tokens.length; i++) {
      if (isOperator(this.tokens[i], "(")) depth++;
      else if (isOperator(this.tokens[i], ")") && --depth === 0) return isOperator(this.tokens[i + 1], "=>");
    }
    return false;
  }

  private parseParameterList(): ParameterList {
    const names: string[] = [];
    for (;;) {
      const token = this.next();
      if (token.type !== TokenType.Identifier) {
        throw new ParseError(`Expected a lambda parameter name instead of ${describe(token)}.`);
      }
      if (names.includes(token.value)) {
        throw new ParseError(`Lambda parameter "${token.value}" is defined more than once.`);
      }
      names.push(token.value);
      const separator = this.next();
      if (isOperator(separator, ")")) return new ParameterList(names);
      if (!isOperator(separator, ",")) {
        throw new ParseError(`Expected "," or ")" in a lambda parameter list instead of ${describe(separator)}.`);
      }
    }
  }

  /** `{ k1: a, "k2": b }` is translated into `OBJECT("k1", a, "k2", b)`. */
  private parseObject(): IExpressionNode {
    const args: IExpressionNode[] = [];
    const keys = new Set<string>();
    if (isOperator(this.peek(), "}")) {
      this.#position++;
      return new CallNode("OBJECT", args);
    }
    for (;;) {
      const keyToken = this.next();
      let key: string;
      if (keyToken.type === TokenType.Identifier) key = keyToken.value;
      else if (isOperator(keyToken, '"')) {
        key = this.next().value;
        this.expect('"');
      } else throw new ParseError(`Expected an object key instead of ${describe(keyToken)}.`);
      if (!IdentifierValidator.validate(key)) throw new ParseError(`Object key "${key}" is not a valid identifier.`);
      if (keys.has(key)) throw new ParseError(`Object key "${key}" is defined more than once.`);
      keys.add(key);
      this.expect(":");
      args.push(textLiteral(key), this.parseExpression(0));
      const token = this.next();
      if (isOperator(token, "}")) return new CallNode("OBJECT", args);
      if (!isOperator(token, ",")) throw new ParseError(`Expected "," or "}" instead of ${describe(token)}.`);
    }
  }

  // Infix and postfix step

  private parseInfix(left: ParsedNode, token: IToken): ParsedNode {
    const symbol = token.value;
    if (ASSIGNMENTS.has(symbol)) {
      if (!(left instanceof VariableNode)) throw new ParseError(`The left operand of "${symbol}" must be a variable.`);
      return new CallNode(infixTranslation[symbol]!, [left, this.parseExpression(rightBindingPower(symbol))]);
    }
    if (symbol === "=>") {
      if (!(left instanceof ParameterList)) {
        throw new ParseError('The left operand of "=>" must be a lambda parameter list.');
      }
      this.#lambdaScopes.push(left.names);
      const body = this.parseExpression(rightBindingPower(symbol));
      this.#lambdaScopes.pop();
      return new LambdaNode(left.names, new Sequence(body));
    }
    if (left instanceof ParameterList) throw new ParseError('A lambda parameter list must be followed by "=>".');
    if (symbol === ".") {
      const key = this.peek();
      if (key?.type !== TokenType.Identifier) throw new ParseError('"." must be followed by an identifier.');
      this.#position++;
      return new CallNode("GET", [left, textLiteral(key.value)]);
    }
    if (symbol === "[") {
      const index = this.parseExpression(0);
      this.expect("]");
      return new CallNode("GET", [left, index]);
    }
    const right = this.parseExpression(rightBindingPower(symbol));
    const next = this.peek();
    if (COMPARISONS.has(symbol) && next?.type === TokenType.Operator && COMPARISONS.has(next.value)) {
      throw new ParseError("Comparison operators cannot be chained.");
    }
    return new CallNode(infixTranslation[symbol]!, [left, right]);
  }
}

/**
 * Parsing stage (docs/semantics/parsing.md): a Pratt parser that builds one expression tree and parsing queue
 * per sequence, and the primitive map of the formula. Operators are translated into Core function calls while
 * the tree is built.
 */
export class Parser implements IParser {
  readonly #procedures: ReadonlyMap<string, number>;

  /** @param functions The functions of the environment; the parser needs the procedures among them. */
  constructor(functions: readonly IFunction[] = CoreProcedures) {
    this.#procedures = new Map(functions.filter(isProcedure).map((p) => [p.name, p.parameterCount] as const));
  }

  /** A parser that knows the procedures of the environment. */
  static forEnvironment(environment: IEnvironment): Parser {
    return new Parser(environment.functions);
  }

  parse(tokens: readonly IToken[]): ParsingResult {
    try {
      const sequences = splitIntoSequences(tokens).map((sequenceTokens) => {
        const parser = new SequenceParser(sequenceTokens, this.#procedures);
        const root = parser.parseExpression(0);
        const unexpected = parser.peek();
        if (unexpected !== undefined) {
          throw new ParseError(`Unexpected ${describe(unexpected)} after a complete expression.`);
        }
        return new Sequence(root);
      });
      return new ParsingResult(sequences);
    } catch (error) {
      if (error instanceof ParseError) return ParsingResult.failed(Errors.syntaxError(error.message));
      throw error;
    }
  }
}
