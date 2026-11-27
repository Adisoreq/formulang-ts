# Getting started

## Requirements

- [Node.js](https://nodejs.org) 20 or newer, or any modern browser (the library has no runtime dependencies and uses ES2022).
- For development: Node.js 22.12 or newer.

## Installation

```bash
npm install formulang-ts
```

To use a version that is not published yet, build the library from the repository and install it from the folder (or from the archive created by `npm pack`):

```bash
git clone https://github.com/Adisoreq/formulang-ts.git
```

```bash
cd formulang-ts && npm ci && npm run build
```

```bash
npm install ../formulang-ts
```

The package has three entry points, each available as an ES module and as CommonJS:

| Import | Content |
| :----- | :------ |
| `formulang-ts` | Core standard (`core-1.2`), the execution pipeline and the JavaScript facade |
| `formulang-ts/abstractions` | Interfaces only (`IValue`, `IContext`, `IEvaluator`, ...), for hosts and extensions that depend only on the contracts |
| `formulang-ts/stock` | Stock extension standard (`stock-1.2`) |

## Quick start: the JavaScript facade

`evaluate` executes a formula and converts its result into a plain JavaScript value. It never throws for a problem of the formula: check `ok`.

```ts
import { evaluate } from "formulang-ts";

const result = evaluate("ROUND($price * (1 + TAX), 2)", {
  variables: { price: 120 },   // $price
  constants: { TAX: 0.23 },    // TAX, cannot be changed by the formula
});

if (result.ok) console.log(result.value);   // 147.6
else console.log(result.error.toString());  // without $price: [UNKNOWN_SYMBOL_ERROR (5)] Variable "price" is not defined.
```

| Property | Description |
| :------- | :---------- |
| `ok` | `true` if the execution was not aborted by an Error. |
| `value` | Result as a JavaScript value (only when `ok`). |
| `error` | The `FormulaError` that aborted the execution: `code`, `name`, `message` (only when not `ok`). |
| `validationErrors` | Every problem found by validation, which reports all of them at once (only when not `ok`). |
| `text` | Result serialized with the serialization variables of the execution (`@decimal_place`, ...). |
| `raw` | Result as a FormuLang value (`IValue`). |
| `context` | Context of the execution. |

Values are converted as follows:

| JavaScript | FormuLang |
| :--------- | :-------- |
| `number`, `bigint` | Number |
| `string` | Text |
| `boolean` | Boolean |
| `null`, `undefined` | Null |
| array | Array |
| plain object | Object |
| `Date` | Number (Unix time in milliseconds) |
| function | Delegate |
| `FormulaError` | Error |

### Engine

An `Engine` keeps an environment and an executor for many formulas: host functions, environment constants and extension standards are registered once.

```ts
import { createEngine, ContextType } from "formulang-ts";

const engine = createEngine({
  functions: { HYPOT: (a, b) => Math.hypot(a as number, b as number) },
  constants: { VAT: 0.2 },
});

engine.evaluate("HYPOT(3, 4) * (1 + VAT)").text;          // "6"

// A persistent context keeps its variables between executions
const session = engine.createContext(ContextType.Persistent);
engine.evaluate("$n := 0\n$n = $n + 1", { context: session });
engine.evaluate("$n", { context: session }).text;         // "1"

// Environment variables can be overridden for one execution
engine.evaluate("[10, 20, 30][1]", { environmentVariables: { array_indexing: 1 } }).text;   // "10"
```

A host function receives and returns plain JavaScript values. When one of its arguments is an Error, the function is not called and the Error is returned, like for the Core functions; an exception thrown by the function becomes an `OPERATION_ERROR`.

## The pipeline API

The facade is built on an API that follows the architecture of the reference implementation [FormuLang.NET](https://github.com/Adisoreq/formulang-dotnet). Use it when you need FormuLang values, typed overloads, custom context types or replaced pipeline stages.

```ts
import { Environment, Executor } from "formulang-ts";

const environment = Environment.create();   // supports core-1.2 (and core-1.0, core-1.1)
const executor = Executor.create();

const result = executor.execute("$r := 2.5\nPI * $r ^ 2", environment);

if (result.successful) console.log(result.value.toString());   // 19.634954084936208
else console.log(result.error.toString());
```

`Executor.execute` runs the whole [execution](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/execution.md): pre-execution, validation, clean-up, tokenization, parsing, evaluation and finalization. Its `ExecutionResult` has `value`, `error`, `successful`, `validationErrors` and `context`; `toString()` serializes the value with the serialization variables of the execution.

### Errors are values

A formula never throws. Every problem is an **Error** value with a code from the [Core error list](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/errors/README.md). The execution is aborted when an Error reaches the root of a sequence, unless the formula sets `@suppress_errors = true`. Exceptions are thrown only for programming errors of the host application, e.g. registering a function twice.

### Environment and context

The **environment** is the global configuration of the host application: the supported standards, their functions, the environment constants (`PI`, `E`, `PHI`, `TRUE`, `FALSE`, `NULL`, `STANDARDS`) and the default values of the environment variables (`array_indexing`, `suppress_errors` and the serialization variables).

A **context** holds the data of one execution: the context (`$`) variables, the context constants and copies of the environment (`@`) variables, so a formula never changes the environment.

```ts
import { Context, ContextType, Value } from "formulang-ts";

const context = Context.create(environment);
context.initVariable("price", Value.number(120));
context.initConstant("TAX", Value.number(0.23));
executor.execute("ROUND($price * (1 + TAX), 2)", context).value.toString();   // "147.6"

// A persistent context keeps its variables between executions
const counter = Context.create(environment, ContextType.Persistent);
executor.execute("$n := 0\n$n = $n + 1", counter);
executor.execute("$n := 0\n$n = $n + 1\n$n", counter).value.toString();       // "2"
```

### Custom functions

A named function has one or more overloads, each with an argument template and an implementation. The first overload that matches the arguments is called.

```ts
import { ArgumentTemplate, FlFunction, FunctionOverload, Types, Value } from "formulang-ts";

const hypot = new FlFunction("HYPOT", [
  new FunctionOverload(
    [ArgumentTemplate.of("a", Types.Number), ArgumentTemplate.of("b", Types.Number)],
    ([a, b]) => Value.number(Math.hypot(a!.raw as number, b!.raw as number)),
  ),
]);

environment.registerFunction(hypot);
executor.execute("HYPOT(3, 4)", environment).value.toString();   // "5"
executor.execute('HYPOT(3, "4")', environment).error.name;        // "ARGUMENT_ERROR"
```

`ArgumentTemplate.of(name, type, { optional, multiple })`, `ArgumentTemplate.arrayOf(name, elementType)` (e.g. `Array<Number>`) and `ArgumentTemplate.any(name)` follow the [argument templates](https://github.com/Adisoreq/FormuLang/blob/main/docs/implementation/argument_template.md) of the standard.

A function that only computes its result from its arguments, and changes nothing in the context or in the host application, can be marked as side-effect free:

```ts
new FlFunction("HYPOT", [/* overloads */], FunctionType.Function, { sideEffectFree: true });
hostFunction("TAX", (price) => price * 0.23, { sideEffectFree: true });
```

`IF` receives both branches computed (the Core standard), so the branch that is not selected is computed only for its side effects. In a sequence where every function is side-effect free, the evaluator skips that branch, which gives the same result much faster, e.g. in an indicator that computes its first value differently: `IF(ISNULL(PREV), AVG(...), PREV + ...)`. All Core and Stock functions are side-effect free. A function that is not marked (the default), e.g. one that records diagnostics in the host application, is always called, and so is every function in the same sequence.

### Custom context types

The host application chooses the context type, because it has the data a formula works on. A context type derives from `Context` and loads its constants in `loadContextData()`, which runs once, before the first execution:

```ts
import { Context, ContextType, type IEnvironment, Value } from "formulang-ts";

class PriceContext extends Context {
  constructor(environment: IEnvironment, private readonly close: number[]) {
    super(environment, ContextType.Persistent);
  }

  protected override loadContextData(): void {
    this.setConstant("CLOSE", Value.array(this.close.map((c) => Value.number(c)), "CLOSE"));
    this.setConstant("N", Value.number(this.close.length, "N"));
  }
}

executor.execute("AVG(CLOSE)", new PriceContext(environment, [10, 12, 11, 15])).value.toString();   // "12"
```

The Core **Iteration Context** runs a formula once per iteration with the constants `I`, `N` and `PREV`:

```ts
import { IterationContext } from "formulang-ts";

const run = executor.executeIterations("IF(ISNULL(PREV), 1, PREV * 2)", IterationContext.create(environment, 4));
run.values.map(String);   // ["1", "2", "4", "8"]
```

### Running single stages

Every stage is an interface in `formulang-ts/abstractions` with a Core implementation. Stages can be used on their own, or replaced in the executor (`withValidator`, `withCleaner`, `withTokenizer`, `withParser`, `withEvaluator`):

```ts
import { Cleaner, Evaluator, Parser, Tokenizer, Validator } from "formulang-ts";

new Validator().validate("ADD(1, 2]", environment).errors;      // all problems at once
const cleaned = new Cleaner().cleanUp("$x = 2 # comment");
const tokens = new Tokenizer().tokenize(cleaned.result);
const parsed = Parser.forEnvironment(environment).parse(tokens.tokens);
parsed.sequences.map((s) => s.root.key);                        // ["SET($x,2)"]

// A parsed formula can be evaluated many times without repeating the earlier stages
new Evaluator().evaluate(parsed, Context.create(environment));
```

## The Stock extension

```ts
import { Environment, Executor } from "formulang-ts";
import { registerStock, StockContext, StockExecutor, StrategyContext } from "formulang-ts/stock";

const environment = Environment.create();
const registry = registerStock(environment).registry;   // Stock.Candle, CANDLE, LOAD_INDICATOR, LOAD_PATTERN, LOAD_CANDLES, LAG, WINDOW, CROSSOVER, SCORE, ..., stock-1.2
registry.indicators.add("SMA", "$p = PARAMETERS.period\n$w = RANGE(SOURCE, MAX(I - $p + 1, 0), I)\nIF(LEN($w) == $p, AVG($w), null)", { period: 3 });

const candles = [1, 2, 3, 4, 5].map((p) => ({ open: p, high: p, low: p, close: p }));

const context = StockContext.create(environment, candles);
Executor.create().executeIterations('LOAD_INDICATOR("SMA")[I]', context).values.map(String);
// ["null", "null", "2", "3", "4"]

// Patterns are the second part of the formula registry; LOAD_PATTERN returns a Boolean for every candle
registry.patterns.add("RISING", "AND(I > 0, CLOSE[I] > CLOSE[MAX(I - 1, 0)])");
context.computePattern("RISING").toString();   // "[false, true, true, true, true]"

const strategy = new StockExecutor().executeStrategy("IF(CLOSE[I] > 3, BUY, NEUTRAL)", StrategyContext.create(environment, candles));
strategy.signals;   // [0, 0, 0, 1, 1]
```

The Stock, Indicator, Pattern and Strategy contexts and `StockExecutor` (`executeIndicator`, `executePattern`, `executePatternSeries`, `executeStrategy`) follow the [Stock standard](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/stock/README.md).

## Samples

The samples in [samples/](../samples) are separate projects, each with its own `package.json`, dependencies and scripts. They use the built package (`"formulang-ts": "file:../.."`), like applications that install it from npm, so build the library before installing them:

```bash
npm ci && npm run build
```

**Calculator CLI** ([samples/calculator-cli](../samples/calculator-cli/README.md)) executes a formula in a Core environment with the Stock standard and prints the result, or the errors that stopped the execution:

```bash
cd samples/calculator-cli && npm install && npm start -- "2 + 2 * 2"
```

**Web preview** ([samples/web-preview](../samples/web-preview/README.md)) is an editor (Solid, lightweight-charts) with syntax highlighting and suggestions, which executes formulas of the Core and Stock standards in every context type: a console for the Default Context, a slider over the iterations, and a candlestick chart with indicator series, pattern rectangles and strategy signals:

```bash
cd samples/web-preview && npm install && npm run dev
```
