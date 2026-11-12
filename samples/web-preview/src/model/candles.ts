import type { ChartCandle } from "./types";

/** Deterministic pseudo-random numbers (mulberry32), so a seed always gives the same chart. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2025, 0, 1);
const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Mock daily candles: a random walk with trend regimes (up, down, sideways) of random length and volatility,
 * so the chart has crossovers, breakouts and candle patterns.
 */
export function generateCandles(count: number, seed: number): ChartCandle[] {
  const next = random(seed);
  const gaussian = (): number => {
    const u = Math.max(next(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  const candles: ChartCandle[] = [];
  let close = 80 + next() * 60;
  let drift = 0;
  let volatility = 0.015;
  let regime = 0;
  for (let i = 0; i < count; i++) {
    if (regime-- <= 0) {
      regime = 12 + Math.floor(next() * 30);
      drift = (next() - 0.5) * 0.012;
      volatility = 0.008 + next() * 0.022;
    }
    const open = round(close * (1 + gaussian() * volatility * 0.25));
    close = round(Math.max(1, open * (1 + drift + gaussian() * volatility)));
    const high = round(Math.max(open, close) * (1 + Math.abs(gaussian()) * volatility * 0.6));
    const low = round(Math.min(open, close) * (1 - Math.abs(gaussian()) * volatility * 0.6));
    const volume = Math.round(1000 + next() * 4000 + (Math.abs(close - open) / open) * 200000);
    candles.push({
      time: START + i * DAY,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
      volume,
    });
  }
  return candles;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}
