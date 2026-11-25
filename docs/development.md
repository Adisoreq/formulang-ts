# Development

## Requirements and setup

- [Node.js](https://nodejs.org) 22.12 or newer (required by the development tools; the library itself supports Node.js 20+).

```bash
npm ci
```

## Scripts

| Script | Description |
| :----- | :---------- |
| `npm run build` | Builds `dist/` with tsup: ES modules, CommonJS and type declarations for the three entry points. |
| `npm test` | Runs the tests (Vitest). `npm run test:watch` runs them in watch mode. |
| `npm run coverage` | Runs the tests with a coverage report (`coverage/`). |
| `npm run lint` | ESLint, including the rules of the module boundaries. |
| `npm run format` / `format:check` | Prettier. |
| `npm run typecheck` | Type-checks the library and the tests. |
| `npm run docs` | Generates the API reference with TypeDoc (`docs/api/`, not committed). |
| `npm run check:package` | Validates the package with publint and Are the Types Wrong. |
| `npm run check` | All of the above that a release needs: lint, format, types, tests, build, package. |

The CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs `lint`, `format:check`, `typecheck`, `coverage`, `build` and `check:package` on Node.js 22 and 24, imports the built package (ESM and CommonJS) on Node.js 20, and installs and builds every sample against the built package.

The Pages workflow ([.github/workflows/pages.yml](../.github/workflows/pages.yml)) publishes the [web preview](../samples/web-preview/README.md) on GitHub Pages (<https://adisoreq.github.io/formulang-ts/>) after every push to `main`. It needs *Settings → Pages → Build and deployment → Source: GitHub Actions* in the repository.

## Samples

Every sample in [samples/](../samples) is a separate project with its own `package.json`, lockfile, `node_modules` and scripts; the root project does not install their dependencies, and ESLint of the root skips them. A sample depends on the library with `"formulang-ts": "file:../.."`, i.e. on the built `dist/` through the `exports` of `package.json`, so it checks the package the way a user gets it. Build the library (`npm run build`, or `npx tsup --watch` while working on it) before running a sample; see the README of each sample.

## Tests

| Folder | Content |
| :----- | :------ |
| `tests/conformance` | Conformance tests: the examples of the standard, ported from the tests of FormuLang.NET. |
| `tests/conformance/data` | Data tables of those tests (formula and expected result), **generated** from the test sources of FormuLang.NET. Do not edit them by hand. |
| `tests/unit` | Tests of the library itself: primitives, functions, the facade, number formatting. |

Expected results that end with `_ERROR` are compared by the name of the error only, because the messages of errors are implementation-defined; the other tables compare the whole result, messages included.

## Keeping the library in sync with the standard

The [FormuLang standard](https://github.com/Adisoreq/FormuLang), the reference implementation [FormuLang.NET](https://github.com/Adisoreq/formulang-dotnet) and this library are developed in parallel.

### 1. Pin the standard revision

The library always targets one revision of the standard, recorded in [Conformance](conformance.md) (`Standard revision checked`, `Reference implementation`). When the standard changes:

1. Read the standard's [CHANGELOG](https://github.com/Adisoreq/FormuLang/blob/main/CHANGELOG.md) and [Core CHANGELOG](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/CHANGELOG.md) since the pinned revision.
2. Add every relevant change to [Conformance](conformance.md) as a deviation (it is a deviation until the library implements it).
3. Update the pinned revision.

### 2. Copy identifiers, do not invent them

Values defined by the standard are copied from it, never chosen in the library:

- error codes and names ([Core errors](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/errors/README.md)) – `src/core/errors.ts`;
- operator spellings, binding powers and associativity ([Operator parsing](https://github.com/Adisoreq/FormuLang/blob/main/docs/semantics/operator-parsing.md#binding-power)) – `src/core/operators.ts`;
- standard identifiers (`core-1.0`, `stock-1.0`), environment constants and variables ([Core](https://github.com/Adisoreq/FormuLang/blob/main/docs/standards/core/README.md)).

If the implementation needs something the standard does not define (for example a new error), propose it in the standard first, then implement it.

### 3. Turn the standard's examples into tests

Most standard documents contain examples with an input and an expected result. They are the conformance test suite:

- one test (or table row) per example, with the document it comes from in the name of the `describe` block;
- a test that fails because the standard changed is a deviation: add it to [Conformance](conformance.md) instead of changing the expected result.

When FormuLang.NET adds test cases, regenerate the tables in `tests/conformance/data` with the scripts in [scripts/dotnet-cases](../scripts/dotnet-cases/README.md).

The standard also has language-independent conformance tests (JSON, [`tests/`](https://github.com/Adisoreq/FormuLang/tree/main/tests) of the standard repository). Copy them into `tests/conformance/spec` with

```bash
node scripts/sync-conformance.mjs ../FormuLang
```

The script records the revision in `tests/conformance/spec/REVISION`; [spec.test.ts](../tests/conformance/spec.test.ts) runs every case. Do not edit the copied files: change the standard and copy them again. A case that disagrees with the algorithm of the standard is listed in the known deviations of `spec.test.ts` and in [Conformance](conformance.md#known-deviations).

### 4. Same results as FormuLang.NET

Where the standard leaves room for interpretation, both implementations make the same choice, listed in [Conformance](conformance.md#implementation-choices). To compare the two implementations, run the same formulas with the CalculatorCLI of FormuLang.NET and with the [calculator CLI](../samples/calculator-cli/README.md) of this repository; the outputs must be identical, including the messages of errors. A difference is a bug in one of them, or a new implementation choice to agree on.

### 5. Change workflow

For a change of the language:

1. Change the standard (syntax / semantics document and changelog).
2. Add the example of the change as a test in the library. It fails.
3. Implement the change. The test passes.
4. Update [Conformance](conformance.md) and [CHANGELOG](../CHANGELOG.md).

For a change of the library only (refactoring, performance, API), the standard is not involved.

## Versioning

| | Scheme | Example |
| :-- | :----- | :------ |
| Standard | `<name>-<major>.<minor>` | `core-1.0` |
| Library | [SemVer](https://semver.org) | `1.0.0` |

The library version is independent of the standard version: a library release can fix bugs without any change of the standard. Every release lists the standards it supports in the [CHANGELOG](../CHANGELOG.md), and `IEnvironment.standards` reports the same identifiers at runtime.

From `1.0.0` on, a breaking change of the public API (anything exported by the three entry points) needs a new major version. A new minor version of a standard (`core-1.1`) is backward compatible, so it is implemented in a minor version of the library.

## Releasing

Releases are published to [npm](https://www.npmjs.com/package/formulang-ts) by the [Release workflow](../.github/workflows/release.yml) when a version tag is pushed:

1. Update the version in `package.json` (and in the lock files: `npm install --package-lock-only`, also in the samples) and the [CHANGELOG](../CHANGELOG.md) (the date of the release).
2. `npm run check` (also run by `prepublishOnly` and by the workflow).
3. Commit, then create and push the tag `v<version>`, e.g. `git tag v1.0.0 && git push origin v1.0.0`.

The workflow checks that the tag matches the version of `package.json`, runs `npm run check`, publishes the package with [provenance](https://docs.npmjs.com/generating-provenance-statements) and creates a GitHub release with the packed archive. It needs the repository secret `NPM_TOKEN` (an npm access token that can publish `formulang-ts`) in the `npm` environment; after the first publication the token can be replaced with [trusted publishing](https://docs.npmjs.com/trusted-publishers).

To pack the release locally: [scripts/pack.mjs](../scripts/pack.mjs) runs the checks of `npm run check` and `npm pack`, and writes `formulang-ts-<version>.tgz` into `artifacts`. It warns if the version is already tagged or the working tree has uncommitted changes (`--skip-checks` only builds and packs, `--out` sets another directory). The format check ignores line endings, so it also passes in a Windows checkout with CRLF endings.

```bash
node scripts/pack.mjs
```

To only list the content of the package: `npm pack --dry-run`.

## Extensions

An extension standard (e.g. **Stock**) is implemented in its own folder `src/<name>` with its own entry point `formulang-ts/<name>` (in `package.json` `exports` and `tsup.config.ts`), and its own section in [Conformance](conformance.md). Add it only when the extension has a first version of its specification in the standard repository.
