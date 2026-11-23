# Conformance

Status of the implementation against the FormuLang standard.

| | |
| :-- | :-- |
| **Target standards** | Core `core-1.0`, Stock `stock-1.0` |
| **Standard revision checked** | [`Adisoreq/FormuLang@c40e08a`](https://github.com/Adisoreq/FormuLang/tree/c40e08a) (2026-11-23) |
| **Reference implementation** | FormuLang.NET 1.0.0, [`Adisoreq/formulang-dotnet@7e85d55`](https://github.com/Adisoreq/formulang-dotnet/tree/7e85d55) |
| **Last review** | 2026-11-23 |
| **Conformance tests** | [tests/conformance/spec](../tests/conformance/spec) (the JSON test cases of the standard: 138 of 139 pass, see [D3](#known-deviations)) and the tests ported from FormuLang.NET in [tests/conformance](../tests/conformance) |

Update the revisions and this document every time the library is synced with a newer revision of the standard (see [Development](development.md)).

Legend: ✅ conforms · 🟡 partial / deviates · ❌ not implemented

## Pipeline

| Stage | Status | Notes |
| :---- | :----: | :---- |
| [Pre-execution](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/pre-execution.md) | ✅ | `Context.create` / `preExecute` copy only the missing environment variables, and set `NOW` once (from `Environment.clock`, or the `NOW` constant pinned with `Environment.setNow`). |
| [Validation](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/semantics/validation.md) | ✅ | Environment checks (including `NOW` and `time_offset`) and the formula scan with the **Scoped comment** mode and Unicode text characters, with the error messages of the standard. Columns count code points. |
| [Clean-up](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/cleanup.md) | ✅ | Scoped comments `<# ... #>` become one space, or one new line if they contain a line break. |
| [Tokenization](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/tokenization.md) | ✅ | Unicode characters are accepted only in the Text mode. |
| [Parsing](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/semantics/parsing.md) | ✅ | See [Implementation choices](#implementation-choices) I8. |
| [Evaluation](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/evaluation.md) | ✅ | |
| [Finalization](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/finalization.md) | ✅ | `ExecutionResult`. |
| [Post-execution](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/post-execution.md) | ✅ | Handled by the host: a disposable context is dropped, a persistent one is passed to the next execution. |

## Core standard

| Area | Status | Notes |
| :--- | :----: | :---- |
| [Errors](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/errors/README.md) | ✅ | All 13 errors with the standard codes and names. |
| [Types](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/types/README.md) | ✅ | |
| [Serialization](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/semantics/serialization.md) | ✅ | `SerializationOptions`: `decimal_place`, `split_array`, `split_object`, `include_object_class`, `max_array_preview`, read from the environment variables of the execution (`TEXT`, `JOIN`, `ExecutionResult.toString()`). |
| [Environment](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/README.md#environment-structure) | ✅ | `core-1.0`, constants `STANDARDS`, `E`, `PI`, `PHI`, `NOW`, `NULL`, `TRUE`, `FALSE`, variables `array_indexing`, `suppress_errors`, `time_offset` and the serialization variables. |
| [Context types](https://github.com/Adisoreq/FormuLang/blob/main/docs/core/context.md#context-types) | ✅ | `Context` (Default Context), `IterationContext` (`I`, `N`, `PREV`; run with `Executor.executeIterations`) and `TimeContext` (`TIME_S`, `TIME_MS`, `DTIME_S`, `DTIME_MS`, `FRAME`, `PREV`; run with `Executor.createFrameRunner` or `executeFrames`). `I` and `FRAME` are computed when they are read (`ComputedConstant`). `NOW` is the same in all iterations and is set again for every frame. |
| [Text](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/types/Text.md#characters) | ✅ | A character is one Unicode code point (`LEN`, `SUBSTR`, `FIND`, `REVERSE`, `SPLIT(text, "")`); `SORT` compares code points; `UPPERCASE` / `LOWERCASE` are invariant (I21). Texts are not normalized. |
| [Comments](https://github.com/Adisoreq/FormuLang/blob/main/docs/syntax/operators.md#1-formula-and-line-structure) | ✅ | Line comments `#` and scoped comments `<# ... #>`. |
| [Inheritance](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/inheritance.md) of extended types | ✅ | |
| [Argument templates](https://github.com/Adisoreq/FormuLang/blob/main/docs/implementation/argument_template.md) and overloads | ✅ | Including element types (`Array<Number>`) and the error propagation rules. |
| [Procedures](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/procedures/README.md) | ✅ | `SET`, `INIT`, `COND_SET`, `REQUIRE`, also without parentheses. |
| [Functions](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/functions/README.md) | ✅ | All 93 functions (and `OBJECT`, I8), including `FORMAT` and the time functions (`YEAR`, `MONTH`, `DAY`, `WEEKDAY`, `HOUR`, `MINUTE`, `SECOND`, `MILLISECOND`, `DATE`, `FORMAT_TIME`; years `1` - `9999`), tested with the examples of their documents. |
| Lambda functions | ✅ | |
| [Operators](https://github.com/Adisoreq/FormuLang/blob/main/docs/syntax/operators.md) | ✅ | |

## Stock standard

| Area | Status | Notes |
| :--- | :----: | :---- |
| [Context types](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/stock/README.md#context-structure) | ✅ | `StockContext`, `IndicatorContext`, `PatternContext` (with `PARAMETERS`), `StrategyContext`, derived from `IterationContext`. Expected results are checked by `StockExecutor.executeIndicator`, `executePattern`, `executePatternSeries` and `executeStrategy` (strategy signals are clamped). |
| [Formula registry](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/stock/README.md#2-formula-registry) | ✅ | `FormulaRegistry` with the parts `indicators` and `patterns` (identifiers unique within a part), held by the `LOAD_INDICATOR` and `LOAD_PATTERN` functions of the environment (`registerStock`, `getFormulaRegistry`). |
| [`Stock.Candle`](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/stock/types/Candle.md) | ✅ | `Candle` interface; invalid candles of the host are rejected with `RangeError`. The time of a candle can be a `Date`. |
| [Functions](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/stock/functions/README.md) | ✅ | `CANDLE`, `IS_BULLISH`, `IS_BEARISH`, `LOAD_INDICATOR`, `LOAD_PATTERN`. Both loaders store every computed series (key: identifier, completed parameters and, for indicators, the source), as allowed by their *Performance* sections. A child context uses the `NOW` of its caller. |
| [Examples](https://github.com/Adisoreq/FormuLang/tree/main/docs/standards/stock/examples) | ✅ | SMA, EMA, MACD, bullish engulfing, moving average crossover, MACD signal strength, pattern confirmed by a trend. |

## Verification against the reference implementation

- The test cases of FormuLang.NET 1.0.0 (740 data cases of its Core and Stock test projects, and their facts) are ported to [tests/conformance](../tests/conformance). The data tables in [tests/conformance/data](../tests/conformance/data) are generated from its test sources ([scripts/dotnet-cases](../scripts/dotnet-cases)).
- The language-independent conformance tests of the standard are copied to [tests/conformance/spec](../tests/conformance/spec) by `scripts/sync-conformance.mjs` and run by [spec-runner.ts](../tests/conformance/spec-runner.ts), a port of the `ConformanceRunner` of FormuLang.NET.
- 492 formulas (every Core formula of those tables, the examples of the samples and additional edge cases of numbers, serialization and errors) were executed with the CalculatorCLI of FormuLang.NET and with FormuLang-TS, and for Core 1.0 another 75 formulas of Unicode texts, scoped comments, `FORMAT`, the time functions, `time_offset` and the Stock functions. The outputs, including the messages of the errors, are identical, except for one bug of FormuLang.NET 1.0.0 (below).
- **FormuLang.NET 1.0.0 crashes** for a point in time 1 ms after the end of the year 9999 (`YEAR(253402300800000)`): its range check computes the ticks in floating point, so the value passes the check and `DateTime.AddTicks` throws `ArgumentOutOfRangeException`. FormuLang-TS returns the `OPERATION_ERROR` of the standard ("The point in time is outside of the supported range (years 1 - 9999)."), which is what FormuLang.NET returns for every later point in time.

## Known deviations

Remove an item when it is fixed and covered by a test.

| # | Deviation | Standard |
| :-: | :-------- | :------- |
| D2 | The primitive map holds the classified expressions; the values computed during evaluation are kept per node of the current queue instead of being written into the map. The order of evaluation and the results are the same. | [evaluation.md § Result propagation](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/evaluation.md#4-result-propagation) |

| D3 | Conformance case `core.syntax.unicode.011` expects one error for `$zółw = 1`, but step 3.3 of the validation algorithm appends a `SYNTAX_ERROR` for every invalid symbol, so the library reports two (`ó` at column 3 and `ł` at column 4), like FormuLang.NET. The library follows the algorithm; the case is listed in the known deviations of [spec.test.ts](../tests/conformance/spec.test.ts) until the standard is clarified. | [validation.md § Validation algorithm](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/semantics/validation.md), [tests/core/syntax/text_unicode.json](https://github.com/Adisoreq/FormuLang/blob/main/tests/core/syntax/text_unicode.json) |

(The numbering follows FormuLang.NET; D1 was fixed there before this library was created.)

## Implementation choices

Places where the standard leaves room for interpretation, and what the library does. I1–I16 are the choices of FormuLang.NET, which this library follows so that both implementations give the same results. Each is a candidate for clarification in the standard.

| # | Topic | Choice |
| :-: | :---- | :----- |
| I1 | A character that can begin a 2-character operator (`=`, `:`, `<`, `!`, ...) is also listed as a single-character operator, so step 2.2.6.1 of the tokenization algorithm would close it before the 2-character form is seen. | The tokenizer keeps the token open while it can still become a 2-character operator. |
| I2 | An operator token whose spelling is not in the operator table (`&`, `\|`, `?`, `~`, `'`, `` ` ``, `\` outside text). | `SYNTAX_ERROR` during tokenization, because a token must have a supported spelling ([token.md](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/token.md)). |
| I3 | A number token that is not a valid literal (`1_`, `1e`, `0x`). | `SYNTAX_ERROR` when the token is closed. |
| I4 | Changing a constant: the Core standard defines `ENVIRONMENT_ERROR` for environment constants ([SET](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/procedures/SET.md)), but no error for other constants. | `ENVIRONMENT_ERROR` for every constant. |
| I5 | `TRUE`, `FALSE` and `NULL` are described as environment constants in [literals.md](https://github.com/Adisoreq/FormuLang/blob/main/docs/syntax/literals.md), but are missing from the Core environment table. | They are defined in `Environment.create()`. |
| I6 | Serialization of numbers with `decimal_place = -1`: the standard does not define a precision or a notation. | Shortest round-trip notation without exponent notation; numbers that would need an exponent (≥ 10^17 or < 10^-4) are written with 15 significant digits, like FormuLang.NET. |
| I7 | Clean-up of an empty or white-space-only formula. | `OPERATION_ERROR`. |
| I8 | `{ k: v }` is translated to `OBJECT("k",v)` ([Core parsing](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/semantics/parsing.md#operator-translation)), but `OBJECT` is not in the Core functions index. | `OBJECT(...entries? <Any>)` is a Core function taking key-value pairs. |
| I9 | An identifier without a sigil that names a function (`MAP($a, ABS)`, `TEXT(AVG)`). | It is a Delegate of that function. Constants are checked first. |
| I10 | The README of the standard calls a lambda stored in a variable as `$square(5)`, but Core parsing gives `(` an infix role only after an identifier. | Not supported (syntax error), following Core parsing. A lambda is invoked by the function it is passed to. |
| I11 | `NUMBER(text)`: the standard does not say whether a sign is allowed (`NUMBER("-5")`). | A leading `+` or `-` is accepted, and white space around the number. |
| I12 | Lambda body scope: the standard does not say whether a body can read context variables. | It can (`MAP($arr, (e) => e - AVG($arr))` from the [common formulas](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/examples/common_formulas.md) needs it), and it can read the parameters of enclosing lambdas. |
| I13 | Choice of the context type. | The host application chooses and creates the context ([pre-execution](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/pre-execution.md), step 1); a formula cannot select it. A context type is a class derived from `Context` that loads its constants in `loadContextData()`. `ContextType` is the context *kind*: disposable or persistent. |
| I14 | `PREV` after an iteration that resulted in an Error, when the host continues ([context.md](https://github.com/Adisoreq/FormuLang/blob/main/docs/core/context.md#2-iteration-context)). | `null`. `executeIterations(..., stopOnError = false)` continues; the default stops at the first Error. |
| I15 | A formula of an Iteration Context that does not parse. | It fails once: `executeIterations` returns a single failed result. |
| I16 | Characters of a text (`LEN`, `SUBSTR`, `FIND`, `REVERSE`). | Defined by Core 1.0: Unicode code points, the same as `SPLIT(text, "")`. A lone surrogate is one character. |
| I17 | Chained assignment `$a = $b = 1` parses as `$a = ($b = 1)` ([operator-parsing.md](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/operator-parsing.md)), but `SET` returns the `SUCCESS` Error and a procedure is not executed when an argument is an Error. | `$b` is set; `$a` is not, and the sequence results in `SUCCESS`. See proposal P4. |
| I18 | Order of evaluation: the parsing queue is level by level, deepest first ([parsing.md](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/parsing.md)), not post-order. | Strict level order, as in the standard: after `$x = 1`, `[($x = 5), NEG(NEG($x)), $x]` gives `[[SUCCESS (0)] ..., 1, 5]`, because the read of `$x` at level 4 happens before `SET` at level 2. |
| I19 | Number of parameters of a lambda passed to a function: `MAP.md` allows `(e, i)`, but the example of `ARGUMENT_ERROR.md` says `MAP([1, 2], (a, b) => a)` is an `ARGUMENT_ERROR`. | The function checks the count before the first call: `MAP` 1 or 2, `REDUCE` 2 or 3, `FILTER`, `ANY`, `ALL`, `SORT`, `MAX`, `MIN` and `SEQ` exactly 1. A named function passed as a Delegate is not checked. |
| I20 | Texts inside arrays and objects: serialization writes Text raw, but the examples of `TEXT` quote nested texts. | Nested texts are written as literals, quoted and with `\\`, `\"`, `\n`, `\t` escaped. |
| I21 | Case mapping of `UPPERCASE` / `LOWERCASE` (formulas are ASCII, but texts from the host are not). | Each UTF-16 code unit is mapped on its own, like the invariant culture of .NET: `ß` stays `ß`. |
| I22 | Rounding of `ROUND`, `CEIL`, `FLOOR`, `TRUNC` and of `decimal_place` for numbers that have no exact binary representation (`ROUND(1.005, 2)`). | The decimal representation with 15 significant digits is rounded (like `System.Decimal`), midpoints away from zero: `ROUND(1.005, 2)` is `1.01`. Numbers out of the decimal range (about 7.9 × 10^28) are rounded in binary floating point. |
| I23 | `NOW` is an environment constant set in the pre-execution, but an environment can be shared by many executions. | The value is stored as a constant of the context (`Context.now`), which shadows the constant of the environment, so concurrent executions do not change the environment. |
| I24 | A placeholder selector of `FORMAT` that is a whole number with a sign (`{-1}`). | It is an index (and results in `INVALID_INDEX_ERROR` unless `@array_indexing` allows it). |

## Proposals for the standard

Changes that would fit better than the current standard. They are **not implemented**: the library follows the standard (and FormuLang.NET) until the standard changes.

| # | Proposal | Reason |
| :-: | :------- | :----- |
| P1 | Short-circuit evaluation of `IF`, `&&` and `\|\|` (and `AND`, `OR`). | Today every argument is computed: an Error in the branch that is not selected is discarded, but its side effects (assignments, expensive `INDICATOR` calls) happen, which surprises users (`IF(true, $a = 1, $b = 2)` sets both). |
| P2 | A direct call of a Delegate: `$square(5)`, `((x) => x * 2)(3)` (I10). | The README of the standard already uses it; postfix `(` is listed in the binding power table (priority 10). |
| P3 | `OBJECT(...entries)` in the Core functions index (I8). | The object literal is translated into it, so every implementation has to define it anyway. |
| P4 | Chained assignment (I17): `SET`, `INIT` and `COND_SET` return the assigned value, or `SUCCESS` does not stop the next procedure. | `$a = $b = 1` parses, but does not do what it says. |
| P5 | Number literals `1_000.5`, `.5e3` and `1.e5`. | They match none of the patterns of [literals.md](https://github.com/Adisoreq/FormuLang/blob/main/docs/syntax/literals.md), so they are syntax errors, probably unintentionally. |
| P6 | Define the number model (I6, I22): precision, notation of serialization and rounding mode. | Implementations on different platforms can give different results today. |

## Inconsistencies found in the standard

Found while writing the conformance tests (most of them also by FormuLang.NET). The tests follow the algorithms, not these examples.

| Document | Problem |
| :------- | :------ |
| [number_examples.md](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/examples/number_examples.md), example 4 | The formula uses `$c = 2.5e+2` (250), but the table and the result `-21` use `2.5e-1` (0.25). |
| [array_examples.md](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/examples/array_examples.md), [text_examples.md](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/examples/text_examples.md) | Results are written as `[ [ 1, 2, 3 ], [ a, b, c ] ]`; [serialization](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/semantics/serialization.md) gives `[[1, 2, 3], ["a", "b", "c"]]`. |
| [context_examples.md](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/examples/context_examples.md), example 6 | The result is written as `TYPE_ERROR: ...` instead of `[TYPE_ERROR (4)] ...`. |
| [environment_examples.md](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/examples/environment_examples.md), example 4 | `REQUIRE "math-1.x"` fails in a Core environment, so the shown result `12.5663706144` is never reached. |
| [README.md](https://github.com/Adisoreq/FormuLang/blob/main/README.md) of the standard | `$squared = $square(5)` (see I10). |
| [ARGUMENT_ERROR.md](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/errors/ARGUMENT_ERROR.md) | `MAP([1, 2], (a, b) => a)` is shown as an error, but `MAP.md` allows a lambda with an index parameter (see I19). |
| [Error.md](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/types/Error.md), [values.md](https://github.com/Adisoreq/FormuLang/blob/main/docs/core/values.md) | Error is described as passed by value in one document and by reference in the other. The library treats it as a complex type (by reference). |
| [syntax](https://github.com/Adisoreq/FormuLang/tree/main/docs/syntax) | Examples use `LERP`, `RAND` and `STDEV_P`, which are not defined by any standard. |
| [tests/README.md](https://github.com/Adisoreq/FormuLang/blob/main/tests/README.md) | The npm package is called `formulang`; it is published as `formulang-ts`. |
