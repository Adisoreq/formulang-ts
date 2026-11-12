/**
 * Contracts of operators.
 *
 * @see https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/operator-parsing.md
 * @module
 */

/** Grouping of operators with equal binding power. */
export const Associativity = {
  /** `a - b - c` = `(a - b) - c` */
  Left: "Left",
  /** `a ^ b ^ c` = `a ^ (b ^ c)` */
  Right: "Right",
  /** Operators cannot be chained: `a < b < c` is a syntax error. */
  None: "None",
} as const;
export type Associativity = (typeof Associativity)[keyof typeof Associativity];

/** Roles of an operator token. The values are bit flags and can be combined. */
export const OperatorType = {
  None: 0,
  /** Separates operands: `A [operator] B` */
  Separator: 1,
  /** Unary operator before its operand: `[operator] A` */
  Prefix: 2,
  /** Unary operator after its operand: `A [operator]` */
  Suffix: 4,
  /** Opening bracket. */
  OpenBracket: 8,
  /** Closing bracket. */
  CloseBracket: 16,
  /** Sequence boundary (new line, semicolon). Not an expression operator. */
  Boundary: 32,
  /** Structural separator inside a delimiter (comma, colon). */
  ItemSeparator: 64,
} as const;
/** Combination of {@link OperatorType} flags. */
export type OperatorType = number;

export interface IOperator {
  readonly symbol: string;
  readonly type: OperatorType;
  /** Binding power. A higher binding power binds more tightly; 0 for tokens that do not compete for it. */
  readonly priority: number;
  readonly associativity: Associativity;
}
