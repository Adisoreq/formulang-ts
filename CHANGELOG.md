<div align="center">

<img src="./raw/images/icons/monogram.svg" height="50" alt="FormuLang-TS monogram">

# Changelog

</div>

All notable changes of **FormuLang-TS**. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the library uses [Semantic Versioning](https://semver.org).

## [Unreleased]

Faster execution of formulas run for every candle or element (Iteration Context); the results are the same.

### Added
- `FunctionOptions.sideEffectFree` (`new FlFunction(name, overloads, type, { sideEffectFree })`, `hostFunction(name, implementation, { sideEffectFree })`): a function that only computes its result. All Core and Stock functions are side-effect free; functions of the host application are not, unless they set it.

### Changed
- The evaluator skips the branch of `IF` that is not selected when every function of the sequence (or of the value of an assignment, e.g. `$x = IF(...)`) is side-effect free and the condition is a **Boolean**. The selected value and the errors are the same as with both branches computed; a function with side effects, a procedure or a delegate from a variable keeps the computation of both branches. An indicator such as RSI or EMA with a first value computed by `IF(ISNULL(PREV), ...)` runs about 3-6 times faster.
- The expression of a Number created by `Value.number(value)` is formatted when it is first read, not when the value is created.
- `IterationContext.beginIteration` runs the pre-execution once instead of twice, keeps the copies of the environment variables that the formula did not change, and reuses the `PREV` constant.
- `LOAD_INDICATOR` checks the elements of a source once for every array (never for `CLOSE`) instead of in every call, and compares the elements of a source as numbers instead of serializing them to text, to find a series that is already computed.

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
