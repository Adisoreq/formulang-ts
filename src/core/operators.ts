/**
 * Operator table of the Core standard: spellings, roles, binding powers and associativity, copied from
 * docs/semantics/operator-parsing.md and docs/syntax/operators.md.
 *
 * @module
 */
import type { IOperator } from "../abstractions/operators.js";
import { Associativity, OperatorType } from "../abstractions/operators.js";

/** Binding powers (docs/semantics/operator-parsing.md, "Binding power"). */
export const BindingPower = {
  None: 0,
  Assignment: 1,
  Lambda: 2,
  Or: 3,
  And: 4,
  Comparison: 5,
  Additive: 6,
  Multiplicative: 7,
  Exponential: 8,
  PrefixUnary: 9,
  Postfix: 10,
  Sigil: 11,
} as const;

export class Operator implements IOperator {
  constructor(
    readonly symbol: string,
    readonly type: OperatorType,
    readonly priority: number,
    readonly associativity: Associativity = Associativity.Left,
  ) {
    Object.freeze(this);
  }
}

const { Separator, Prefix, Suffix, OpenBracket, CloseBracket, Boundary, ItemSeparator } = OperatorType;
const P = BindingPower;

/** Every operator of the Core standard. */
export const Operators = {
  // Sequence boundaries (not expression operators)
  newLine: new Operator("\n", Boundary, P.None),
  terminator: new Operator(";", Boundary, P.None),
  // Scope sigils
  environmentSigil: new Operator("@", Prefix, P.Sigil, Associativity.Right),
  contextSigil: new Operator("$", Prefix, P.Sigil, Associativity.Right),
  // Assignment
  setVariable: new Operator("=", Separator, P.Assignment, Associativity.Right),
  initVariable: new Operator(":=", Separator, P.Assignment, Associativity.Right),
  conditionalSetVariable: new Operator("?=", Separator, P.Assignment, Associativity.Right),
  // Lambda definition
  lambda: new Operator("=>", Separator, P.Lambda, Associativity.Right),
  // Delimiters; ( and [ in an operator position are a function call and an index expression
  openCircleBracket: new Operator("(", OpenBracket | Suffix, P.Postfix),
  closeCircleBracket: new Operator(")", CloseBracket, P.Postfix),
  openSquareBracket: new Operator("[", OpenBracket | Suffix, P.Postfix),
  closeSquareBracket: new Operator("]", CloseBracket, P.Postfix),
  openCurlyBracket: new Operator("{", OpenBracket, P.None),
  closeCurlyBracket: new Operator("}", CloseBracket, P.None),
  textDelimiter: new Operator('"', OpenBracket | CloseBracket, P.None),
  // Structural separators
  comma: new Operator(",", ItemSeparator, P.None),
  colon: new Operator(":", ItemSeparator, P.None),
  dot: new Operator(".", Separator, P.Postfix),
  // Logical
  or: new Operator("||", Separator, P.Or),
  and: new Operator("&&", Separator, P.And),
  // Comparison (non-associative)
  equal: new Operator("==", Separator, P.Comparison, Associativity.None),
  notEqualA: new Operator("!=", Separator, P.Comparison, Associativity.None),
  notEqualB: new Operator("<>", Separator, P.Comparison, Associativity.None),
  lesser: new Operator("<", Separator, P.Comparison, Associativity.None),
  lesserOrEqual: new Operator("<=", Separator, P.Comparison, Associativity.None),
  greater: new Operator(">", Separator, P.Comparison, Associativity.None),
  greaterOrEqual: new Operator(">=", Separator, P.Comparison, Associativity.None),
  // Additive
  add: new Operator("+", Separator, P.Additive),
  subtract: new Operator("-", Separator, P.Additive),
  // Multiplicative
  multiply: new Operator("*", Separator, P.Multiplicative),
  divide: new Operator("/", Separator, P.Multiplicative),
  modulo: new Operator("%", Separator, P.Multiplicative),
  // Exponential
  power: new Operator("^", Separator, P.Exponential, Associativity.Right),
  // Prefix unary
  negate: new Operator("-", Prefix, P.PrefixUnary, Associativity.Right),
  not: new Operator("!", Prefix, P.PrefixUnary, Associativity.Right),
} as const;

/** Every operator, in the order of the operator table. */
export const operatorList: readonly Operator[] = Object.freeze(Object.values(Operators));

/** Operators by spelling; a spelling can have several roles (`-`). */
export const operatorMap: ReadonlyMap<string, readonly Operator[]> = (() => {
  const map = new Map<string, Operator[]>();
  for (const operator of operatorList) map.set(operator.symbol, [...(map.get(operator.symbol) ?? []), operator]);
  return map;
})();

/** Spellings of the operator tokens (without the new line). */
export const tokenSpellings: ReadonlySet<string> = new Set(
  operatorList.map((operator) => operator.symbol).filter((symbol) => symbol !== "\n"),
);

export function isOperatorSpelling(symbol: string): boolean {
  return tokenSpellings.has(symbol);
}

/** Whether a character begins a 2-character operator (`=`, `:`, `?`, `&`, `|`, `<`, `>`, `!`). */
export function canBeginTwoCharacterOperator(c: string): boolean {
  for (const spelling of tokenSpellings) {
    if (spelling.length === 2 && spelling[0] === c) return true;
  }
  return false;
}
