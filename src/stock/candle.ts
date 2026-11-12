import type { IObject, IValue } from "../abstractions/primitives.js";
import { FlObject, TypeNames, Value } from "../core/index.js";

/** Name of the extended type of a candle. */
export const CANDLE_TYPE = "Stock.Candle";

/** Attributes of a candle, in their order (docs/standards/stock/types/Candle.md). */
export const CANDLE_ATTRIBUTES = ["open", "high", "low", "close", "volume", "time"] as const;

/** A candle of a price chart, provided by the host application. */
export interface Candle {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  /** Traded volume; `null` or omitted if unknown. */
  readonly volume?: number | null;
  /** Unix time in milliseconds (UTC), or a `Date`; `null` or omitted if unknown. */
  readonly time?: number | Date | null;
}

function optional(value: number | Date | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  return value instanceof Date ? value.getTime() : value;
}

/**
 * Whether the candle meets the requirements of `Stock.Candle`: finite prices, `high` is the highest and `low`
 * the lowest price, the volume is not negative.
 */
export function isValidCandle(candle: Candle): boolean {
  const { open, high, low, close } = candle;
  const volume = optional(candle.volume);
  const time = optional(candle.time);
  return (
    [open, high, low, close].every(Number.isFinite) &&
    high >= open &&
    high >= close &&
    high >= low &&
    low <= open &&
    low <= close &&
    (volume === null || (Number.isFinite(volume) && volume >= 0)) &&
    (time === null || Number.isFinite(time))
  );
}

const number = (value: number): IValue => Value.number(value);
const numberOrNull = (value: number | null): IValue => (value === null ? Value.null() : number(value));

/** The candle as an `Object<Stock.Candle>` with all six attributes. */
export function candleToValue(candle: Candle): IValue {
  const object = new FlObject();
  object.initVariable("open", number(candle.open));
  object.initVariable("high", number(candle.high));
  object.initVariable("low", number(candle.low));
  object.initVariable("close", number(candle.close));
  object.initVariable("volume", numberOrNull(optional(candle.volume)));
  object.initVariable("time", numberOrNull(optional(candle.time)));
  return Value.object(object, CANDLE_TYPE);
}

/**
 * The candle described by an object (algorithm of `CANDLE`, docs/standards/stock/functions/CANDLE.md), or
 * `undefined` if the object does not meet the requirements.
 */
export function candleFromObject(object: IObject): Candle | undefined {
  if (object.keys.some((key) => !(CANDLE_ATTRIBUTES as readonly string[]).includes(key))) return undefined;
  const read = (key: string, required: boolean): number | null | undefined => {
    const property = object.getProperty(key);
    if (property === undefined) return required ? undefined : null;
    const value = property.getValue();
    if (value.type.base === TypeNames.Number && typeof value.raw === "number") return value.raw;
    return !required && value.type.base === TypeNames.Null ? null : undefined;
  };
  const [open, high, low, close] = [read("open", true), read("high", true), read("low", true), read("close", true)];
  const [volume, time] = [read("volume", false), read("time", false)];
  if (
    typeof open !== "number" ||
    typeof high !== "number" ||
    typeof low !== "number" ||
    typeof close !== "number" ||
    volume === undefined ||
    time === undefined
  ) {
    return undefined;
  }
  const candle: Candle = { open, high, low, close, volume, time };
  return isValidCandle(candle) ? candle : undefined;
}
