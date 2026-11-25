import type { IFunction, ILambda } from "../abstractions/functions.js";
import type { IObject, IValue } from "../abstractions/primitives.js";
import { FunctionType } from "../abstractions/primitives.js";
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
import { IndicatorContext, PatternContext, StockContext } from "./contexts.js";
import { StockExecutor } from "./executor.js";
import { StockFunctionNames } from "./names.js";
import type { FormulaCollection, FormulaDefinition, FormulaRegistry } from "./registry.js";

const operationError = (message: string): IValue => Value.error(Errors.operationError(message));
const invalidKeyError = (message: string): IValue => Value.error(Errors.invalidKeyError(message));

/** `CANDLE(object)`: docs/standards/stock/functions/CANDLE.md */
export function createCandleFunction(): FlFunction {
  return new FlFunction(
    StockFunctionNames.candle,
    [
      new FunctionOverload([ArgumentTemplate.of("object", Types.Object)], (a) => {
        const candle = candleFromObject(a[0]!.raw as IObject);
        return candle !== undefined
          ? candleToValue(candle)
          : operationError(`Object does not meet the requirements to be <${CANDLE_TYPE}>.`);
      }),
    ],
    FunctionType.Function,
    { sideEffectFree: true },
  );
}

function direction(name: string, check: (open: number, close: number) => boolean): FlFunction {
  return new FlFunction(
    name,
    [
      new FunctionOverload([ArgumentTemplate.of("candle", Types.of(TypeNames.Object, CANDLE_TYPE))], (a) => {
        const candle = a[0]!.raw as IObject;
        const open = candle.getProperty("open")!.getValue().raw as number;
        const close = candle.getProperty("close")!.getValue().raw as number;
        return Value.boolean(check(open, close));
      }),
    ],
    FunctionType.Function,
    { sideEffectFree: true },
  );
}

/** `IS_BULLISH(candle)`: `close > open` (docs/standards/stock/functions/IS_BULLISH.md). */
export function createIsBullishFunction(): FlFunction {
  return direction(StockFunctionNames.isBullish, (open, close) => close > open);
}

/** `IS_BEARISH(candle)`: `close < open` (docs/standards/stock/functions/IS_BEARISH.md). */
export function createIsBearishFunction(): FlFunction {
  return direction(StockFunctionNames.isBearish, (open, close) => close < open);
}

/** A definition with its completed parameters, ready to be executed by a child context. */
interface PreparedLoad {
  readonly caller: StockContext;
  readonly definition: FormulaDefinition;
  readonly parameters: IValue;
}

/**
 * Steps shared by `LOAD_INDICATOR` and `LOAD_PATTERN`: finds the definition and completes the parameters with the
 * default values. Returns the Error if the formula cannot be executed.
 */
function prepareLoad(
  functionName: string,
  part: FormulaCollection,
  id: string,
  parameters: IObject | undefined,
  context: IContext,
): PreparedLoad | IValue {
  if (!(context instanceof StockContext)) {
    return operationError(`"${functionName}" can be called only in a Stock Context.`);
  }
  // 1. Definition
  const definition = part.get(id);
  if (definition === undefined) return invalidKeyError(`${part.kind} "${id}" is not defined.`);
  // 2. Parameters, completed with the default values
  for (const name of parameters?.keys ?? []) {
    if (definition.getParameter(name) === undefined) {
      return invalidKeyError(`${part.kind} "${id}" has no parameter "${name}".`);
    }
  }
  const completed = new FlObject();
  for (const parameter of definition.parameters) {
    const given = parameters?.getProperty(parameter.name)?.getValue();
    completed.initConstant(parameter.name, given ?? parameter.defaultValue);
  }
  return { caller: context, definition, parameters: Value.object(completed, undefined, "PARAMETERS") };
}

const isPrepared = (value: PreparedLoad | IValue): value is PreparedLoad => "definition" in value;

/** Whether the formula with the key is already being computed by one of the calling formulas. */
function callsItself(caller: StockContext, key: string): boolean {
  for (let c: IContext | undefined = caller; c instanceof StockContext; c = c.caller) {
    if (c.formulaKey === key) return true;
  }
  return false;
}

/**
 * `LOAD_INDICATOR(id, parameters?, source?)` (docs/standards/stock/functions/LOAD_INDICATOR.md): computes an
 * indicator of the registry for every candle in a child Indicator Context. Computed series are cached by
 * identifier, completed parameters and source.
 */
export class LoadIndicatorFunction extends FlFunction {
  constructor(readonly registry: FormulaRegistry) {
    const id = ArgumentTemplate.of("id", Types.Text);
    const parameters = ArgumentTemplate.of("parameters", Types.Object);
    const source = ArgumentTemplate.of("source", Types.Array);
    super(
      StockFunctionNames.loadIndicator,
      [
        new FunctionOverload([id], (a, c) => computeIndicator(registry, a[0]!.raw as string, undefined, undefined, c)),
        new FunctionOverload([id, parameters], (a, c) =>
          computeIndicator(registry, a[0]!.raw as string, a[1]!.raw as IObject, undefined, c),
        ),
        new FunctionOverload([id, parameters, source], (a, c) =>
          computeIndicator(registry, a[0]!.raw as string, a[1]!.raw as IObject, a[2], c),
        ),
        // Computing a series changes nothing for the caller; the stored series are only reused
      ],
      FunctionType.Function,
      { sideEffectFree: true },
    );
  }
}

function computeIndicator(
  registry: FormulaRegistry,
  id: string,
  parameters: IObject | undefined,
  source: IValue | undefined,
  context: IContext,
): IValue {
  // 1-2. Definition and parameters
  const prepared = prepareLoad(StockFunctionNames.loadIndicator, registry.indicators, id, parameters, context);
  if (!isPrepared(prepared)) return prepared;
  const { caller, definition } = prepared;
  const series = caller.series;
  // 3. Source
  const sourceValue = source ?? series.close;
  const elements = sourceValue.raw as readonly IValue[];
  if (elements.length !== series.count) {
    return operationError(`The source has ${elements.length} elements, but there are ${series.count} candles.`);
  }
  if (!series.isValidSource(elements)) {
    return operationError("Every element of the source must be a Number or null.");
  }
  const key = `indicator|${id}|${serialize(prepared.parameters)}|${series.sourceKey(elements)}`;
  // 4. An indicator that calls itself, directly or indirectly
  if (callsItself(caller, key)) return operationError(`Indicator "${id}" calls itself.`);
  const stored = series.getStored(key);
  if (stored !== undefined) return stored;
  // 5-7. Child Indicator Context with its own iterations
  const child = new IndicatorContext(caller.environment, series, prepared.parameters, sourceValue, key, caller);
  child.fixedNow = caller.now;
  child.preExecute();
  const result = new StockExecutor(series.executor).executeIndicator(definition.formula, child);
  series.store(key, result);
  return result;
}

/**
 * `LOAD_PATTERN(id, parameters?)` (docs/standards/stock/functions/LOAD_PATTERN.md): checks a pattern of the
 * registry for every candle in a child Pattern Context. Returns an Array of `N` Booleans; computed series are cached
 * by identifier and completed parameters.
 */
export class LoadPatternFunction extends FlFunction {
  constructor(readonly registry: FormulaRegistry) {
    const id = ArgumentTemplate.of("id", Types.Text);
    const parameters = ArgumentTemplate.of("parameters", Types.Object);
    super(
      StockFunctionNames.loadPattern,
      [
        new FunctionOverload([id], (a, c) => computePattern(registry, a[0]!.raw as string, undefined, c)),
        new FunctionOverload([id, parameters], (a, c) =>
          computePattern(registry, a[0]!.raw as string, a[1]!.raw as IObject, c),
        ),
      ],
      FunctionType.Function,
      { sideEffectFree: true },
    );
  }
}

function computePattern(
  registry: FormulaRegistry,
  id: string,
  parameters: IObject | undefined,
  context: IContext,
): IValue {
  // 1-2. Definition and parameters
  const prepared = prepareLoad(StockFunctionNames.loadPattern, registry.patterns, id, parameters, context);
  if (!isPrepared(prepared)) return prepared;
  const { caller, definition } = prepared;
  const series = caller.series;
  const key = `pattern|${id}|${serialize(prepared.parameters)}`;
  // 3. A pattern that calls itself, directly or indirectly
  if (callsItself(caller, key)) return operationError(`Pattern "${id}" calls itself.`);
  const stored = series.getStored(key);
  if (stored !== undefined) return stored;
  // 4-6. Child Pattern Context with its own iterations
  const child = new PatternContext(caller.environment, series, prepared.parameters, key, caller);
  child.fixedNow = caller.now;
  child.preExecute();
  const result = new StockExecutor(series.executor).executePatternSeries(definition.formula, child);
  series.store(key, result);
  return result;
}

// stock-1.1

/** Position of the current candle (independent of `@array_indexing`), or an Error. */
function currentPosition(name: string, series: readonly IValue[], context: IContext): number | IValue {
  if (!(context instanceof StockContext)) return operationError(`"${name}" can be called only in a Stock Context.`);
  if (series.length !== context.count) {
    return operationError(`The series has ${series.length} elements, but there are ${context.count} candles.`);
  }
  return context.iteration;
}

function computeLag(series: readonly IValue[], offset: number, context: IContext): IValue {
  const position = currentPosition(StockFunctionNames.lag, series, context);
  if (typeof position !== "number") return position;
  if (!Number.isInteger(offset) || offset < 0) {
    return operationError("The offset must be a whole number of 0 or more (a future value cannot be read).");
  }
  return position - offset < 0 ? Value.null() : series[position - offset]!;
}

function computeWindow(
  series: readonly IValue[],
  length: number,
  handler: IFunction | undefined,
  context: IContext,
): IValue {
  const position = currentPosition(StockFunctionNames.window, series, context);
  if (typeof position !== "number") return position;
  if (!Number.isInteger(length) || length < 1) {
    return operationError("The length of a window must be a whole number of 1 or more.");
  }
  if (position + 1 < length) return Value.null();
  const window = Value.array(series.slice(position - length + 1, position + 1));
  if (handler === undefined) return window;
  if (handler.functionType === FunctionType.Lambda && (handler as ILambda).parameters.length !== 1) {
    return Value.error(
      Errors.argumentError(`The lambda passed to "${StockFunctionNames.window}" must have exactly 1 parameter.`),
    );
  }
  return handler.invoke([window], context);
}

/** `LAG(series, offset?)`: docs/standards/stock/functions/LAG.md */
export function createLagFunction(): FlFunction {
  const series = ArgumentTemplate.of("series", Types.Array);
  return new FlFunction(
    StockFunctionNames.lag,
    [
      new FunctionOverload([series], (a, c) => computeLag(a[0]!.raw as readonly IValue[], 1, c)),
      new FunctionOverload([series, ArgumentTemplate.of("offset", Types.Number)], (a, c) =>
        computeLag(a[0]!.raw as readonly IValue[], a[1]!.raw as number, c),
      ),
    ],
    FunctionType.Function,
    { sideEffectFree: true },
  );
}

/** `WINDOW(series, length, handler?)`: docs/standards/stock/functions/WINDOW.md */
export function createWindowFunction(): FlFunction {
  const series = ArgumentTemplate.of("series", Types.Array);
  const length = ArgumentTemplate.of("length", Types.Number);
  return new FlFunction(
    StockFunctionNames.window,
    [
      new FunctionOverload([series, length], (a, c) =>
        computeWindow(a[0]!.raw as readonly IValue[], a[1]!.raw as number, undefined, c),
      ),
      new FunctionOverload([series, length, ArgumentTemplate.of("handler", Types.Delegate)], (a, c) =>
        computeWindow(a[0]!.raw as readonly IValue[], a[1]!.raw as number, a[2]!.raw as IFunction, c),
      ),
    ],
    FunctionType.Function,
    { sideEffectFree: true },
  );
}
