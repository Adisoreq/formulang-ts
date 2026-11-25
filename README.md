<div align="center">

<img src="./raw/images/icons/logotype.svg" alt="FormuLang logo" width="500" />

**FormuLang-TS** is a multi-platform, modular TypeScript library implementing the [**FormuLang**](https://github.com/Adisoreq/FormuLang) standard.

![GitHub License](https://img.shields.io/github/license/Adisoreq/formulang-ts)
[![npm](https://img.shields.io/npm/v/formulang-ts?label=npm)](https://www.npmjs.com/package/formulang-ts)
[![Standards](https://img.shields.io/badge/standards-core--1.1%20%C2%B7%20stock--1.1-2fbf71)](docs/conformance.md)

[**Documentation**](docs/README.md) · [**Getting started**](docs/getting-started.md) · [**Changelog**](CHANGELOG.md)

---

**Web preview** available here:

<a href="https://adisoreq.github.io/formulang-ts/">
  <img src="https://img.shields.io/badge/%E2%96%B6-Run%20Web%20Preview-3178c6?style=for-the-badge&labelColor=1e4f8a" alt="Run Web Preview button" />
</a>

</div>

## Overview

[**FormuLang**](https://github.com/Adisoreq/FormuLang) is a formula-based scripting language standard: a host application embeds an interpreter and lets its users write text formulas such as below:

```php
$principal := 1000
$rate := 0.05
$principal * (1 + $rate) ^ 10
```

**FormuLang-TS** is the implementation of that standard for TypeScript and JavaScript, in Node.js and in the browser. It turns a formula into a single result value by running the execution pipeline defined by the standard:

**Validation** → **Clean-up** → **Tokenization** → **Parsing** → **Evaluation**

```ts
import { evaluate } from "formulang-ts";

const result = evaluate("$principal * (1 + $rate) ^ 10", { variables: { principal: 1000, rate: 0.05 } });

if (result.ok) console.log(result.value);   // 1628.894626777442
else console.log(result.error.toString());  // e.g. [UNKNOWN_SYMBOL_ERROR (5)] Variable "rate" is not defined.
```

## Features

- **Core 1.1** and **Stock 1.1** standards (backward compatible with 1.0): all Core functions and procedures, lambdas and delegate calls (`$f(x)`), objects, scoped comments, Unicode texts, `FORMAT`, the time and statistical functions and `NOW`, the Iteration and Time Contexts; the Stock context types, the formula registry of indicators and patterns, `CANDLE`, `IS_BULLISH`, `IS_BEARISH`, `LOAD_INDICATOR`, `LOAD_PATTERN`, `LAG` and `WINDOW`.
- **Modular**: one package with separate entry points – `formulang-ts`, `formulang-ts/abstractions` and `formulang-ts/stock` – each as an ES module and as CommonJS, with type declarations and no runtime dependencies.
- **Two levels of API**: a facade working with plain JavaScript values (`evaluate`, `createEngine`), and the pipeline API following the architecture of [FormuLang.NET](https://github.com/Adisoreq/formulang-dotnet) (environments, contexts, replaceable stages, typed function overloads).
- **Errors are values**: a formula never throws; every problem is a FormuLang Error with a code from the standard, and validation reports every problem at once.
- **Same results as the reference implementation**: the test cases of FormuLang.NET and the language-independent conformance tests of the standard are the tests of this library, and both implementations give identical outputs (see [Conformance](docs/conformance.md)).

## Installation

The library is one package on [npm](https://www.npmjs.com/package/formulang-ts), with three entry points and no runtime dependencies:

| Import | Content |
| :----- | :------ |
| `formulang-ts` | Core standard, execution pipeline, JavaScript facade |
| `formulang-ts/stock` | Stock extension standard: candles, indicators, patterns, strategies |
| `formulang-ts/abstractions` | Interfaces shared by every module |

### 1. Check the requirements

Node.js 20 or newer, or any modern browser through a bundler (Vite, webpack, esbuild, ...). Check the installed version of Node.js:

```bash
node --version
```

### 2. Add the package

In the directory of the project (the one with `package.json`):

```bash
npm install formulang-ts
```

With other package managers: `yarn add formulang-ts`, `pnpm add formulang-ts` or `bun add formulang-ts`. The package contains type declarations, so TypeScript needs no extra `@types` package.

### 3. Run your first formula

The package works as an ES module and as CommonJS:

```ts
import { evaluate } from "formulang-ts";          // ES module (TypeScript, bundlers, "type": "module")
// const { evaluate } = require("formulang-ts");  // CommonJS

const result = evaluate("$double = (x) => x * 2
$double(21)");
console.log(result.ok ? result.value : result.error.toString());   // 42
```

### 4. Add the Stock standard (optional)

The Stock standard is a separate entry point of the same package, so there is nothing more to install:

```ts
import { Environment } from "formulang-ts";
import { registerStock } from "formulang-ts/stock";

const environment = Environment.create();
const registry = registerStock(environment).registry;   // LOAD_INDICATOR, LAG, WINDOW, Stock.Candle, stock-1.1
registry.indicators.add("SMA", "WINDOW(SOURCE, PARAMETERS.period, AVG)", { period: 20 });
```

The next steps (contexts, iterations over candles, your own functions) are in [Getting started](docs/getting-started.md).

## Project status

The library implements the standards **Core 1.1** and **Stock 1.1**, backward compatible with their first stable versions, **Core 1.0** and **Stock 1.0**. From version `1.0.0` on it follows [Semantic Versioning](https://semver.org): changes within the `1.x` versions are backward compatible. See [Conformance](docs/conformance.md) for the details, the implementation choices and the proposals for the standard, and [Development](docs/development.md#releasing) for the releases.


## Related projects

- [**FormuLang**](https://github.com/Adisoreq/FormuLang)
<br> Language standard, reference point for syntax and semantics rules.

- [**FormuLang.NET**](https://github.com/Adisoreq/formulang-dotnet)
<br> Implementation for C# (.NET 8.0), reference implementation of this library.


## Authors

Adrian Piznal


## License

The library is licensed under the [MIT License](LICENSE).
The FormuLang standard documentation is licensed separately, under [CC BY 4.0](https://github.com/Adisoreq/FormuLang/blob/main/LICENSE.txt).

<div align="center">
<img src="raw/images/icons/monogram.svg" width="50" alt="Monogram" />
</div>
