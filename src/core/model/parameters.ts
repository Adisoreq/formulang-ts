/**
 * Parameter specifications and the parameter normalization of the formula models
 * (FormuLang docs/implementation/formula_models.md, "Parameter specification").
 *
 * @module
 */
import type { IObject, IValue } from "../../abstractions/primitives.js";
import type { IEnvironment } from "../../abstractions/structures.js";
import { ArgumentTemplate, matchesTemplate } from "../functions/argument-template.js";
import { FlObject } from "../primitives/object.js";
import { TypeNames, Types } from "../primitives/types.js";
import { Value } from "../primitives/value.js";
import { serialize } from "../serialization/serializer.js";
import { valuesEqual } from "../standards/helpers.js";

/** Codes of the problems of the parameter normalization. */
export const ParameterProblemCode = {
  /** A given key is not a parameter of the formula. */
  Unknown: "UNKNOWN",
  /** A parameter without a default is not given. */
  Missing: "MISSING",
  /** The value is not of the type of the parameter. */
  Type: "TYPE",
  /** The value is lower than the lowest allowed value. */
  Min: "MIN",
  /** The value is greater than the highest allowed value. */
  Max: "MAX",
  /** The value is not one of the allowed values. */
  Option: "OPTION",
} as const;
export type ParameterProblemCode = (typeof ParameterProblemCode)[keyof typeof ParameterProblemCode];

/** A problem of the parameter normalization: a code, the key of the parameter and a message for the user. */
export interface ParameterProblem {
  readonly code: ParameterProblemCode;
  readonly key: string;
  readonly message: string;
}

const BASE_TYPES: ReadonlySet<string> = new Set(Object.values(TypeNames));

const is = (value: IValue | undefined, base: string): value is IValue => value?.type.base === base;

/**
 * Specification of one parameter of a formula, read from a parameter description of the `parameters` key of the
 * metadata (docs/standards/core/README.md, "Metadata").
 */
export class ParameterSpec {
  /** Name for the user; the key if the description has no `name`. */
  readonly name: string;

  constructor(
    readonly key: string,
    /** Base or extended type of the value, e.g. `"Number"` or `"Stock.Candle"`; `undefined` for any value. */
    readonly type: string | undefined,
    /** Default value; `undefined` if there is none. */
    readonly defaultValue: IValue | undefined,
    name?: string,
    readonly description?: string,
    readonly min?: number,
    readonly max?: number,
    /** Allowed values; `undefined` if any value of the type is allowed. */
    readonly options?: readonly IValue[],
  ) {
    this.name = name ?? key;
    Object.freeze(this);
  }

  /**
   * The specifications of the `parameters` of a metadata Object, in the order of their keys; `[]` without
   * `parameters`.
   *
   * @throws {TypeError} if `parameters` is not an Object of parameter descriptions with values of the right types
   * (the `METADATA_TYPE` warnings).
   */
  static fromMetadata(metadata: IValue): ParameterSpec[] {
    if (!is(metadata, TypeNames.Object)) return [];
    const parameters = (metadata.raw as IObject).getProperty("parameters")?.getValue();
    if (parameters === undefined) return [];
    if (!is(parameters, TypeNames.Object)) throw new TypeError('The metadata key "parameters" must be an Object.');
    const object = parameters.raw as IObject;
    return object.keys.map((key) => ParameterSpec.#fromDescription(key, object.getProperty(key)!.getValue()));
  }

  static #fromDescription(key: string, description: IValue): ParameterSpec {
    if (!is(description, TypeNames.Object)) {
      throw new TypeError(`The description of the parameter "${key}" must be an Object.`);
    }
    const object = description.raw as IObject;
    const read = (name: string, base: string): IValue | undefined => {
      const value = object.getProperty(name)?.getValue();
      if (value !== undefined && !is(value, base)) {
        throw new TypeError(`Metadata key "parameters.${key}.${name}" must be of type ${base}.`);
      }
      return value;
    };
    const text = (name: string): string | undefined => read(name, TypeNames.Text)?.raw as string | undefined;
    const number = (name: string): number | undefined => read(name, TypeNames.Number)?.raw as number | undefined;
    const options = read("options", TypeNames.Array)?.raw as readonly IValue[] | undefined;
    return new ParameterSpec(
      key,
      text("type"),
      object.getProperty("default")?.getValue(),
      text("name"),
      text("description"),
      number("min"),
      number("max"),
      options === undefined ? undefined : Object.freeze([...options]),
    );
  }

  /** Whether a value is of the type of the parameter (an extended type also accepts the types derived from it). */
  accepts(value: IValue, environment?: IEnvironment): boolean {
    if (this.type === undefined) return true;
    if (BASE_TYPES.has(this.type)) return value.type.base === this.type;
    if (environment === undefined) return value.type.extended === this.type;
    return matchesTemplate(value, ArgumentTemplate.of(this.key, Types.of(TypeNames.Object, this.type)), environment);
  }
}

/** Result of the parameter normalization: the normalized Object, or the problems (never both). */
export class ParameterNormalization {
  /** @internal */
  constructor(
    /** The normalized `PARAMETERS` Object; `undefined` if there are problems. */
    readonly parameters: IObject | undefined,
    readonly problems: readonly ParameterProblem[],
  ) {
    Object.freeze(this);
  }

  get successful(): boolean {
    return this.problems.length === 0;
  }
}

/** Given parameter values: an Object, or values by key. */
export type GivenParameterValues = IObject | ReadonlyMap<string, IValue>;

function entriesOf(given: GivenParameterValues): [string, IValue][] {
  if (given instanceof Map) return [...given.entries()];
  const object = given as IObject;
  return object.keys.map((key) => [key, object.getProperty(key)!.getValue()]);
}

const problem = (code: ParameterProblemCode, key: string, message: string): ParameterProblem =>
  Object.freeze({ code, key, message });

/**
 * Parameter normalization (docs/implementation/formula_models.md, "Parameter normalization"): the complete
 * `PARAMETERS` Object of the given values and the defaults, in the order of the specifications, or every problem:
 * unknown keys first, then the problems of the specifications in their order.
 *
 * @param environment The environment whose extended type tree is used for a parameter of an extended type.
 */
export function normalizeParameters(
  specs: readonly ParameterSpec[],
  given: GivenParameterValues = new Map(),
  environment?: IEnvironment,
): ParameterNormalization {
  const problems: ParameterProblem[] = [];
  const values = new Map(entriesOf(given));
  const keys = new Set(specs.map((spec) => spec.key));
  for (const key of values.keys()) {
    if (!keys.has(key)) problems.push(problem(ParameterProblemCode.Unknown, key, `"${key}" is not a parameter.`));
  }
  const normalized = new FlObject();
  for (const spec of specs) {
    const value = values.get(spec.key) ?? spec.defaultValue;
    if (value === undefined) {
      problems.push(problem(ParameterProblemCode.Missing, spec.key, `The parameter "${spec.name}" is required.`));
      continue;
    }
    if (!spec.accepts(value, environment)) {
      problems.push(
        problem(ParameterProblemCode.Type, spec.key, `The parameter "${spec.name}" must be of type ${spec.type}.`),
      );
      continue;
    }
    if (is(value, TypeNames.Number)) {
      const number = value.raw as number;
      if (spec.min !== undefined && number < spec.min) {
        problems.push(
          problem(ParameterProblemCode.Min, spec.key, `The parameter "${spec.name}" must be at least ${spec.min}.`),
        );
      }
      if (spec.max !== undefined && number > spec.max) {
        problems.push(
          problem(ParameterProblemCode.Max, spec.key, `The parameter "${spec.name}" must be at most ${spec.max}.`),
        );
      }
    }
    if (spec.options !== undefined && !spec.options.some((option) => valuesEqual(option, value))) {
      const allowed = spec.options.map((option) => serialize(option)).join(", ");
      problems.push(
        problem(ParameterProblemCode.Option, spec.key, `The parameter "${spec.name}" must be one of: ${allowed}.`),
      );
    }
    normalized.initVariable(spec.key, value);
  }
  return problems.length > 0
    ? new ParameterNormalization(undefined, Object.freeze(problems))
    : new ParameterNormalization(normalized, Object.freeze([]));
}

/**
 * The parameter key of a normalized Object (docs/implementation/formula_models.md, "Parameter key"): its
 * serialization with the initial values of the serialization variables, e.g. `{ period: 14 }`.
 */
export function parametersKey(parameters: IObject): string {
  return serialize(Value.object(parameters));
}
