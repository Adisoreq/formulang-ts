/**
 * Instances of the formula models (FormuLang docs/implementation/formula_models.md, "Instance"): a definition with
 * its normalized parameter values, which can be run over a chart.
 *
 * @module
 */
import type { IObject, IValue } from "../../abstractions/primitives.js";
import type { IEnvironment } from "../../abstractions/structures.js";
import { FlObject, TypeNames, Value, parametersKey } from "../../core/index.js";
import type {
  Definition,
  IndicatorDefinition,
  InstanceJson,
  PatternDefinition,
  StrategyDefinition,
} from "./definitions.js";
import {
  type Chart,
  type IndicatorSeries,
  LiveIndicatorRun,
  LivePatternRun,
  LiveStrategyRun,
  type PatternSeries,
  type StrategySignals,
} from "./runs.js";

/**
 * An instance: a definition with its normalized parameter values. The host application keeps its own settings
 * (e.g. colors, markets, exits) next to it.
 */
export abstract class Instance<TDefinition extends Definition = Definition> {
  /** The identifier of the definition, `|` and the parameter key, e.g. `RSI|{ period: 14 }`. */
  readonly key: string;

  /** @internal */
  constructor(
    readonly definition: TDefinition,
    /** The normalized `PARAMETERS` Object. */
    readonly parameters: IObject,
  ) {
    this.key = `${definition.id}|${parametersKey(parameters)}`;
  }

  /** The parameters as a `PARAMETERS` value. */
  get parametersValue(): IValue {
    return Value.object(copy(this.parameters), undefined, "PARAMETERS");
  }

  /** The serialized form `{ id, parameters }`, with the parameters as JSON values. */
  toJSON(): InstanceJson {
    const parameters: Record<string, unknown> = {};
    for (const key of this.parameters.keys) parameters[key] = jsonOf(this.parameters.getProperty(key)!.getValue());
    return { id: this.definition.id, parameters };
  }
}

/** An instance of an indicator. */
export class IndicatorInstance extends Instance<IndicatorDefinition> {
  /** Runs the indicator over the chart: one value of every output for every candle. */
  compute(environment: IEnvironment, chart: Chart): IndicatorSeries {
    return this.live(environment, chart).start();
  }

  /** A live run over the chart; call `start`, then `append` for the candles that close later. */
  live(environment: IEnvironment, chart: Chart): LiveIndicatorRun {
    return new LiveIndicatorRun(
      {
        formula: this.definition.formula,
        parameters: this.parameters,
        outputs: this.definition.outputs?.map((output) => output.key),
      },
      environment,
      chart,
    );
  }
}

/** An instance of a candle pattern. */
export class PatternInstance extends Instance<PatternDefinition> {
  /** Checks the pattern at every candle of the chart. */
  compute(environment: IEnvironment, chart: Chart): PatternSeries {
    return this.live(environment, chart).start();
  }

  live(environment: IEnvironment, chart: Chart): LivePatternRun {
    return new LivePatternRun({ formula: this.definition.formula, parameters: this.parameters }, environment, chart);
  }
}

/** An instance of a strategy. */
export class StrategyInstance extends Instance<StrategyDefinition> {
  /** Runs the strategy over the chart: its signals. */
  compute(environment: IEnvironment, chart: Chart): StrategySignals {
    return this.live(environment, chart).start();
  }

  live(environment: IEnvironment, chart: Chart): LiveStrategyRun {
    return new LiveStrategyRun({ formula: this.definition.formula, parameters: this.parameters }, environment, chart);
  }
}

function copy(object: IObject): FlObject {
  const result = new FlObject();
  for (const key of object.keys) result.initVariable(key, object.getProperty(key)!.getValue());
  return result;
}

function jsonOf(value: IValue): unknown {
  switch (value.type.base) {
    case TypeNames.Array:
      return (value.raw as readonly IValue[]).map(jsonOf);
    case TypeNames.Object: {
      const object = value.raw as IObject;
      const result: Record<string, unknown> = {};
      for (const key of object.keys) result[key] = jsonOf(object.getProperty(key)!.getValue());
      return result;
    }
    case TypeNames.Null:
      return null;
    default:
      return value.raw;
  }
}
