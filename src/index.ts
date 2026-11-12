/**
 * FormuLang-TS: implementation of the FormuLang standard (Core 0.3) and of its execution pipeline.
 *
 * - `formulang-ts` – the Core standard, the pipeline and the JavaScript facade (`evaluate`, `createEngine`);
 * - `formulang-ts/abstractions` – the interfaces shared by every module;
 * - `formulang-ts/stock` – the Stock extension standard (Stock 0.1).
 *
 * @packageDocumentation
 */
export * from "./core/index.js";
export * from "./facade/index.js";
export { ContainerType, FunctionType, PrimitiveType } from "./abstractions/primitives.js";
export { ContextType } from "./abstractions/structures.js";
export { ExpressionKind, TokenType, VariableScope } from "./abstractions/processing.js";
export { Associativity, OperatorType } from "./abstractions/operators.js";
export type * from "./abstractions/index.js";
