import type { IFunction } from "../../abstractions/functions.js";
import type { IAbstractTree, IStandard, IStandardVersion } from "../../abstractions/structures.js";

/** Version of a standard: `major.minor`. */
export class StandardVersion implements IStandardVersion {
  constructor(
    readonly major: number,
    readonly minor: number,
  ) {
    Object.freeze(this);
  }

  get version(): string {
    return `${this.major}.${this.minor}`;
  }

  toString(): string {
    return this.version;
  }
}

export interface StandardDefinition {
  readonly id: string;
  readonly version: IStandardVersion;
  readonly name: string;
  readonly extendedTypes: readonly string[];
  readonly extendedTypeTree: IAbstractTree<string>;
  readonly namedFunctions: readonly IFunction[];
}

/** A standard defined by data. */
export class Standard implements IStandard {
  readonly id: string;
  readonly version: IStandardVersion;
  readonly name: string;
  readonly extendedTypes: readonly string[];
  readonly extendedTypeTree: IAbstractTree<string>;
  readonly namedFunctions: readonly IFunction[];

  constructor(definition: StandardDefinition) {
    this.id = definition.id;
    this.version = definition.version;
    this.name = definition.name;
    this.extendedTypes = Object.freeze([...definition.extendedTypes]);
    this.extendedTypeTree = definition.extendedTypeTree;
    this.namedFunctions = Object.freeze([...definition.namedFunctions]);
  }
}

/** Identifier of a standard: `<id>-<major>.<minor>`, e.g. `core-0.3`. */
export function standardIdentifier(standard: IStandard): string {
  return `${standard.id}-${standard.version.version}`;
}
