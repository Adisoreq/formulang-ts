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
  /** Offset of the local time from UTC, in minutes (Core 1.0). */
  timeOffset: "time_offset",
} as const;

/** Names of the environment constants of the Core standard that the library reads. */
export const EnvironmentConstants = {
  /** The current time of the execution: Unix time in milliseconds, UTC (Core 1.0). */
  now: "NOW",
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

/** `@time_offset` of the execution, in minutes; 0 if it is not a Number. */
export function timeOffset(context: IContext): number {
  const raw = readEnvironmentVariable(context, EnvironmentVariables.timeOffset)?.raw;
  return typeof raw === "number" ? raw : 0;
}

/** `@suppress_errors` of the execution. */
export function suppressErrors(context: IContext): boolean {
  return readEnvironmentVariable(context, EnvironmentVariables.suppressErrors)?.raw === true;
}
