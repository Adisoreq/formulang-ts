#!/usr/bin/env node
/* global process, console */
/**
 * Copies the conformance tests of the FormuLang standard (https://github.com/Adisoreq/FormuLang, `tests/`) into
 * `tests/conformance/spec` and records the revision of the standard in `tests/conformance/spec/REVISION`. Run it
 * every time the library is synced with a newer revision of the standard (docs/development.md).
 *
 *   node scripts/sync-conformance.mjs [path of a checkout of the standard, default: ../FormuLang]
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const standard = resolve(process.argv[2] ?? join(root, "..", "FormuLang"));
const source = join(standard, "tests");
const target = join(root, "tests", "conformance", "spec");

if (!existsSync(join(source, "schema.json"))) {
  console.error(`No conformance tests found in "${source}". Pass the path of the standard repository.`);
  process.exit(1);
}

const git = (...args) => execFileSync("git", ["-C", standard, ...args], { encoding: "utf8" }).trim();
let revision = git("rev-parse", "--short", "HEAD");
if (git("status", "--porcelain", "--", "tests").length > 0) revision += " (with uncommitted changes)";

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(join(source, "schema.json"), join(target, "schema.json"));
for (const entry of readdirSync(source, { withFileTypes: true })) {
  if (entry.isDirectory()) cpSync(join(source, entry.name), join(target, entry.name), { recursive: true });
}

const commit = revision.split(" ")[0];
writeFileSync(
  join(target, "REVISION"),
  `Adisoreq/FormuLang@${revision}\n` +
    `Copied from https://github.com/Adisoreq/FormuLang/tree/${commit}/tests (CC BY 4.0) by scripts/sync-conformance.mjs.\n` +
    "Do not edit these files here: change the standard, then run the script again.\n",
);

const count = (dir) =>
  readdirSync(dir, { withFileTypes: true }).reduce(
    (n, e) => n + (e.isDirectory() ? count(join(dir, e.name)) : e.name.endsWith(".json") && e.name !== "schema.json"),
    0,
  );
console.log(`Copied ${count(target)} test files from Adisoreq/FormuLang@${revision}.`);
