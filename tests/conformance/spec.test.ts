import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCases, runCase, specDirectory, supportedStandards } from "./spec-runner.js";

// Every case of the conformance tests of the standard (tests/conformance/spec, copied from Adisoreq/FormuLang/tests
// by scripts/sync-conformance.mjs; the revision is in tests/conformance/spec/REVISION).

/**
 * Cases that disagree with the algorithm of the standard itself (docs/conformance.md, "Known deviations"), the same
 * as in FormuLang.NET. They must keep failing: when the standard is fixed and the case passes, remove it here.
 */
const knownDeviations: Readonly<Record<string, string>> = {};

const cases = loadCases();

describe("Conformance tests of the standard", () => {
  it("loads every file", () => {
    expect(existsSync(join(specDirectory, "REVISION"))).toBe(true);
    expect(cases.some((c) => c.file.startsWith("core/"))).toBe(true);
    expect(cases.some((c) => c.file.startsWith("stock/"))).toBe(true);
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s", (id, testCase) => {
    // A case that requires a standard the library does not implement is skipped (it passes trivially)
    if (testCase.standards.some((s) => !supportedStandards.has(s))) return;
    const problems = runCase(testCase);
    const reason = knownDeviations[id];
    if (reason !== undefined) {
      expect(problems.length, `${id} passes now: remove it from the known deviations (${reason}).`).toBeGreaterThan(0);
      return;
    }
    expect(problems, `${id} (${testCase.file})\nFormula:\n${testCase.formula}`).toEqual([]);
  });
});
