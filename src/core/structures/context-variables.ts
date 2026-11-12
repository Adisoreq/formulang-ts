/**
 * Reading the environment variables of an execution from its context.
 *
 * @module
 */
import type { IValue } from "../../abstractions/primitives.js";
import type { IContext } from "../../abstractions/structures.js";

/** Names of the environment variables of the Core standard. */
export const EnvironmentVariables = {
  arrayIndexing: "array_indexing",
  suppressErrors: "suppress_errors",
} as const;

/** Value of an environment variable in the context of an execution (the copy that the formula can change). */
export function readEnvironmentVariable(context: IContext, name: string): IValue | undefined {
  return context.environmentVariables.getProperty(name)?.getValue();
}

/** `@array_indexing` of the execution; 0 if it is not a Number. */
export function arrayIndexing(context: IContext): number {
  const raw = readEnvironmentVariable(context, EnvironmentVariables.arrayIndexing)?.raw;
  return typeof raw === "number" ? raw : 0;
}

/** `@suppress_errors` of the execution. */
export function suppressErrors(context: IContext): boolean {
  return readEnvironmentVariable(context, EnvironmentVariables.suppressErrors)?.raw === true;
}
