/**
 * Calculator CLI: executes FormuLang formulas and prints the result, or the errors that stopped the execution.
 *
 * Usage (in samples/calculator-cli, after `npm install`):
 *
 *   npm start -- "2 + 2 * 2"                      execute the formula given as an argument
 *   npm start -- -f examples/statistics.fl        execute a formula file
 *   npm start < formula.fl                        execute a formula read from the standard input
 *   npm start                                     interactive mode
 *
 * Exit codes: 0 - success, 1 - the execution was aborted by an error, 2 - invalid usage.
 */
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { Environment, Executor } from "formulang-ts";
import { registerStock } from "formulang-ts/stock";

// The Core environment with the Stock standard (CANDLE, IS_BULLISH, IS_BEARISH): no constants or variables besides
// the ones required by the standards. NOW is read from the system clock for every execution.
const environment = Environment.create();
registerStock(environment);
const executor = Executor.create();

const red = (text: string): string => (process.stderr.isTTY ? `\x1b[31m${text}\x1b[0m` : text);

/** Executes the formula in a new disposable context and prints its result. */
function run(formula: string): number {
  const result = executor.execute(formula, environment);
  if (result.successful) {
    console.log(result.value.toString());
    return 0;
  }
  // Validation reports every problem at once; any other stage stops at the first error
  const errors = result.validationErrors.length > 0 ? result.validationErrors : [result.error];
  for (const error of errors) console.error(red(error.toString()));
  return 1;
}

async function interactive(): Promise<void> {
  console.log('FormuLang-TS calculator. Enter a formula; an empty line executes it. Type "exit" to quit.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const lines: string[] = [];
  rl.setPrompt("> ");
  rl.prompt();
  for await (const line of rl) {
    if (lines.length === 0 && line.trim() === "exit") break;
    // An empty line inside an unclosed scoped comment (<# ... #>) does not execute the formula
    if (line.length > 0 || isInsideScopedComment(lines)) lines.push(line);
    else if (lines.length > 0) {
      run(lines.join("\n"));
      lines.length = 0;
    }
    rl.setPrompt(lines.length === 0 ? "> " : ". ");
    rl.prompt();
  }
  rl.close();
}

function isInsideScopedComment(lines: readonly string[]): boolean {
  const text = lines.join("\n");
  const open = text.lastIndexOf("<#");
  return open >= 0 && text.indexOf("#>", open + 2) < 0;
}

function help(): void {
  console.log(`Executes FormuLang formulas and prints the result.
Standards: ${environment.standards.join(", ")}

Usage:
  calculator "<formula>"      execute the formula given as an argument
  calculator -f <file>        execute a formula file
  calculator < <file>         execute a formula read from the standard input
  calculator                  interactive mode (an empty line executes the formula)

Comments: # until the end of the line, <# ... #> scoped (may span lines).
Exit codes: 0 - success, 1 - the execution was aborted by an error, 2 - invalid usage.`);
}

async function main(args: readonly string[]): Promise<number> {
  if (args.length === 2 && (args[0] === "-f" || args[0] === "--file")) {
    const path = args[1]!;
    if (!existsSync(path)) {
      console.error(red(`File not found: ${path}`));
      return 2;
    }
    return run(readFileSync(path, "utf-8"));
  }
  if (args[0] === "-h" || args[0] === "--help") {
    help();
    return 0;
  }
  if (args.length > 0) return run(args.join(" "));
  if (!process.stdin.isTTY) return run(readFileSync(0, "utf-8"));
  await interactive();
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
