import type { IValue } from "../abstractions/primitives.js";
import { IdentifierValidator, TypeNames, Value } from "../core/index.js";

/** Parameter of an indicator with its default value. */
export class IndicatorParameter {
  readonly defaultValue: IValue;

  constructor(
    readonly name: string,
    defaultValue: IValue | number,
  ) {
    this.defaultValue = typeof defaultValue === "number" ? Value.number(defaultValue) : defaultValue;
    Object.freeze(this);
  }
}

/** Definition of an indicator in the indicator registry (docs/standards/stock/README.md, "Indicator registry"). */
export class IndicatorDefinition {
  readonly parameters: readonly IndicatorParameter[];

  /**
   * @param id Identifier of the indicator, e.g. `SMA`.
   * @param formula Formula executed in an Indicator Context.
   * @param parameters Parameters with their default values.
   * @throws {TypeError} for an invalid identifier, an invalid parameter name or default value, or a parameter
   * defined more than once.
   */
  constructor(
    readonly id: string,
    readonly formula: string,
    parameters: readonly IndicatorParameter[] = [],
  ) {
    if (!IdentifierValidator.validate(id)) throw new TypeError(`"${id}" is not a valid identifier.`);
    for (const parameter of parameters) {
      if (!IdentifierValidator.validate(parameter.name)) {
        throw new TypeError(`"${parameter.name}" is not a valid parameter name.`);
      }
      const base = parameter.defaultValue.type.base;
      if (base === TypeNames.Error || base === TypeNames.Undefined) {
        throw new TypeError(`Parameter "${parameter.name}" has no valid default value.`);
      }
    }
    if (new Set(parameters.map((p) => p.name)).size !== parameters.length) {
      throw new TypeError("A parameter is defined more than once.");
    }
    this.parameters = Object.freeze([...parameters]);
  }

  getParameter(name: string): IndicatorParameter | undefined {
    return this.parameters.find((parameter) => parameter.name === name);
  }
}

/** Indicators of the host application, by identifier. */
export class IndicatorRegistry {
  readonly #definitions = new Map<string, IndicatorDefinition>();

  get definitions(): readonly IndicatorDefinition[] {
    return [...this.#definitions.values()];
  }

  /**
   * Adds an indicator: a definition, or an identifier, a formula and default parameter values
   * (`registry.add("SMA", formula, { period: 14 })`).
   *
   * @throws {Error} if an indicator with the identifier is already registered.
   */
  add(definition: IndicatorDefinition): this;
  add(
    id: string,
    formula: string,
    parameters?: Readonly<Record<string, IValue | number>> | readonly IndicatorParameter[],
  ): this;
  add(
    definition: IndicatorDefinition | string,
    formula?: string,
    parameters: Readonly<Record<string, IValue | number>> | readonly IndicatorParameter[] = [],
  ): this {
    const indicator =
      typeof definition === "string"
        ? new IndicatorDefinition(
            definition,
            formula ?? "",
            Array.isArray(parameters)
              ? (parameters as readonly IndicatorParameter[])
              : Object.entries(parameters).map(([name, value]) => new IndicatorParameter(name, value)),
          )
        : definition;
    if (this.#definitions.has(indicator.id)) throw new Error(`Indicator "${indicator.id}" is already registered.`);
    this.#definitions.set(indicator.id, indicator);
    return this;
  }

  remove(id: string): boolean {
    return this.#definitions.delete(id);
  }

  contains(id: string): boolean {
    return this.#definitions.has(id);
  }

  get(id: string): IndicatorDefinition | undefined {
    return this.#definitions.get(id);
  }
}
