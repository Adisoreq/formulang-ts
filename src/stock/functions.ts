import type { IObject, IValue } from "../abstractions/primitives.js";
import type { IContext } from "../abstractions/structures.js";
import {
  ArgumentTemplate,
  Errors,
  FlFunction,
  FlObject,
  FunctionOverload,
  Types,
  TypeNames,
  Value,
  serialize,
} from "../core/index.js";
import { CANDLE_TYPE, candleFromObject, candleToValue } from "./candle.js";
import { INDICATOR_FUNCTION, IndicatorContext, StockContext } from "./contexts.js";
import { StockExecutor } from "./executor.js";
import type { IndicatorRegistry } from "./indicators.js";

const operationError = (message: string): IValue => Value.error(Errors.operationError(message));
const invalidKeyError = (message: string): IValue => Value.error(Errors.invalidKeyError(message));

/** `CANDLE(object)`: docs/standards/stock/functions/CANDLE.md */
export function createCandleFunction(): FlFunction {
  return new FlFunction("CANDLE", [
    new FunctionOverload([ArgumentTemplate.of("object", Types.Object)], (a) => {
      const candle = candleFromObject(a[0]!.raw as IObject);
      return candle !== undefined
        ? candleToValue(candle)
        : operationError(`Object does not meet the requirements to be <${CANDLE_TYPE}>.`);
    }),
  ]);
}

/**
 * `INDICATOR(id, parameters?, source?)` (docs/standards/stock/functions/INDICATOR.md): computes an indicator of the
 * registry for every candle in a child Indicator Context. Computed series are cached by identifier, completed
 * parameters and source.
 */
export class IndicatorFunction extends FlFunction {
  constructor(readonly registry: IndicatorRegistry) {
    const id = ArgumentTemplate.of("id", Types.Text);
    const parameters = ArgumentTemplate.of("parameters", Types.Object);
    const source = ArgumentTemplate.of("source", Types.Array);
    super(INDICATOR_FUNCTION, [
      new FunctionOverload([id], (a, c) => compute(registry, a[0]!.raw as string, undefined, undefined, c)),
      new FunctionOverload([id, parameters], (a, c) =>
        compute(registry, a[0]!.raw as string, a[1]!.raw as IObject, undefined, c),
      ),
      new FunctionOverload([id, parameters, source], (a, c) =>
        compute(registry, a[0]!.raw as string, a[1]!.raw as IObject, a[2], c),
      ),
    ]);
  }
}

function compute(
  registry: IndicatorRegistry,
  id: string,
  parameters: IObject | undefined,
  source: IValue | undefined,
  context: IContext,
): IValue {
  if (!(context instanceof StockContext)) {
    return operationError(`"${INDICATOR_FUNCTION}" can be called only in a Stock Context.`);
  }
  const caller = context;
  const series = caller.series;
  // 1. Definition
  const definition = registry.get(id);
  if (definition === undefined) return invalidKeyError(`Indicator "${id}" is not defined.`);
  // 2. Parameters, completed with the default values
  for (const name of parameters?.keys ?? []) {
    if (definition.getParameter(name) === undefined) {
      return invalidKeyError(`Indicator "${id}" has no parameter "${name}".`);
    }
  }
  const completed = new FlObject();
  for (const parameter of definition.parameters) {
    const given = parameters?.getProperty(parameter.name)?.getValue();
    completed.initConstant(parameter.name, given ?? parameter.defaultValue);
  }
  const parametersValue = Value.object(completed, undefined, "PARAMETERS");
  // 3. Source
  const sourceValue = source ?? series.close;
  const elements = sourceValue.raw as readonly IValue[];
  if (elements.length !== series.count) {
    return operationError(`The source has ${elements.length} elements, but there are ${series.count} candles.`);
  }
  if (elements.some((e) => e.type.base !== TypeNames.Number && e.type.base !== TypeNames.Null)) {
    return operationError("Every element of the source must be a Number or null.");
  }
  const key = `${id}|${serialize(parametersValue)}|${series.sourceKey(elements)}`;
  // 4. An indicator that calls itself, directly or indirectly
  for (let c: IContext | undefined = caller; c instanceof IndicatorContext; c = c.caller) {
    if (c.indicatorKey === key) return operationError(`Indicator "${id}" calls itself.`);
  }
  const stored = series.getIndicator(key);
  if (stored !== undefined) return stored;
  // 5-7. Child Indicator Context with its own iterations
  const child = new IndicatorContext(caller.environment, series, parametersValue, sourceValue, key, caller);
  child.preExecute();
  const result = new StockExecutor(series.executor).executeIndicator(definition.formula, child);
  series.storeIndicator(key, result);
  return result;
}
