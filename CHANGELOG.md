<div align="center">

<img src="./raw/images/icons/monogram.svg" height="50" alt="FormuLang-TS monogram">

# Changelog

</div>

All notable changes of **FormuLang-TS**. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the library uses [Semantic Versioning](https://semver.org).


## [1.0.0] - 2026-11-23

First release of the library.

**Supported standards:** `core-1.0`, `stock-1.0` ([`Adisoreq/FormuLang@c40e08a`](https://github.com/Adisoreq/FormuLang/tree/c40e08a)); same results as FormuLang.NET 1.0.0.

### Added
- Execution pipeline of the standard: pre-execution, validation, clean-up, tokenization, parsing (Pratt parser), evaluation and finalization, with replaceable stages (`Executor.with*`).
- Core standard `core-1.0`: all functions and procedures (including `FORMAT` and the time functions), operators, lambdas, objects, scoped comments `<# ... #>`, Unicode texts (characters are code points), serialization variables, `NOW` and `time_offset`, the Default, Iteration and Time Contexts (`Executor.createFrameRunner`, `executeFrames`).
- Stock standard `stock-1.0` (`formulang-ts/stock`): `Stock.Candle`, `CANDLE`, `IS_BULLISH`, `IS_BEARISH`, `LOAD_INDICATOR` and `LOAD_PATTERN` with the formula registry (`FormulaRegistry`), the Stock, Indicator, Pattern and Strategy contexts and `StockExecutor`.
- JavaScript facade: `evaluate`, `createEngine` / `Engine`, conversion between FormuLang and JavaScript values, host functions.
- Interfaces of every module in `formulang-ts/abstractions`.
- Conformance tests ported from FormuLang.NET and the JSON conformance tests of the standard (`scripts/sync-conformance.mjs`), samples (calculator CLI, web preview), documentation, CI and the npm release workflow.
