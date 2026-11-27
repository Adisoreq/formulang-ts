import { describe, expect, it } from "vitest";
import { satisfies } from "../../src/index.js";
import { run } from "../helpers.js";
import {
  conditionalSet,
  contextExamples,
  coreExamples,
  environmentExamples,
  init,
  lambdas,
  readingVariables,
  require,
  requirementFormat,
  set,
} from "./data/Execution.cases.js";

// Results are compared exactly, including the messages of the errors.
const tables: Record<string, readonly (readonly [string, string])[]> = {
  "Reading variables (docs/semantics/evaluation.md)": readingVariables,
  "SET (docs/standards/core/procedures/SET.md)": set,
  "INIT (docs/standards/core/procedures/INIT.md)": init,
  "COND_SET (docs/standards/core/procedures/COND_SET.md)": conditionalSet,
  "REQUIRE (docs/standards/core/procedures/REQUIRE.md)": require,
  "Context examples (docs/standards/core/examples/context_examples.md)": contextExamples,
  "Environment examples (docs/standards/core/examples/environment_examples.md)": environmentExamples,
  "Core examples (docs/standards/core/examples)": coreExamples,
  Lambdas: lambdas,
};

/**
 * Rows of the generated tables whose result changed with `core-1.2`. The tables are generated from the tests of
 * FormuLang.NET 1.1.0, which implements `core-1.1`; remove a row here when the tables are generated from a version of
 * FormuLang.NET that implements `core-1.2`.
 */
const core12Results: Readonly<Record<string, string>> = {
  'REQUIRE "core-1.2+"': "[SUCCESS (0)] Operation completed successfully.",
  '$standards = JOIN(STANDARDS, ", ")\nCONCAT("Supported standards: ", $standards)':
    "Supported standards: core-1.0, core-1.1, core-1.2",
};

for (const [name, cases] of Object.entries(tables)) {
  describe(name, () => {
    it.each(cases)("%j → %j", (formula, expected) => expect(run(formula)).toBe(core12Results[formula] ?? expected));
  });
}

describe("Requirement format (docs/standards/core/procedures/REQUIRE.md)", () => {
  it.each(requirementFormat)("%s satisfied by %s: %s", (requirement, standard, satisfied) => {
    const dash = requirement.indexOf("-");
    const pattern = requirement.slice(dash + 1).split(".");
    expect(satisfies(standard, requirement.slice(0, dash), pattern)).toBe(satisfied);
  });
});
