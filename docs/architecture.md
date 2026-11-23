# Architecture

## Modules

```
formulang-ts/abstractions  ◄──  formulang-ts (core)  ◄──  formulang-ts/stock
      (interfaces)              (Core standard,           (extension standards)
                                 pipeline, facade)
```

FormuLang-TS is one npm package with three entry points (subpath exports). Each entry point is built as an ES module and as CommonJS, with shared chunks, so the classes of the core are the same objects in every entry point (`instanceof` works across them).

| Entry point | Sources | Depends on | Responsibility |
| :---------- | :------ | :--------- | :------------- |
| `formulang-ts/abstractions` | `src/abstractions` | - | Contracts shared by every module (interfaces and `as const` enumerations only). A host application or an extension can depend only on them. |
| `formulang-ts` | `src/core`, `src/facade` | abstractions | Implementation of the [Core standard](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/README.md) and of the execution pipeline (`src/core`), and the JavaScript facade (`src/facade`). |
| `formulang-ts/stock` | `src/stock` | abstractions, core | Implementation of the [Stock standard](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/stock/README.md). |

The direction of the dependencies is checked by ESLint (`no-restricted-imports` in [eslint.config.js](../eslint.config.js)): abstractions import nothing, the core imports neither extensions nor the facade, and the facade does not import extensions. Every extension standard gets its own `src/<name>` folder and entry point, so a host bundles only the standards it uses (the package has `"sideEffects": false`).

## Folders

| Folder | Content |
| :----- | :------ |
| `src/abstractions` | `primitives.ts` (`IValue`, `IType`, `IContainer`, `IObject`, `IError`), `functions.ts` (`IFunction`, `IProcedure`, `ILambda`, `IFunctionOverload`, `IArgumentTemplate`), `operators.ts`, `processing.ts` (stage interfaces, results, tokens, expression nodes), `structures.ts` (`IEnvironment`, `IContext`, `IStandard`, `IAbstractTree`) |
| `src/core/primitives` | `Value` (factories), `Types`, `Container` / `Variable` / `Constant` / `ComputedConstant`, `FlObject`, `FlError`, `VariableReference` |
| `src/core/functions` | `FlFunction`, `Procedure`, `FunctionOverload`, `ArgumentTemplate` and argument matching |
| `src/core/processing` | `Validator`, `Cleaner`, `Tokenizer`, `Parser`, expression nodes, `Evaluator` and `Lambda`, `Executor`, stage results |
| `src/core/structures` | `Environment`, `Context`, `IterationContext`, `Standard`, `StandardVersion`, `AbstractTree` |
| `src/core/standards` | `CoreStandard`, the Core functions by category (`functions/`), the procedures, helpers of function definitions |
| `src/core/serialization` | `serialize`, `SerializationOptions` |
| `src/core/validation` | `IdentifierValidator`, `NumberValidator` |
| `src/core/utils` | character classes, number formatting and decimal rounding |
| `src/core/errors.ts`, `operators.ts` | `Errors` (factory of the Core errors), the operator table |
| `src/facade` | `evaluate`, `Engine`, conversion between FormuLang and JavaScript values |
| `src/stock` | `Candle`, `StockStandard` and `registerStock`, the Stock context types, `FormulaRegistry`, `CANDLE`, `IS_BULLISH`, `IS_BEARISH`, `LOAD_INDICATOR` and `LOAD_PATTERN`, `StockExecutor` |

Names that would hide a JavaScript global get the prefix `Fl`: `FlError`, `FlObject`, `FlFunction`. Interfaces keep the `I` prefix of FormuLang.NET (`IValue`), so an interface and its implementation (`Value`) can be imported together.

## Execution pipeline

The standard calls the whole process **execution**; **evaluation** is only its fifth stage. `Executor` runs the stages in order.

| # | Stage | Interface | Core implementation | Output |
| :-: | :---- | :-------- | :------------------ | :----- |
| | [Pre-execution](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/pre-execution.md) | `IContext.preExecute` | `Context.create`, `Context.preExecute` | context with copies of the environment variables |
| 1 | [Validation](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/validation.md) | `IValidator` | `Validator` | every error found, at once |
| 2 | [Clean-up](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/cleanup.md) | `ICleaner` | `Cleaner` | cleaned text |
| 3 | [Tokenization](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/tokenization.md) | `ITokenizer` | `Tokenizer` | tokens |
| 4 | [Parsing](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/parsing.md) | `IParser` | `Parser` | one tree and parsing queue per sequence, primitive map |
| 5 | [Evaluation](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/evaluation.md) | `IEvaluator` | `Evaluator` | value of the last sequence, or the aborting Error |
| 6 | [Finalization](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/finalization.md) | - | `Executor` | `ExecutionResult` |

The pipeline stops at the first stage that fails. Validation is the only stage that reports every problem it finds.

### Parsing

`Parser` is a Pratt parser that follows [Core Parsing](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/semantics/parsing.md). Operators are translated while the tree is built, so the tree contains only these nodes (discriminated by `kind`, see `IExpressionNode` in the abstractions):

| Node | Kind | Example key |
| :--- | :--- | :---------- |
| `LiteralNode` | Value | `4`, `"text"`, `true` |
| `VariableNode` | Variable | `$a`, `@array_indexing` |
| `ConstantNode` | Constant | `PI`, `ABS` (a function used as a Delegate) |
| `ParameterNode` | Parameter | `e` inside a lambda body |
| `CallNode` | FunctionCall | `ADD(POW($a,2),POW($b,2))` |
| `LambdaNode` | Lambda | `(e)=>MUL(e,2)`; its body is a separate `Sequence` |

The key of a node is its canonical form, used as the key of the primitive map. The parser needs the procedures of the environment (to parse `SET $x 100` without parentheses), so `Parser.forEnvironment(environment)` creates it; the `Executor` keeps one parser per environment while its functions do not change.

### Evaluation

`Evaluator` traverses the parsing queue of every sequence bottom-up (highest level first). It works only with the interfaces of the abstractions (`IParsingResult`, `IExpressionNode`), so it can evaluate the result of any `IParser`. The values are kept per node of the current queue. A call is resolved by name in the environment (`IEnvironment.getFunction`); the first argument of `SET`, `INIT` and `COND_SET` (`IProcedure.takesVariable`) is passed as a `VariableReference` instead of being read.

A lambda expression evaluates to a `Lambda` delegate that captures the scope it was created in, so its body can read context variables and the parameters of enclosing lambdas. Functions receive the `IContext` of the execution, because the environment variables a formula changes (e.g. `@array_indexing = 1`) exist only in the context.

### Numbers

Numbers are JavaScript `number`s (IEEE 754 binary64), like `double` in FormuLang.NET. Where JavaScript differs from .NET, the library reproduces the results of the reference implementation ([number-format.ts](../src/core/utils/number-format.ts)):

- numbers are serialized without exponent notation: the shortest round-trip notation, or 15 significant digits for numbers that would need an exponent (≥ 10^17 or < 10^-4);
- `ROUND`, `CEIL`, `FLOOR`, `TRUNC` and `@decimal_place` round the decimal representation of the number with 15 significant digits (like `System.Decimal`), so `ROUND(1.005, 2)` is `1.01`, and midpoints are rounded away from zero;
- `-0` never appears in a result.

### Context types

The host application chooses the context a formula runs in (pre-execution, step 1); the formula does not select it. `Context` is the Default Context of the Core standard. A context type with its own data derives from `Context` and overrides `loadContextData()` (pre-execution step 2, run once per context). The host updates such constants between executions with `setConstant`, which a formula cannot do. `IterationContext` and `TimeContext` (Core) and the Stock contexts (`StockContext`, `IndicatorContext`, `PatternContext`, `StrategyContext`) derive from it. `NOW` is a constant of the context, set in the pre-execution: by every execution of a Default Context, once before the first iteration of an Iteration Context, and for every frame of a Time Context (`Executor.createFrameRunner` parses the formula once and executes one frame per `nextFrame`).

## Design rules

- **Errors are values.** Formula errors are returned as Error values (`Value.error(...)`), never thrown. Exceptions are reserved for programming errors of the host application (e.g. registering a function twice, an invalid argument template, an invalid candle).
- **Abstractions first.** A new concept of the standard gets an interface in `src/abstractions` before it gets an implementation.
- **One standard, one module.** Code that belongs to an extension standard does not go into the core.
- **Standard identifiers come from the standard.** Error codes and names, operator spellings and binding powers, function signatures and standard identifiers (`core-1.0`) are copied from the standard documents; see [Development](development.md#keeping-the-library-in-sync-with-the-standard).
- **Same results as the reference implementation.** Behavior that the standard leaves open is decided as in FormuLang.NET, and listed in [Conformance](conformance.md#implementation-choices).
- **Immutable values.** Values, types, errors, tokens and stage results are immutable; only containers (variables) and objects change.

## Design patterns

| Pattern | Where |
| :------ | :---- |
| Strategy | The stages of the pipeline behind interfaces, replaceable with `Executor.with*()` (open/closed and dependency inversion: the executor depends on the interfaces only). |
| Builder | Fluent configuration of `Executor`. |
| Factory | `Value.number/text/...`, `Errors.*`, `Types.*`, `ArgumentTemplate.of/arrayOf/any`, `Context.create`, `Environment.create`. |
| Composite | Expression trees; `FlObject` is the base of objects, contexts and environments. |
| Template method | `Context.loadContextData()` and `preExecute()`. |
| Registry | Functions and standards of the `Environment`, `FormulaRegistry`. |
| Facade | `evaluate()` and `Engine` over the pipeline API. |
| Interpreter | Pratt parser and evaluator over the expression tree. |
| Table-driven definitions | The Core functions are declared as data (name, overloads with templates and implementations), grouped by category. |
| Result object | Every stage returns a result with `error` and `successful` instead of throwing. |

## Differences from FormuLang.NET

The behavior of formulas is the same; the API follows the conventions of TypeScript:

- camelCase members, `undefined` instead of `null` for a missing value, `as const` objects instead of enums;
- interfaces only where C# has them as contracts; `IProcedure` and the discriminated expression nodes are added, so the evaluator and the parser do not depend on concrete classes;
- stages are stateless instances; values and stage results are immutable;
- `IObject.getProperty` returns `undefined` for a missing key instead of throwing;
- the extension methods of the Stock standard are functions (`registerStock`, `getFormulaRegistry`) and the `StockExecutor` class;
- the clock of `NOW` is a function (`Environment.clock`, `Date.now` by default) instead of a `TimeProvider`;
- the JavaScript facade (`evaluate`, `Engine`) has no counterpart in FormuLang.NET.
