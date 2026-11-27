/**
 * Procedures of the Core standard (docs/standards/core/procedures/README.md): `SET`, `INIT`, `COND_SET`, `REQUIRE`,
 * and since `core-1.2` `STORE` and `CLEAR`. Every procedure returns the
 * `SUCCESS` Error, or the Error that stopped it.
 *
 * @module
 */
import type { IError, IObject, IValue } from "../../abstractions/primitives.js";
import { VariableScope } from "../../abstractions/processing.js";
import type { IContext, IMemory } from "../../abstractions/structures.js";
import { Errors } from "../errors.js";
import { ArgumentTemplate } from "../functions/argument-template.js";
import { Procedure } from "../functions/function.js";
import { Types } from "../primitives/types.js";
import type { VariableReference } from "../primitives/variable-reference.js";
import { anyArg, argumentError, arr, errorValue, operationError, overload, success, textArg, txt } from "./helpers.js";

type VariableOperation = (context: IContext, variable: VariableReference, value: IValue) => IError;

const variableProcedure = (name: string, operation: VariableOperation): Procedure =>
  new Procedure(name, { parameterCount: 2, takesVariable: true }, [
    overload(
      (a, c) => errorValue(operation(c, a[0]!.raw as VariableReference, a[1]!)),
      ArgumentTemplate.of("variable", Types.Variable),
      anyArg("value"),
    ),
  ]);

function definedByEnvironment(context: IContext, name: string): boolean {
  return context.environment.hasKey(name) || context.environmentVariables.hasKey(name);
}

function environmentVariableMissing(name: string): IError {
  return Errors.environmentError(`Environment variable "${name}" is not defined.`);
}

/** `SET` (`=`): docs/standards/core/procedures/SET.md */
function set(context: IContext, variable: VariableReference, value: IValue): IError {
  if (variable.scope === VariableScope.Environment) {
    if (!context.environmentVariables.hasKey(variable.name)) return environmentVariableMissing(variable.name);
    return context.environmentVariables.setProperty(variable.name, value);
  }
  if (context.hasKey(variable.name)) return context.setProperty(variable.name, value);
  if (definedByEnvironment(context, variable.name)) {
    return Errors.invalidIdentifierError(`"${variable.name}" symbol is already defined by environment.`);
  }
  context.initVariable(variable.name, value);
  return Errors.success();
}

/** `INIT` (`:=`): stores the value only if the variable does not exist or has no value. */
function init(context: IContext, variable: VariableReference, value: IValue): IError {
  if (variable.scope === VariableScope.Environment) {
    return context.environmentVariables.hasKey(variable.name)
      ? Errors.success()
      : environmentVariableMissing(variable.name);
  }
  const container = context.getProperty(variable.name);
  if (container === undefined) return set(context, variable, value);
  if (!container.canAccessValue) return context.setProperty(variable.name, value);
  return Errors.success();
}

/** `COND_SET` (`?=`): stores the value only if the variable exists. */
function conditionalSet(context: IContext, variable: VariableReference, value: IValue): IError {
  const scope: IObject = variable.scope === VariableScope.Environment ? context.environmentVariables : context;
  return scope.hasKey(variable.name) ? scope.setProperty(variable.name, value) : Errors.success();
}

const REQUIREMENT = /^([a-zA-Z_]\w*)-((?:\d+\+?|x)(?:\.(?:\d+\+?|x))*)$/;
const STANDARD = /^([a-zA-Z_]\w*)-(\d+(?:\.\d+)*)$/;

/**
 * Whether a standard identifier (`core-0.3`) satisfies a requirement: a name and version segments, where `n` is
 * exactly `n`, `n+` is `n` or higher and `x` is any number (docs/standards/core/procedures/REQUIRE.md).
 */
export function satisfies(standard: string, name: string, pattern: readonly string[]): boolean {
  const match = STANDARD.exec(standard);
  if (match === null || match[1] !== name) return false;
  const version = match[2]!.split(".").map(BigInt);
  return pattern.every((segment, i) => {
    if (segment === "x") return true;
    const actual = version[i] ?? 0n;
    const orHigher = segment.endsWith("+");
    const expected = BigInt(orHigher ? segment.slice(0, -1) : segment);
    return orHigher ? actual >= expected : actual === expected;
  });
}

/** `REQUIRE`: `NOT_SUPPORTED_ERROR` if a required standard is not supported by the environment. */
function require(requirements: readonly string[], context: IContext): IValue {
  const raw = context.environment.getProperty("STANDARDS")?.getValue().raw;
  const supported = Array.isArray(raw) ? (raw as IValue[]).map((s) => (typeof s.raw === "string" ? s.raw : "")) : [];
  for (const requirement of requirements) {
    const match = REQUIREMENT.exec(requirement);
    if (match === null) return operationError(`"${requirement}" is not a valid standard requirement.`);
    const name = match[1]!;
    const pattern = match[2]!.split(".");
    if (!supported.some((standard) => satisfies(standard, name, pattern))) {
      return errorValue(Errors.notSupportedError(`Standard "${requirement}" is not supported.`));
    }
  }
  return success();
}

// Memory (core-1.2): docs/core/context.md, "Memory"

/** The memory of the context, or the `OPERATION_ERROR` of a context without one (the Default Context). */
export function memoryOf(context: IContext, name: string): IMemory | IValue {
  const memory = context.memory;
  return memory === undefined
    ? operationError(`"${name}" can be used only in a context with a memory (an Iteration or Time Context).`)
    : memory;
}

export const isMemory = (value: IMemory | IValue): value is IMemory => "recall" in value;

/** `STORE(key, value)`: docs/standards/core/procedures/STORE.md */
function store(key: string, value: IValue, context: IContext): IValue {
  const memory = memoryOf(context, "STORE");
  if (!isMemory(memory)) return memory;
  if (value.type.base === Types.Delegate.base) return argumentError("A Delegate cannot be stored in the memory.");
  memory.store(key, value);
  return success();
}

/** `CLEAR(key)` and `CLEAR()`: docs/standards/core/procedures/CLEAR.md */
function clear(key: string | undefined, context: IContext): IValue {
  const memory = memoryOf(context, "CLEAR");
  if (!isMemory(memory)) return memory;
  memory.clear(key);
  return success();
}

export const coreProcedures = (): Procedure[] => [
  variableProcedure("SET", set),
  variableProcedure("INIT", init),
  variableProcedure("COND_SET", conditionalSet),
  new Procedure("REQUIRE", { parameterCount: 1, takesVariable: false }, [
    overload((a, c) => require([txt(a[0])], c), textArg("standard")),
    overload((a, c) => require(arr(a[0]).map(txt), c), ArgumentTemplate.arrayOf("standards", Types.Text)),
  ]),
  new Procedure("STORE", { parameterCount: 2, takesVariable: false, writesMemoryOnly: true }, [
    overload((a, c) => store(txt(a[0]), a[1]!, c), textArg("key"), anyArg("value")),
  ]),
  new Procedure("CLEAR", { parameterCount: 1, takesVariable: false, writesMemoryOnly: true }, [
    overload((a, c) => clear(txt(a[0]), c), textArg("key")),
    overload((_, c) => clear(undefined, c)),
  ]),
];
