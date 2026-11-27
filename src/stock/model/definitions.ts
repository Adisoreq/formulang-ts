/**
 * Formula models of the Stock standard (FormuLang docs/implementation/formula_models.md): definitions of indicators,
 * patterns and strategies read from the metadata of their formulas, and their instances (a definition with its
 * parameter values).
 *
 * @module
 */
import type { IError, IObject, IValue } from "../../abstractions/primitives.js";
import type { IEnvironment } from "../../abstractions/structures.js";
import {
  Environment,
  type GivenParameterValues,
  type ParameterNormalization,
  type ParameterProblem,
  ParameterSpec,
  TypeNames,
  Validator,
  Value,
  metadataTypeWarnings,
  normalizeParameters,
  readMetadata,
} from "../../core/index.js";
import { fromJs } from "../../facade/index.js";
import { isFormulaId } from "../names.js";
import { FormulaDefinition, FormulaParameter } from "../registry.js";
import { StockStandard } from "../standard.js";
import { type Instance, IndicatorInstance, PatternInstance, StrategyInstance } from "./instances.js";

/** Kind of a definition: the context type it is written for (the `context` key of the metadata). */
export const DefinitionKind = {
  Indicator: "Indicator",
  Pattern: "Pattern",
  Strategy: "Strategy",
} as const;
export type DefinitionKind = (typeof DefinitionKind)[keyof typeof DefinitionKind];

const KINDS: Readonly<Record<string, DefinitionKind>> = {
  "Stock.Indicator": DefinitionKind.Indicator,
  "Stock.Pattern": DefinitionKind.Pattern,
  "Stock.Strategy": DefinitionKind.Strategy,
};

/** Why a formula is not a valid definition (docs/implementation/formula_models.md, "Definition"). */
export const InvalidDefinitionReason = {
  /** The validation or the metadata reading fails. */
  Error: "ERROR",
  /** A known key of the metadata has a value of a wrong type. */
  MetadataType: "METADATA_TYPE",
  /** `id` is missing or is not a valid identifier. */
  Id: "ID",
  /** `context` is missing or is not an indicator, a pattern or a strategy. */
  Context: "CONTEXT",
} as const;
export type InvalidDefinitionReason = (typeof InvalidDefinitionReason)[keyof typeof InvalidDefinitionReason];

/** A formula that is not a valid definition. */
export class InvalidDefinitionError extends Error {
  constructor(
    readonly reason: InvalidDefinitionReason,
    message: string,
    /** The Error of the validation or of the metadata reading, for the reason `ERROR`. */
    readonly error?: IError,
  ) {
    super(message);
    this.name = "InvalidDefinitionError";
  }
}

/** The parameter values that make an instance invalid. */
export class ParameterError extends Error {
  constructor(readonly problems: readonly ParameterProblem[]) {
    super(problems.map((problem) => problem.message).join(" "));
    this.name = "ParameterError";
  }
}

/** An output of an indicator (the `stock.outputs` key of the metadata). */
export interface OutputDescription {
  readonly key: string;
  /** Name for the user; the key if it is not given. */
  readonly name: string;
  readonly description: string | undefined;
}

/** A condition of the `checks` of a strategy, with its label for the user (the `stock.checks` key). */
export interface CheckDescription {
  readonly key: string;
  readonly label: string;
}

/** Parameter values given by the host application: FormuLang values, or JavaScript values (`undefined` is not given). */
export type GivenParameters = GivenParameterValues | Readonly<Record<string, unknown>>;

/** The serialized form of an instance. */
export interface InstanceJson {
  readonly id: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

const isObject = (value: unknown): value is IObject =>
  typeof value === "object" && value !== null && typeof (value as IObject).getProperty === "function";

/** The given values as FormuLang values by key. */
function givenValues(given: GivenParameters | undefined): GivenParameterValues {
  if (given === undefined) return new Map();
  if (given instanceof Map || isObject(given)) return given as GivenParameterValues;
  const values = new Map<string, IValue>();
  for (const [key, value] of Object.entries(given)) {
    if (value !== undefined) values.set(key, fromJs(value));
  }
  return values;
}

const text = (object: IObject | undefined, key: string): string | undefined => {
  const value = object?.getProperty(key)?.getValue();
  return value?.type.base === TypeNames.Text ? (value.raw as string) : undefined;
};

const objectOf = (object: IObject | undefined, key: string): IObject | undefined => {
  const value = object?.getProperty(key)?.getValue();
  return value?.type.base === TypeNames.Object ? (value.raw as IObject) : undefined;
};

/**
 * A definition: a formula with the information read from its metadata (docs/implementation/formula_models.md,
 * "Definition"). It does not depend on an environment.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- an instance of any definition
export abstract class Definition<TInstance extends Instance<any> = Instance<any>> {
  abstract readonly kind: DefinitionKind;
  readonly name: string;
  readonly description: string | undefined;
  readonly category: string | undefined;

  /** @internal */
  protected constructor(
    readonly id: string,
    readonly formula: string,
    /** The metadata Object of the formula. */
    readonly metadata: IValue,
    readonly parameters: readonly ParameterSpec[],
  ) {
    const object = metadata.raw as IObject;
    this.name = text(object, "name") ?? id;
    this.description = text(object, "description");
    this.category = text(objectOf(object, "stock"), "category");
  }

  /**
   * Reads a definition from the metadata of a formula.
   *
   * @param environment Environment of the validation (a new Core environment by default).
   * @throws {InvalidDefinitionError} if the formula is not a valid definition.
   */
  static fromFormula(
    formula: string,
    environment?: IEnvironment,
  ): IndicatorDefinition | PatternDefinition | StrategyDefinition {
    const errors = new Validator().validate(formula, environment ?? Environment.create()).errors;
    if (errors.length > 0) {
      throw new InvalidDefinitionError(InvalidDefinitionReason.Error, errors[0]!.message, errors[0]);
    }
    const reading = readMetadata(formula);
    if (!reading.successful) {
      throw new InvalidDefinitionError(InvalidDefinitionReason.Error, reading.error.message, reading.error);
    }
    const metadata = reading.metadata;
    const typeWarnings = metadataTypeWarnings(metadata, reading.position ?? { line: 1, column: 1 }, (key) =>
      key === "stock" ? StockStandard.metadataChecker : undefined,
    );
    if (typeWarnings.length > 0) {
      throw new InvalidDefinitionError(
        InvalidDefinitionReason.MetadataType,
        typeWarnings.map((warning) => warning.message).join(" "),
      );
    }
    const object = metadata.raw as IObject;
    const id = text(object, "id");
    if (id === undefined || !isFormulaId(id)) {
      throw new InvalidDefinitionError(InvalidDefinitionReason.Id, 'The metadata has no valid "id".');
    }
    const kind = KINDS[text(object, "context") ?? ""];
    if (kind === undefined) {
      throw new InvalidDefinitionError(
        InvalidDefinitionReason.Context,
        'The "context" of the metadata must be "Stock.Indicator", "Stock.Pattern" or "Stock.Strategy".',
      );
    }
    const parameters = ParameterSpec.fromMetadata(metadata);
    switch (kind) {
      case DefinitionKind.Indicator:
        return new IndicatorDefinition(id, formula, metadata, parameters);
      case DefinitionKind.Pattern:
        return new PatternDefinition(id, formula, metadata, parameters);
      case DefinitionKind.Strategy:
        return new StrategyDefinition(id, formula, metadata, parameters);
    }
  }

  /**
   * The parameter normalization of the given values (docs/implementation/formula_models.md, "Parameter
   * normalization"), e.g. to show the problems in an editor before an instance is created.
   */
  normalize(given?: GivenParameters, environment?: IEnvironment): ParameterNormalization {
    return normalizeParameters(this.parameters, givenValues(given), environment);
  }

  /**
   * An instance with the given parameter values; missing ones get their defaults.
   *
   * @throws {ParameterError} if the values have problems.
   */
  instance(given?: GivenParameters, environment?: IEnvironment): TInstance {
    const normalization = this.normalize(given, environment);
    if (normalization.parameters === undefined) throw new ParameterError(normalization.problems);
    return this.createInstance(normalization.parameters);
  }

  /**
   * An instance read back from its serialized form; its parameters are normalized again.
   *
   * @throws {TypeError} if the identifier is not the identifier of the definition.
   * @throws {ParameterError} if the values have problems.
   */
  instanceFromJSON(json: InstanceJson, environment?: IEnvironment): TInstance {
    if (json.id !== this.id) throw new TypeError(`The instance belongs to "${json.id}", not to "${this.id}".`);
    return this.instance(json.parameters, environment);
  }

  /** @internal */
  protected abstract createInstance(parameters: IObject): TInstance;
}

/** An indicator: a formula of the Indicator Context. */
export class IndicatorDefinition extends Definition<IndicatorInstance> {
  readonly kind = DefinitionKind.Indicator;
  /** The outputs of the metadata, in their order; `undefined` if the metadata does not give them. */
  readonly outputs: readonly OutputDescription[] | undefined;

  /** @internal */
  constructor(id: string, formula: string, metadata: IValue, parameters: readonly ParameterSpec[]) {
    super(id, formula, metadata, parameters);
    const outputs = objectOf(objectOf(metadata.raw as IObject, "stock"), "outputs");
    this.outputs =
      outputs === undefined
        ? undefined
        : Object.freeze(
            outputs.keys.map((key) => {
              const description = objectOf(outputs, key);
              return Object.freeze({
                key,
                name: text(description, "name") ?? key,
                description: text(description, "description"),
              });
            }),
          );
  }

  /** The definition of the formula registry, for `LOAD_INDICATOR`. */
  toRegistryDefinition(): FormulaDefinition {
    return registryDefinition(this);
  }

  /** @internal */
  protected createInstance(parameters: IObject): IndicatorInstance {
    return new IndicatorInstance(this, parameters);
  }
}

/** A candle pattern: a formula of the Pattern Context. */
export class PatternDefinition extends Definition<PatternInstance> {
  readonly kind = DefinitionKind.Pattern;

  /** The definition of the formula registry, for `LOAD_PATTERN`. */
  toRegistryDefinition(): FormulaDefinition {
    return registryDefinition(this);
  }

  /** @internal */
  protected createInstance(parameters: IObject): PatternInstance {
    return new PatternInstance(this, parameters);
  }
}

/** A strategy: a formula of the Strategy Context. */
export class StrategyDefinition extends Definition<StrategyInstance> {
  readonly kind = DefinitionKind.Strategy;
  /** The labels of the `checks` of the signal object, from the metadata; `undefined` if it does not give them. */
  readonly checks: readonly CheckDescription[] | undefined;

  /** @internal */
  constructor(id: string, formula: string, metadata: IValue, parameters: readonly ParameterSpec[]) {
    super(id, formula, metadata, parameters);
    const checks = objectOf(objectOf(metadata.raw as IObject, "stock"), "checks");
    this.checks =
      checks === undefined
        ? undefined
        : Object.freeze(checks.keys.map((key) => Object.freeze({ key, label: text(checks, key) ?? key })));
  }

  /** @internal */
  protected createInstance(parameters: IObject): StrategyInstance {
    return new StrategyInstance(this, parameters);
  }
}

function registryDefinition(definition: Definition): FormulaDefinition {
  return new FormulaDefinition(
    definition.id,
    definition.formula,
    definition.parameters.map((spec) => new FormulaParameter(spec.key, spec.defaultValue ?? Value.null())),
  );
}
