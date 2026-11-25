// @ts-check
/* global process, console */
/**
 * Packs the library for a release: the npm package (formulang-ts-<version>.tgz).
 *
 * Does locally what the Release workflow (.github/workflows/release.yml) does before it publishes: the checks of
 * `npm run check` (lint, format, typecheck, tests, build, package checks), then `npm pack`. The version comes from
 * package.json. Nothing is published: publish the file with `npm publish <file>`, or push a version tag and let the
 * Release workflow do it (docs/development.md, "Releasing").
 *
 * Usage:
 *   node scripts/pack.mjs [--skip-checks] [--out <directory>]
 *
 *   --skip-checks   only builds and packs, without lint, format, typecheck, tests and package checks
 *   --out <dir>     directory of the package; default: artifacts (ignored by git). Old packages are removed first.
 *
 * The format check ignores line endings (`--end-of-line auto`): a Windows checkout with CRLF endings is formatted
 * correctly, while the Release workflow checks the LF files of the repository.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const skipChecks = args.includes("--skip-checks");
const outIndex = args.indexOf("--out");
const out = resolve(outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : join(root, "artifacts"));

/** Runs a command in the repository; stops the script if it fails. */
function step(title, command) {
  console.log(`\n==> ${title}\n$ ${command}`);
  const result = spawnSync(command, { cwd: root, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    console.error(`\n${title} failed (exit code ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}

/** Output of a command, or an empty text if it fails. */
function read(command) {
  const result = spawnSync(command, { cwd: root, encoding: "utf8", shell: true });
  return result.status === 0 ? result.stdout.trim() : "";
}

const { name, version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
console.log(`${name} ${version}`);

const released = read(`git tag --list v${version} ${version}`);
if (released) {
  console.warn(
    `Warning: version ${version} is already tagged (${released.split(/\s+/).join(", ")}): ` +
      `set a new version in package.json (npm version <x.y.z> --no-git-tag-version) before a release.`,
  );
}
if (read("git status --porcelain")) {
  console.warn("Warning: the working tree has uncommitted changes, which are packed too.");
}

if (!skipChecks) {
  step("Lint", "npm run lint");
  step("Format", "npx prettier --check . --end-of-line auto");
  step("Typecheck", "npm run typecheck");
  step("Test", "npm test");
}
step("Build", "npm run build");
if (!skipChecks) step("Package checks", "npm run check:package");

if (existsSync(out)) {
  for (const file of readdirSync(out)) if (/^formulang-ts-.*\.tgz$/.test(file)) rmSync(join(out, file));
} else {
  mkdirSync(out, { recursive: true });
}
step("Pack", `npm pack --pack-destination "${out}"`);

const file = join(out, `${name}-${version}.tgz`);
if (!existsSync(file)) {
  console.error(`\nThe package ${file} was not created.`);
  process.exit(1);
}
console.log(`\nPackage: ${file} (${(statSync(file).size / 1024).toFixed(0)} KB)`);
