# Web preview

Sample of [FormuLang-TS](../../README.md): an editor that executes formulas of the Core and Stock standards in the browser, in every context type. It is a separate project ([Solid](https://www.solidjs.com), [Vite](https://vite.dev), [lightweight-charts](https://github.com/tradingview/lightweight-charts)) that uses the built package, like an application installed from npm.

[![Open preview](https://img.shields.io/badge/%E2%96%B6%20Open%20preview-write%20formulas%20in%20the%20browser-2fbf71?style=for-the-badge&labelColor=17804a)](https://adisoreq.github.io/formulang-ts/)

The [Pages workflow](../../.github/workflows/pages.yml) builds the library and this sample and publishes it on GitHub Pages after every push to `main`.

## Running

The sample depends on the library in the root of the repository (`"formulang-ts": "file:../.."`), so build the library first. After a change of the library, build it again (or keep `npx tsup --watch` running in the root).

```bash
cd ../.. && npm ci && npm run build
```

```bash
npm install
```

```bash
npm run dev
```

`npm run build` type-checks the sample and builds a static site in `dist/`. Serve it with any HTTP server, e.g. `npm run preview`; opening `dist/index.html` from the disk (`file://`) does not work, because browsers block module scripts there.

## Features

- **Context types**: the panel on the left has an expandable list for every standard (Core 1.0, Stock 1.0); its items are the context types. Every context type has its own examples, and a _New formula_ to write from scratch (for the Stock contexts with a default configuration: the empty indicator is `LOAD_INDICATOR("CUSTOM")`, the empty pattern `LOAD_PATTERN("CUSTOM")`, the empty strategy is inactive until it is turned on).
- **Editor**: syntax highlighting, and a list of the keywords that contain the word being typed – functions (with their overloads), procedures, constants of the environment and of the context type, environment variables, the variables of the formula and the literals. <kbd>↑</kbd> <kbd>↓</kbd> choose, <kbd>Enter</kbd> or <kbd>Tab</kbd> insert, <kbd>Esc</kbd> closes.
- **Default Context**: the result in a console, the parsed and translated sequences, and the variables of the execution (changed environment variables are highlighted).
- **Iteration Context**: a slider over the iterations (`I`, `N`), the result of the chosen iteration and the list of all of them.
- **Time Context**: the frames are played as time passes (_Play_ / _Pause_, _Step_, _Reset_, frames per second). The output shows the constants of the last frame (`FRAME`, `TIME_S`, `DTIME_MS`), its result, a plot of the Numbers returned by the last 240 frames and the list of the last frames. `DTIME_S` is the measured time between two frames, and `NOW` is read again for every frame. The frames stop at the first Error.
- **Default Context examples** of Core 1.0: `FORMAT`, the time functions (`NOW`, `DATE`, `FORMAT_TIME`, `@time_offset`), scoped comments `<# … #>` and Unicode texts.
- **Stock contexts**: a candlestick chart of mock candles; _Generate candles_ creates new ones (with a new seed) and reloads the chart.
  - **Stock Context**: the slider marks the current candle `I` on the chart.
  - **Pattern Context**: a rectangle around every detected pattern. A pattern has a name and a description, a registry id (`LOAD_PATTERN("ENGULFING")`), parameters (id, name, default value), a type (bullish, bearish) and a number of candles, edited below the formula; its color (green, red), label and the parameter values of the chart are set below the chart.
  - **Indicator Context**: the series of the indicator on the chart. An indicator has a name and a description, a registry id (`LOAD_INDICATOR("SMA")`), parameters (id, name, default value), series (id, name and description, line color, fill color, fill mode: line, area, baseline or histogram), a series mode (single: a Number per candle, or multiple: an Object with a Number per series) and a type (normal: over the candles, on their price scale; oscillator: in a separate pane below the candles, with its own price scale – e.g. MACD, RSI). Below the formula you edit the definition (add, remove and change parameters and series); below the chart, the style of every series and the parameter values of the chart. The registry uses the default values, so other formulas get `LOAD_INDICATOR(id)` with them. An indicator with an invalid definition shows its problems and is left out of the registry.
  - **Strategy Context**: an arrow up (buy) or down (sell) for every signal of the active strategies. A strategy has a name and a description, a confidence (default 1.0) and a lifetime (whole number of candles), edited below the formula as the defaults of its definition. Below the chart every strategy can be turned on and off, and gets its marker label and the confidence and lifetime used by the proposal. The value of a strategy is its result (from -1 to 1) × its confidence, active for its lifetime; the final proposal is the sum of the values of all active strategies, shown below the chart and for the last candle. Changing these values does not execute the formulas again.

Every indicator and pattern of the preview is in the formula registry of the environment with its current formula and the default values of its parameters, so the strategies (and other formulas) can use them with `LOAD_INDICATOR("SMA")` and `LOAD_PATTERN("ENGULFING")`.

## Files

| File                                           | Content                                                                                                     |
| :--------------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| [src/model/examples.ts](src/model/examples.ts) | Standards, context types and their examples: the configurations of the patterns, indicators and strategies. The formula of every example is loaded from its file. |
| [data/formulas](data/formulas) | Formulas of the examples: `<context type>/<example id>.fl` (for example `indicator/sma.fl`). A new example needs its entry in `examples.ts` and its file. |
| [src/model/engine.ts](src/model/engine.ts)     | Execution of the formulas with FormuLang-TS in every context type.                                          |
| [src/model/language.ts](src/model/language.ts) | Syntax highlighting and suggestions of the editor.                                                          |
| [src/model/candles.ts](src/model/candles.ts)   | Mock candles: a seeded random walk with trend regimes.                                                      |
| [src/chart](src/chart)                         | The chart (lightweight-charts) and the primitive that draws the pattern rectangles.                         |
| [src/components](src/components)               | Sidebar, editor, configuration panel and outputs.                                                           |
