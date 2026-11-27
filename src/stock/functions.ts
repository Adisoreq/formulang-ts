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
import { IndicatorContext, PatternContext, StockContext, StockSeries } from "./contexts.js";
import { StockExecutor } from "./executor.js";
import { StockFunctionNames } from "./names.js";
import type { FormulaCollection, FormulaDefinition, FormulaRegistry } from "./registry.js";

const operationError = (message: string): IValue => Value.error(Errors.operationError(message));
const invalidKeyError = (message: string): IValue => Value.error(Errors.invalidKeyError(message));
const argumentError = (message: string): IValue => Value.error(Errors.argumentError(message));
const isError = (value: IValue): boolean => value.type.base === TypeNames.Error;

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
  readonly definition: FormulaDefinition;
  readonly parameters: IValue;
}

const isPrepared = (value: PreparedLoad | IValue): value is PreparedLoad => "definition" in value;

/** The calling Stock Context, or the `OPERATION_ERROR` of a call outside of one. */
function stockContext(functionName: string, context: IContext): StockContext | IValue {
  return context instanceof StockContext
    ? context
    : operationError(`"${functionName}" can be called only in a Stock Context.`);
}

const isStockContext = (value: StockContext | IValue): value is StockContext => value instanceof StockContext;

/**
 * Steps shared by `LOAD_INDICATOR` and `LOAD_PATTERN`: finds the definition and completes the parameters with the
 * default values. Returns the Error if the formula cannot be executed.
 */
function prepareLoad(part: FormulaCollection, id: string, parameters: IObject | undefined): PreparedLoad | IValue {
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
  return { definition, parameters: Value.object(completed, undefined, "PARAMETERS") };
}

/** Whether the formula with the key is already being computed by one of the calling formulas. */
function callsItself(caller: StockContext, key: string): boolean {
  for (let c: IContext | undefined = caller; c instanceof StockContext; c = c.caller) {
    if (c.formulaKey === key) return true;
  }
  return false;
}

// Options of LOAD_INDICATOR, LOAD_PATTERN and LOAD_CANDLES (stock-1.2)

type OptionTypes = Readonly<Record<string, string>>;

/** The options by name, or the `ARGUMENT_ERROR` of an unknown option or an option of a wrong type. */
function readOptions(functionName: string, options: IObject, types: OptionTypes): Map<string, IValue> | IValue {
  const values = new Map<string, IValue>();
  for (const key of options.keys) {
    const type = Object.hasOwn(types, key) ? types[key] : undefined;
    if (type === undefined) return argumentError(`"${functionName}" has no option "${key}".`);
    const value = options.getProperty(key)!.getValue();
    if (value.type.base !== type)
      return argumentError(`The option "${key}" of "${functionName}" must be of type ${type}.`);
    values.set(key, value);
  }
  return values;
}

const isOptions = (value: Map<string, IValue> | IValue): value is Map<string, IValue> => value instanceof Map;

/** The series of another timeframe, or the `NOT_SUPPORTED_ERROR` of a timeframe that the host does not provide. */
function timeframeSeries(caller: StockContext, timeframe: string): StockSeries | IValue {
  return (
    caller.series.otherTimeframe(timeframe) ??
    Value.error(Errors.notSupportedError(`The timeframe "${timeframe}" is not provided by the host application.`))
  );
}

const isSeries = (value: StockSeries | IValue): value is StockSeries => value instanceof StockSeries;

/** Key of a computed series in the store of its series: the timeframe, the kind and the identifier. */
const seriesKey = (series: StockSeries, kind: string, rest: string): string =>
  `${series.timeframe ?? ""}|${kind}|${rest}`;

/**
 * The series of another timeframe seen from the current candle of the caller
 * (docs/standards/stock/README.md, "Aligned and native series"): aligned, `N` elements, the element of the last
 * candle closed at every candle (`null` before the first one); or native, the elements of the candles closed at the
 * current candle. The aligned series is computed once and stored.
 */
function fromTimeframe(caller: StockContext, target: StockSeries, native: IValue, align: boolean, key: string): IValue {
  if (target === caller.series && align) return native;
  const elements = native.raw as readonly IValue[];
  const alignment = caller.series.alignment(target);
  if (!align) return Value.array(elements.slice(0, alignment[caller.iteration]! + 1));
  const alignedKey = `aligned|${target.timeframe ?? ""}|${key}`;
  const stored = caller.series.getStored(alignedKey);
  if (stored !== undefined) return stored;
  const aligned = Value.array(Array.from(alignment, (j) => (j < 0 ? Value.null() : elements[j]!)));
  caller.series.store(alignedKey, aligned);
  return aligned;
}

// LOAD_INDICATOR

/** Options of the overload 4 of `LOAD_INDICATOR`. */
interface IndicatorOptions {
  readonly source: IValue | undefined;
  readonly timeframe: string | undefined;
  readonly output: string | undefined;
  readonly align: boolean;
}

/**
 * `LOAD_INDICATOR(id, parameters?, source?)` and `LOAD_INDICATOR(id, parameters, options)`
 * (docs/standards/stock/functions/LOAD_INDICATOR.md): computes an indicator of the registry for every candle (of the
 * main chart or of another timeframe) in a child Indicator Context. Computed series are stored by timeframe,
 * identifier, completed parameters and source; `output` and `align` only take a part of a stored series.
 */
export class LoadIndicatorFunction extends FlFunction {
  constructor(readonly registry: FormulaRegistry) {
    const id = ArgumentTemplate.of("id", Types.Text);
    const parameters = ArgumentTemplate.of("parameters", Types.Object);
    const source = ArgumentTemplate.of("source", Types.Array);
    const options = ArgumentTemplate.of("options", Types.Object);
    const name = StockFunctionNames.loadIndicator;
    const load = (
      context: IContext,
      indicator: string,
      given: IObject | undefined,
      chosen: IndicatorOptions,
    ): IValue => {
      const caller = stockContext(name, context);
      if (!isStockContext(caller)) return caller;
      return computeIndicator(registry, caller, indicator, given, chosen);
    };
    const plain = (sourceValue: IValue | undefined): IndicatorOptions => ({
      source: sourceValue,
      timeframe: undefined,
      output: undefined,
      align: true,
    });
    super(
      name,
      [
        new FunctionOverload([id], (a, c) => load(c, a[0]!.raw as string, undefined, plain(undefined))),
        new FunctionOverload([id, parameters], (a, c) =>
          load(c, a[0]!.raw as string, a[1]!.raw as IObject, plain(undefined)),
        ),
        new FunctionOverload([id, parameters, source], (a, c) =>
          load(c, a[0]!.raw as string, a[1]!.raw as IObject, plain(a[2])),
        ),
        // stock-1.2: options instead of the source
        new FunctionOverload([id, parameters, options], (a, c) => {
          const caller = stockContext(name, c);
          if (!isStockContext(caller)) return caller;
          const read = readOptions(name, a[2]!.raw as IObject, {
            source: TypeNames.Array,
            timeframe: TypeNames.Text,
            output: TypeNames.Text,
            align: TypeNames.Boolean,
          });
          if (!isOptions(read)) return read;
          return computeIndicator(registry, caller, a[0]!.raw as string, a[1]!.raw as IObject, {
            source: read.get("source"),
            timeframe: read.get("timeframe")?.raw as string | undefined,
            output: read.get("output")?.raw as string | undefined,
            align: read.get("align")?.raw !== false,
          });
        }),
        // Computing a series changes nothing for the caller; the stored series are only reused
      ],
      FunctionType.Function,
      { sideEffectFree: true },
    );
  }
}

function computeIndicator(
  registry: FormulaRegistry,
  caller: StockContext,
  id: string,
  parameters: IObject | undefined,
  options: IndicatorOptions,
): IValue {
  // 1. The candles: of the main chart, or of another timeframe
  let target = caller.series;
  if (options.timeframe !== undefined) {
    const series = timeframeSeries(caller, options.timeframe);
    if (!isSeries(series)) return series;
    target = series;
  }
  // 2. Definition and parameters
  const prepared = prepareLoad(registry.indicators, id, parameters);
  if (!isPrepared(prepared)) return prepared;
  // 3. Source
  const sourceValue = options.source ?? target.close;
  const elements = sourceValue.raw as readonly IValue[];
  if (elements.length !== target.count) {
    const of = target === caller.series ? "" : ` of the timeframe "${target.timeframe}"`;
    return operationError(`The source has ${elements.length} elements, but there are ${target.count} candles${of}.`);
  }
  if (!target.isValidSource(elements)) {
    return operationError("Every element of the source must be a Number or null.");
  }
  const key = seriesKey(target, "indicator", `${id}|${serialize(prepared.parameters)}|${target.sourceKey(elements)}`);
  // 4-7. The native series of the whole timeframe, then a part of it
  let native = indicatorSeries(caller, target, prepared, sourceValue, key);
  if (isError(native)) return native;
  let outputKey = key;
  if (options.output !== undefined) {
    native = indicatorOutput(target, key, native, options.output);
    if (isError(native)) return native;
    outputKey = `${key}|output=${options.output}`;
  }
  return options.timeframe === undefined ? native : fromTimeframe(caller, target, native, options.align, outputKey);
}

/** The stored series of the indicator, or the series computed in a child Indicator Context. */
function indicatorSeries(
  caller: StockContext,
  target: StockSeries,
  prepared: PreparedLoad,
  source: IValue,
  key: string,
): IValue {
  // An indicator that calls itself, directly or indirectly
  if (callsItself(caller, key)) return operationError(`Indicator "${prepared.definition.id}" calls itself.`);
  const stored = target.getStored(key);
  if (stored !== undefined) return stored;
  const child = new IndicatorContext(caller.environment, target, prepared.parameters, source, key, caller);
  child.fixedNow = caller.now;
  child.preExecute();
  const result = new StockExecutor(target.executor).executeIndicator(prepared.definition.formula, child);
  target.store(key, result);
  return result;
}

/**
 * The series of one output of an indicator: `e[output]` for every Object result `e` (`null` stays `null`), or the
 * series unchanged for the output `value` of Number results. A result without the output is an `INVALID_KEY_ERROR`.
 */
function indicatorOutput(target: StockSeries, key: string, series: IValue, output: string): IValue {
  const outputKey = `${key}|output=${output}`;
  const stored = target.getStored(outputKey);
  if (stored !== undefined) return stored;
  const elements: IValue[] = [];
  for (const element of series.raw as readonly IValue[]) {
    switch (element.type.base) {
      case TypeNames.Null:
        elements.push(element);
        break;
      case TypeNames.Object: {
        const property = (element.raw as IObject).getProperty(output);
        if (property === undefined) return invalidKeyError(`A result of the indicator has no key "${output}".`);
        elements.push(property.getValue());
        break;
      }
      default:
        if (output !== "value") {
          return invalidKeyError(
            `The results of the indicator are Numbers: the only output is "value", not "${output}".`,
          );
        }
        elements.push(element);
    }
  }
  const result = Value.array(elements);
  target.store(outputKey, result);
  return result;
}

// LOAD_PATTERN

/**
 * `LOAD_PATTERN(id, parameters?, options?)` (docs/standards/stock/functions/LOAD_PATTERN.md): checks a pattern of the
 * registry for every candle (of the main chart or of another timeframe) in a child Pattern Context. Returns an Array
 * of Booleans; computed series are stored by timeframe, identifier and completed parameters.
 */
export class LoadPatternFunction extends FlFunction {
  constructor(readonly registry: FormulaRegistry) {
    const id = ArgumentTemplate.of("id", Types.Text);
    const parameters = ArgumentTemplate.of("parameters", Types.Object);
    const options = ArgumentTemplate.of("options", Types.Object);
    const name = StockFunctionNames.loadPattern;
    const load = (
      context: IContext,
      pattern: string,
      given: IObject | undefined,
      chosen: IObject | undefined,
    ): IValue => {
      const caller = stockContext(name, context);
      if (!isStockContext(caller)) return caller;
      let timeframe: string | undefined;
      let align = true;
      if (chosen !== undefined) {
        const read = readOptions(name, chosen, { timeframe: TypeNames.Text, align: TypeNames.Boolean });
        if (!isOptions(read)) return read;
        timeframe = read.get("timeframe")?.raw as string | undefined;
        align = read.get("align")?.raw !== false;
      }
      return computePattern(registry, caller, pattern, given, timeframe, align);
    };
    super(
      name,
      [
        new FunctionOverload([id], (a, c) => load(c, a[0]!.raw as string, undefined, undefined)),
        new FunctionOverload([id, parameters], (a, c) => load(c, a[0]!.raw as string, a[1]!.raw as IObject, undefined)),
        new FunctionOverload([id, parameters, options], (a, c) =>
          load(c, a[0]!.raw as string, a[1]!.raw as IObject, a[2]!.raw as IObject),
        ),
      ],
      FunctionType.Function,
      { sideEffectFree: true },
    );
  }
}

function computePattern(
  registry: FormulaRegistry,
  caller: StockContext,
  id: string,
  parameters: IObject | undefined,
  timeframe: string | undefined,
  align: boolean,
): IValue {
  let target = caller.series;
  if (timeframe !== undefined) {
    const series = timeframeSeries(caller, timeframe);
    if (!isSeries(series)) return series;
    target = series;
  }
  // 1-2. Definition and parameters
  const prepared = prepareLoad(registry.patterns, id, parameters);
  if (!isPrepared(prepared)) return prepared;
  const key = seriesKey(target, "pattern", `${id}|${serialize(prepared.parameters)}`);
  // 3. A pattern that calls itself, directly or indirectly
  if (callsItself(caller, key)) return operationError(`Pattern "${id}" calls itself.`);
  let result = target.getStored(key);
  if (result === undefined) {
    // 4-6. Child Pattern Context with its own iterations
    const child = new PatternContext(caller.environment, target, prepared.parameters, key, caller);
    child.fixedNow = caller.now;
    child.preExecute();
    result = new StockExecutor(target.executor).executePatternSeries(prepared.definition.formula, child);
    target.store(key, result);
  }
  if (isError(result) || timeframe === undefined) return result;
  return fromTimeframe(caller, target, result, align, key);
}

// LOAD_CANDLES (stock-1.2)

/** `LOAD_CANDLES(timeframe, options?)`: docs/standards/stock/functions/LOAD_CANDLES.md */
export function createLoadCandlesFunction(): FlFunction {
  const name = StockFunctionNames.loadCandles;
  const load = (context: IContext, timeframe: string, options: IObject | undefined): IValue => {
    const caller = stockContext(name, context);
    if (!isStockContext(caller)) return caller;
    let align = true;
    if (options !== undefined) {
      const read = readOptions(name, options, { align: TypeNames.Boolean });
      if (!isOptions(read)) return read;
      align = read.get("align")?.raw !== false;
    }
    const target = timeframeSeries(caller, timeframe);
    if (!isSeries(target)) return target;
    return fromTimeframe(caller, target, target.candlesValue, align, "candles");
  };
  const timeframe = ArgumentTemplate.of("timeframe", Types.Text);
  return new FlFunction(
    name,
    [
      new FunctionOverload([timeframe], (a, c) => load(c, a[0]!.raw as string, undefined)),
      new FunctionOverload([timeframe, ArgumentTemplate.of("options", Types.Object)], (a, c) =>
        load(c, a[0]!.raw as string, a[1]!.raw as IObject),
      ),
    ],
    FunctionType.Function,
    { sideEffectFree: true },
  );
}

// stock-1.1: LAG and WINDOW

/** Position of the current candle (independent of `@array_indexing`), or an Error. */
export function currentPosition(name: string, series: readonly IValue[], context: IContext): number | IValue {
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
