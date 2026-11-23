import type { IValue } from "../abstractions/primitives.js";
import { IdentifierValidator, TypeNames, Value } from "../core/index.js";

/** Parameter of an indicator or a pattern with its default value, e.g. `period` = `14`. */
export class FormulaParameter {
  readonly defaultValue: IValue;

  constructor(
    readonly name: string,
    defaultValue: IValue | number,
  ) {
    this.defaultValue = typeof defaultValue === "number" ? Value.number(defaultValue) : defaultValue;
    Object.freeze(this);
  }
}

/** Parameters of a definition: {@link FormulaParameter}s, or default values by name (`{ period: 14 }`). */
export type FormulaParameters = Readonly<Record<string, IValue | number>> | readonly FormulaParameter[];

function toParameters(parameters: FormulaParameters): readonly FormulaParameter[] {
  return Array.isArray(parameters)
    ? (parameters as readonly FormulaParameter[])
    : Object.entries(parameters).map(([name, value]) => new FormulaParameter(name, value as IValue | number));
}

/**
 * Definition of the formula registry (docs/standards/stock/README.md, "Formula registry"): an identifier, a formula
 * and parameters with their default values.
 */
export class FormulaDefinition {
  /** Parameters with their default values, in the order of the definition. May be empty. */
  readonly parameters: readonly FormulaParameter[];

  /**
   * @param id Identifier used to load the definition, e.g. `SMA` or `ENGULFING`.
   * @param formula Formula executed once for every candle, in the context of its part of the registry.
   * @param parameters Parameters with their default values.
   * @throws {TypeError} for an invalid identifier, an invalid parameter name or default value, or a parameter
   * defined more than once.
   */
  constructor(
    readonly id: string,
    readonly formula: string,
    parameters: FormulaParameters = [],
  ) {
    if (!IdentifierValidator.validate(id)) throw new TypeError(`"${id}" is not a valid identifier.`);
    const list = toParameters(parameters);
    for (const parameter of list) {
      if (!IdentifierValidator.validate(parameter.name)) {
        throw new TypeError(`"${parameter.name}" is not a valid parameter name.`);
      }
      const base = parameter.defaultValue.type.base;
      if (base === TypeNames.Error || base === TypeNames.Undefined) {
        throw new TypeError(`Parameter "${parameter.name}" has no valid default value.`);
      }
    }
    if (new Set(list.map((p) => p.name)).size !== list.length) {
      throw new TypeError("A parameter is defined more than once.");
    }
    this.parameters = Object.freeze([...list]);
  }

  getParameter(name: string): FormulaParameter | undefined {
    return this.parameters.find((parameter) => parameter.name === name);
  }
}

/** One part of the formula registry: the indicators or the patterns. Identifiers are unique within a part. */
export class FormulaCollection {
  readonly #definitions = new Map<string, FormulaDefinition>();

  /** @param kind Name of the part, e.g. `Indicator`; used in the error messages. */
  constructor(readonly kind: string) {}

  get definitions(): readonly FormulaDefinition[] {
    return [...this.#definitions.values()];
  }

  get count(): number {
    return this.#definitions.size;
  }

  /**
   * Adds a definition, or an identifier, a formula and default parameter values
   * (`registry.indicators.add("SMA", formula, { period: 14 })`).
   *
   * @throws {Error} if a definition with the identifier is already registered.
   */
  add(definition: FormulaDefinition): this;
  add(id: string, formula: string, parameters?: FormulaParameters): this;
  add(definition: FormulaDefinition | string, formula?: string, parameters: FormulaParameters = []): this {
    const added =
      typeof definition === "string" ? new FormulaDefinition(definition, formula ?? "", parameters) : definition;
    if (this.#definitions.has(added.id)) throw new Error(`${this.kind} "${added.id}" is already registered.`);
    this.#definitions.set(added.id, added);
    return this;
  }

  remove(id: string): boolean {
    return this.#definitions.delete(id);
  }

  clear(): void {
    this.#definitions.clear();
  }

  contains(id: string): boolean {
    return this.#definitions.has(id);
  }

  get(id: string): FormulaDefinition | undefined {
    return this.#definitions.get(id);
  }
}

/**
 * Formula registry of the environment (docs/standards/stock/README.md, "Formula registry"), provided by the host
 * application. Formulas use it only through `LOAD_INDICATOR` and `LOAD_PATTERN`. An indicator and a pattern may
 * have the same identifier.
 */
export class FormulaRegistry {
  /** Indicators, executed in an Indicator Context and loaded with `LOAD_INDICATOR`. */
  readonly indicators = new FormulaCollection("Indicator");
  /** Patterns, executed in a Pattern Context and loaded with `LOAD_PATTERN`. */
  readonly patterns = new FormulaCollection("Pattern");
}
