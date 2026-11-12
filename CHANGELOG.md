<div align="center">

<img src="./raw/images/icons/monogram.svg" height="50" alt="FormuLang-TS monogram">

# Changelog

</div>

All notable changes of **FormuLang-TS**. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the library uses [Semantic Versioning](https://semver.org).


## [Unreleased]

First version of the library.

**Supported standards:** `core-0.3`, `stock-0.1` ([`Adisoreq/FormuLang@b3ebb39`](https://github.com/Adisoreq/FormuLang/tree/b3ebb39)).

### Added
- Execution pipeline of the standard: pre-execution, validation, clean-up, tokenization, parsing (Pratt parser), evaluation and finalization, with replaceable stages (`Executor.with*`).
- Core standard `core-0.3`: all functions and procedures, operators, lambdas, objects, serialization variables, the Default Context and the Iteration Context.
- Stock standard `stock-0.1` (`formulang-ts/stock`): `Stock.Candle`, `CANDLE`, `INDICATOR` with an indicator registry, the Stock, Indicator, Pattern and Strategy contexts and `StockExecutor`.
- JavaScript facade: `evaluate`, `createEngine` / `Engine`, conversion between FormuLang and JavaScript values, host functions.
- Interfaces of every module in `formulang-ts/abstractions`.
- Conformance tests ported from FormuLang.NET, samples (calculator CLI, web preview), documentation and CI.
