<div align="center">

<img src="./raw/images/icons/logotype.svg" alt="FormuLang logo" width="500" />

**FormuLang-TS** is a multi-platform, modular TypeScript library implementing the [**FormuLang**](https://github.com/Adisoreq/FormuLang) standard.

![GitHub License](https://img.shields.io/github/license/Adisoreq/formulang-ts)
[![Status](https://img.shields.io/badge/status-under%20development-orange)](#project-status)
[![Core](https://img.shields.io/badge/core-0.3-blue)](docs/conformance.md)
[![Stock](https://img.shields.io/badge/stock-0.1-blue)](docs/conformance.md)

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

- **Core 0.3** and **Stock 0.1** standards: all Core functions and procedures, lambdas, objects, the Iteration Context, the Stock context types, `CANDLE` and `INDICATOR`.
- **Modular**: one package with separate entry points – `formulang-ts`, `formulang-ts/abstractions` and `formulang-ts/stock` – each as an ES module and as CommonJS, with type declarations and no runtime dependencies.
- **Two levels of API**: a facade working with plain JavaScript values (`evaluate`, `createEngine`), and the pipeline API following the architecture of [FormuLang.NET](https://github.com/Adisoreq/formulang-dotnet) (environments, contexts, replaceable stages, typed function overloads).
- **Errors are values**: a formula never throws; every problem is a FormuLang Error with a code from the standard, and validation reports every problem at once.
- **Same results as the reference implementation**: the test cases of FormuLang.NET are the conformance tests of this library, and both give identical outputs (see [Conformance](docs/conformance.md)).

## Installation

The library is not published on npm yet; see [Getting started](docs/getting-started.md#installation) to build and install it from the repository.

| Import | Content |
| :----- | :------ |
| `formulang-ts` | Core standard, execution pipeline, JavaScript facade |
| `formulang-ts/abstractions` | Interfaces shared by every module |
| `formulang-ts/stock` | Stock extension standard |

## Project status

The library implements the latest versions of the standards, **Core 0.3** and **Stock 0.1**, which are still in progress. It is in the prototyping stage: the API can change in any `0.x` version. See [Conformance](docs/conformance.md) for the details, the implementation choices and the proposals for the standard.


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
