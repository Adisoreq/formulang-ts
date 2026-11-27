import type { IObject, IValue } from "../../abstractions/primitives.js";
import type { IParsingResult, IWarning } from "../../abstractions/processing.js";
import { ExpressionKind, TokenType, WarningCode } from "../../abstractions/processing.js";
import type { IContext, IEnvironment } from "../../abstractions/structures.js";
import { FlFunction, isProcedure } from "../functions/function.js";
import { TypeNames } from "../primitives/types.js";
import type { SourcePosition } from "./cleaner.js";
import { ParsingResult } from "./results.js";

/** Immutable warning of the preparation (docs/standards/core/semantics/warnings.md, since `core-1.2`). */
export class Warning implements IWarning {
  constructor(
    readonly code: string,
    readonly message: string,
    readonly line: number,
    readonly column: number,
  ) {
    Object.freeze(this);
  }

  /** `UNUSED_VALUE (line 2, column 1): The value of ...` */
  toString(): string {
    return `${this.code} (line ${this.line}, column ${this.column}): ${this.message}`;
  }
}

/** Order of the warnings at the same position: the order of the table of the standard. */
const ORDER: readonly string[] = [
  WarningCode.UnusedValue,
  WarningCode.ContinuedLine,
  WarningCode.MetadataType,
  WarningCode.MetadataContext,
];

/** Warnings in the order of their positions; warnings at the same position in the order of the standard. */
export function sortWarnings(warnings: readonly IWarning[]): readonly IWarning[] {
  const rank = (code: string): number => {
    const index = ORDER.indexOf(code);
    return index < 0 ? ORDER.length : index;
  };
  return Object.freeze(
    [...warnings].sort((a, b) => a.line - b.line || a.column - b.column || rank(a.code) - rank(b.code)),
  );
}

// Sequences

/**
 * `UNUSED_VALUE` and `CONTINUED_LINE`. A sequence is not an unused value if its root is a procedure call (an
 * assignment or another procedure) or a function with side effects (`sideEffectFree` is `false`, e.g. a function of
 * the host application or of an extension standard).
 */
export function sequenceWarnings(parsing: IParsingResult, environment: IEnvironment): IWarning[] {
  const warnings: IWarning[] = [];
  const starts = parsing instanceof ParsingResult ? parsing.starts : undefined;
  const sequences = parsing.sequences;
  sequences.forEach((sequence, i) => {
    const start = starts?.[i];
    const line = start?.line ?? 0;
    const column = start?.first.column ?? 0;
    if (i < sequences.length - 1 && !hasEffect(sequence.root, environment)) {
      warnings.push(
        new Warning(WarningCode.UnusedValue, `The value of the sequence at line ${line} is not used.`, line, column),
      );
    }
    const first = start?.first;
    if (
      i > 0 &&
      first?.type === TokenType.Operator &&
      (first.value === "-" || first.value === "!") &&
      start?.separator?.value === "\n" &&
      onPreviousLine(start.previousLast?.line, first.line)
    ) {
      warnings.push(
        new Warning(
          WarningCode.ContinuedLine,
          `The sequence at line ${line} starts with "${first.value}": a new line ends the previous sequence. ` +
            "Put the operator at the end of the previous line, or the expression in parentheses.",
          line,
          column,
        ),
      );
    }
  });
  return warnings;
}

function onPreviousLine(previous: number | undefined, current: number | undefined): boolean {
  return previous === undefined || current === undefined || previous === current - 1;
}

function hasEffect(root: IParsingResult["sequences"][number]["root"], environment: IEnvironment): boolean {
  if (root.kind !== ExpressionKind.FunctionCall) return false;
  const fn = environment.getFunction(root.name);
  // An unknown function is an Error of the evaluation, not a warning
  if (fn === undefined) return true;
  return isProcedure(fn) || !(fn instanceof FlFunction) || !fn.sideEffectFree;
}

// Metadata

/** Reports a value of a wrong type: the key (dotted for a nested key, e.g. `parameters.period.min`) and the type. */
export type MetadataReport = (key: string, type: string) => void;

/**
 * Checks the value of a top-level metadata key of an extension standard or of the host application (e.g. `stock`),
 * registered with `Environment.registerMetadataChecker`.
 */
export type MetadataChecker = (value: IValue, key: string, report: MetadataReport) => void;

const is = (value: IValue, base: string): boolean => value.type.base === base;

/** Building blocks of the {@link MetadataChecker}s. */
export const MetadataChecks = {
  /** A Text. */
  text(value: IValue, key: string, report: MetadataReport): void {
    if (!is(value, TypeNames.Text)) report(key, TypeNames.Text);
  },
  number(value: IValue, key: string, report: MetadataReport): void {
    if (!is(value, TypeNames.Number)) report(key, TypeNames.Number);
  },
  array(value: IValue, key: string, report: MetadataReport): void {
    if (!is(value, TypeNames.Array)) report(key, TypeNames.Array);
  },
  /** A Text, or an Array of Texts. */
  textOrTexts(value: IValue, key: string, report: MetadataReport): void {
    const valid =
      is(value, TypeNames.Text) ||
      (is(value, TypeNames.Array) && (value.raw as readonly IValue[]).every((e) => is(e, TypeNames.Text)));
    if (!valid) report(key, "Text or Array of Text");
  },
  /** An Object whose known keys are checked by `keys`; other keys are ignored. */
  object(keys: Readonly<Record<string, MetadataChecker>>): MetadataChecker {
    return (value, key, report) => {
      if (!is(value, TypeNames.Object)) {
        report(key, TypeNames.Object);
        return;
      }
      const object = value.raw as IObject;
      for (const [name, check] of Object.entries(keys)) {
        const property = object.getProperty(name);
        if (property !== undefined) check(property.getValue(), `${key}.${name}`, report);
      }
    };
  },
  /** An Object whose every value is checked by `check`. */
  objectOf(check: MetadataChecker): MetadataChecker {
    return (value, key, report) => {
      if (!is(value, TypeNames.Object)) {
        report(key, TypeNames.Object);
        return;
      }
      const object = value.raw as IObject;
      for (const name of object.keys) check(object.getProperty(name)!.getValue(), `${key}.${name}`, report);
    };
  },
} as const;

/** A parameter description (docs/standards/core/README.md, "Metadata"). */
const parameterDescription = MetadataChecks.object({
  type: MetadataChecks.text,
  name: MetadataChecks.text,
  description: MetadataChecks.text,
  min: MetadataChecks.number,
  max: MetadataChecks.number,
  options: MetadataChecks.array,
});

/** The metadata keys of the Core standard. */
const CORE_KEYS: ReadonlyMap<string, MetadataChecker> = new Map(
  Object.entries({
    id: MetadataChecks.text,
    name: MetadataChecks.text,
    description: MetadataChecks.text,
    author: MetadataChecks.text,
    version: MetadataChecks.text,
    context: MetadataChecks.text,
    result: MetadataChecks.textOrTexts,
    requires: MetadataChecks.textOrTexts,
    parameters: MetadataChecks.objectOf(parameterDescription),
  }),
);

/** Something that has registered metadata checkers (an `Environment`). */
interface MetadataCheckers {
  getMetadataChecker(key: string): MetadataChecker | undefined;
}

const hasCheckers = (environment: IEnvironment): environment is IEnvironment & MetadataCheckers =>
  typeof (environment as Partial<MetadataCheckers>).getMetadataChecker === "function";

/** Context type names of a context (`Context.contextTypeNames`), or `undefined` for another implementation. */
function contextTypeNames(context: IContext): readonly string[] | undefined {
  const names = (context as { readonly contextTypeNames?: readonly string[] }).contextTypeNames;
  return Array.isArray(names) ? names : undefined;
}

/**
 * The `METADATA_TYPE` warnings of a metadata Object: the Core keys, and the keys checked by `checkers` (e.g. the
 * `stock` key of an extension standard). It needs no context and no environment.
 */
export function metadataTypeWarnings(
  metadata: IValue,
  position: SourcePosition,
  checkers: (key: string) => MetadataChecker | undefined = () => undefined,
): IWarning[] {
  const warnings: IWarning[] = [];
  if (!is(metadata, TypeNames.Object)) return warnings;
  const object = metadata.raw as IObject;
  const report: MetadataReport = (key, type) =>
    warnings.push(
      new Warning(
        WarningCode.MetadataType,
        `Metadata key "${key}" must be of type ${type}.`,
        position.line,
        position.column,
      ),
    );
  for (const key of object.keys) {
    const check = CORE_KEYS.get(key) ?? checkers(key);
    check?.(object.getProperty(key)!.getValue(), key, report);
  }
  return warnings;
}

/** `METADATA_TYPE` and `METADATA_CONTEXT`, at the position of the metadata block. */
export function metadataWarnings(metadata: IValue, position: SourcePosition, context: IContext): IWarning[] {
  const environment = context.environment;
  const warnings = metadataTypeWarnings(metadata, position, (key) =>
    hasCheckers(environment) ? environment.getMetadataChecker(key) : undefined,
  );
  if (!is(metadata, TypeNames.Object)) return warnings;
  const object = metadata.raw as IObject;
  const declared = object.getProperty("context")?.getValue();
  const names = contextTypeNames(context);
  if (declared !== undefined && is(declared, TypeNames.Text) && names !== undefined && names.length > 0) {
    const name = declared.raw as string;
    if (!names.includes(name)) {
      warnings.push(
        new Warning(
          WarningCode.MetadataContext,
          `The formula is written for the context "${name}", but is executed in "${names[0]}".`,
          position.line,
          position.column,
        ),
      );
    }
  }
  return warnings;
}
