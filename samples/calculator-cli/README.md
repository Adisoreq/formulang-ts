# Calculator CLI

Sample of [FormuLang-TS](../../README.md): executes a formula in a basic Core environment and prints the result, or the errors that stopped the execution. It is a separate project that uses the built package, like an application installed from npm.

## Running

The sample depends on the library in the root of the repository (`"formulang-ts": "file:../.."`), so build the library first:

```bash
cd ../.. && npm ci && npm run build
```

```bash
npm install
```

```bash
npm start -- "2 + 2 * 2"
```

```bash
npm start -- -f examples/statistics.fl
```

Without arguments it starts an interactive mode: type a formula (it may have several lines) and press Enter on an empty line to execute it. A formula can also be piped through the standard input (`npm start < formula.fl`).

| Exit code | Meaning |
| :-------: | :------ |
| `0` | The formula was executed. |
| `1` | The execution was aborted by an error. |
| `2` | Invalid usage (e.g. the file does not exist). |

`npm run build` compiles the CLI to `dist/main.js` (the `formulang-calculator` command).

## Files

| File | Content |
| :--- | :------ |
| [src/main.ts](src/main.ts) | The CLI: arguments, files, the standard input and the interactive mode. |
| [examples](examples) | Formula files: compound interest, statistics. |
