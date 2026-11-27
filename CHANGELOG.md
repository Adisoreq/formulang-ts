<div align="center">

<img src="./raw/images/icons/monogram.svg" height="50" alt="FormuLang-TS monogram">


# Changelog

</div>

All notable changes of **FormuLang-TS**. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the library uses [Semantic Versioning](https://semver.org).

## [Unreleased]

**Supported standards:** `core-1.2`, `stock-1.2` ([`Adisoreq/FormuLang@5325f1a`](https://github.com/Adisoreq/FormuLang/tree/5325f1a); backward compatible with `core-1.0`, `core-1.1`, `stock-1.0` and `stock-1.1`). FormuLang.NET does not implement `1.2` yet, so the choices that the standard leaves open are listed in [Conformance](docs/conformance.md#implementation-choices) (I25 - I31) to be agreed with it.

### Added
- Formula models ([FormuLang docs/implementation/formula_models.md](https://github.com/Adisoreq/FormuLang/blob/main/docs/implementation/formula_models.md)), so host applications do not repeat the code of indicators, patterns and strategies:
  - Core: `ParameterSpec` (read from the `parameters` of the metadata), `normalizeParameters` (defaults, types, `min` / `max`, `options`, unknown keys; `ParameterProblemCode`), `parametersKey`.
  - Stock: `Definition.fromFormula` with `IndicatorDefinition` (outputs), `PatternDefinition` and `StrategyDefinition` (labels of the checks), `InvalidDefinitionError` with its reason; `definition.normalize` and `definition.instance(given)` (JavaScript or FormuLang values, `ParameterError`), `instanceFromJSON` / `toJSON`; `instance.compute(environment, chart)` gives the `IndicatorSeries` (outputs by key), the `PatternSeries` or the `StrategySignals` (`Signal` with `reason`, `checks` and the other keys); `instance.live(...)` with `start`, `append` (resumed iterations) and `saveState` / `restoreState`; `FormulaRegistry.addDefinition`.
  - Identifiers of the registry may contain `-` (`isFormulaId`), like the `id` of the metadata: `registry.indicators.add("macd-ema200", ...)`, `LOAD_INDICATOR("macd-ema200")`.
  - `IterationContext.saveState` / `restoreState` (`IterationState`), `IndicatorContext.appendCandles(candles, source)`, `metadataTypeWarnings`, `indicatorResultsError`, `patternResultError`, `strategyResultError`; `StockExecutor` accepts prepared formulas.
- `core-1.2` memory of the Iteration and Time Contexts: the procedures `STORE(key, value)` and `CLEAR(key)` / `CLEAR()` and the function `RECALL(key, fallback?)`. The writes are applied after the iteration (`ContextMemory.commit`), only on the selected path of `IF`, `AND` and `OR`, and only if the iteration did not result in an Error. `IContext.memory`, `ContextMemory` (`entries`, `load` for the host application).
- `core-1.2` `HISTORY` constant of the Iteration Context (`IterationContext.history`).
- `core-1.2` short circuit of `AND` / `OR` (and `&&` / `||`): the first `false` / `true` decides the result, and the arguments after it are discarded; `AND(...values)` and `OR(...values)` with more than two arguments.
- `core-1.2` metadata blocks `<@ { ... } @>`: `readMetadata(formula)`, `Executor.readMetadata`, `MetadataResult`; the metadata is a part of the prepared formula.
- `core-1.2` warnings `UNUSED_VALUE`, `CONTINUED_LINE`, `METADATA_TYPE`, `METADATA_CONTEXT` (`IWarning`, `Warning`, `WarningCode`), in `PreparedFormula.warnings` and `ExecutionResult.warnings`, with the line and column of the original formula; checks of extension keys with `Environment.registerMetadataChecker` (`MetadataChecks`). A line that starts with a binary operator is a `SYNTAX_ERROR` with the message of the standard.
- `core-1.2` execution modes: `Executor.prepare` returns a `PreparedFormula` (an `IPreparedFormula`), `Executor.evaluate(prepared, context)` is a hot execution; `executeIterations`, `createFrameRunner` and `executeFrames` accept a prepared formula.
- `core-1.2` resumed iterations: `IterationContext.extend(count)`, `completedIterations`, `lastResult`, `Executor.resumeIterations`; `StockContext.appendCandles`.
- `Context.contextTypeNames` and `Context.finalizeResult`; `Token.line` / `column` (`IToken.line` / `column`); `Cleaner.cleanUpWithPositions`; `Validator.validateEnvironment`; `ProcedureOptions.writesMemoryOnly`.
- `stock-1.2` constants `TIMEFRAME` and `INSTRUMENT`, and `PARAMETERS` in the Strategy Context (`StrategyContext.create(environment, candles, options, parameters)`, `completeParameters`).
- `stock-1.2` signal objects `{ signal, reason?, checks?, ... }` of strategies (`StrategyResult.signalObjects`, `signalObjectProblem`).
- `stock-1.2` other timeframes: `StockContextOptions` (`timeframe`, `instrument`, `timeframeLength`, `timeframes`), `LOAD_CANDLES`, the options overloads of `LOAD_INDICATOR` (`source`, `timeframe`, `output`, `align`) and `LOAD_PATTERN` (`timeframe`, `align`).
- `stock-1.2` series functions `READY`, `CROSSOVER`, `CROSSUNDER`, `HIGHEST`, `LOWEST`, `RISING`, `FALLING`, `BARS_SINCE`, `VALUE_WHEN`, and the strategy function `SCORE`.
- `stock-1.2` metadata: the check of the `stock` key, `FormulaDefinition.fromFormula` and `FormulaRegistry.addFormula` (definitions read from the metadata).

### Changed
- The version of the standards is `core-1.2` and `stock-1.2`; `STANDARDS` is `["core-1.0", "core-1.1", "core-1.2"]` (and `"stock-1.0"`, `"stock-1.1"`, `"stock-1.2"`). `registerStock` requires `core-1.2+`.
- The third argument of `StockContext.create`, `IndicatorContext.create`, `PatternContext.create` and `StrategyContext.create` is an `Executor` or `StockContextOptions`.
- `StockExecutor.executeStrategy` accepts signal objects; the error of another result says "neither a Number nor a signal object".

## [1.1.0] - 2026-11-25

**Supported standards:** `core-1.1`, `stock-1.1` (backward compatible with `core-1.0` and `stock-1.0`). Faster execution of formulas run for every candle or element (Iteration Context); the results of `1.0` formulas are the same.

### Added
- `core-1.1`: delegate calls `$f(x)`, `f(x)` for a lambda parameter, `$o.f(x)`, `$a[0](x)`, `((x) => x)(1)`, translated by the parser into the new function `CALL`; the invocation depth is limited to 256 (`MAX_INVOCATION_DEPTH`), and a too deep invocation (or a stack overflow) is an `OPERATION_ERROR` instead of a thrown `RangeError`.
- `core-1.1` functions: `FIRST`, `LAST`, `IFNULL`, `IFERR`, `ISINT`, `ISEVEN`, `ISODD`, `MEDIAN`, `VAR_P`, `VAR_S`, `STDEV_P`, `STDEV_S`, `MERGE`; the `precision` of `ROUND`, `FLOOR`, `CEIL` and `TRUNC` is optional.
- `stock-1.1` functions: `LAG(series, offset?)` and `WINDOW(series, length, handler?)` (`createLagFunction`, `createWindowFunction`).
- `STANDARDS` lists the earlier compatible versions too (`["core-1.0", "core-1.1"]`, then `"stock-1.0"`, `"stock-1.1"`), so `REQUIRE "core-1.0"` keeps working (`CoreStandard.compatibleIdentifiers`, `StockStandard.compatibleIdentifiers`, `STOCK_COMPATIBLE_IDENTIFIERS`).
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
