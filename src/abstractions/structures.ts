/**
 * Contracts of the environment, contexts, standards and the extended type tree.
 *
 * @see https://github.com/Adisoreq/FormuLang/blob/main/docs/core/environment.md
 * @see https://github.com/Adisoreq/FormuLang/blob/main/docs/core/context.md
 * @module
 */
import type { IFunction } from "./functions.js";
import type { IObject } from "./primitives.js";

/** Lifetime of a context (docs/core/context.md, "Context types"). */
export const ContextType = {
  /** Created for a single execution and disposed after it. */
  Disposable: "Disposable",
  /** Kept by the host application and reused across executions. */
  Persistent: "Persistent",
} as const;
export type ContextType = (typeof ContextType)[keyof typeof ContextType];

/** Node of an {@link IAbstractTree}. */
export interface IAbstractTreeNode<T> {
  readonly value: T;
  /** Unique identifier of the node within the tree. */
  readonly key: string;
  /** Parent node; `undefined` for the root or an orphaned node. */
  readonly parent: IAbstractTreeNode<T> | undefined;
  readonly children: readonly IAbstractTreeNode<T>[];
  isParentOf(node: IAbstractTreeNode<T>): boolean;
  isChildOf(node: IAbstractTreeNode<T>): boolean;
  isAncestorOf(node: IAbstractTreeNode<T>): boolean;
  isDescendantOf(node: IAbstractTreeNode<T>): boolean;
}

/** Tree of uniquely keyed nodes, e.g. the inheritance hierarchy of extended types. */
export interface IAbstractTree<T> {
  readonly root: IAbstractTreeNode<T>;
  containsNode(key: string): boolean;
  getNode(key: string): IAbstractTreeNode<T> | undefined;
}

/**
 * The environment is a layer between the host application and the user: it provides the supported standards,
 * their functions and extended types, the environment constants and the default environment variables.
 */
export interface IEnvironment extends IObject {
  /** Identifiers of the supported standards, e.g. `core-1.0`. */
  readonly standards: readonly string[];
  supports(standard: string): boolean;
  readonly extendedTypes: readonly string[];
  /** Inheritance hierarchy of the extended types; its root is `Object`. */
  readonly extendedTypeTree: IAbstractTree<string>;
  /** Named functions and procedures of the supported standards. */
  readonly functions: readonly IFunction[];
  /** A named function or procedure, or `undefined` if no supported standard defines it. */
  getFunction(name: string): IFunction | undefined;
}

/** Data of a formula execution. The context itself stores the context (`$`) variables and the context constants. */
export interface IContext extends IObject {
  readonly environment: IEnvironment;
  /** Copies of the environment (`@`) variables, made during pre-execution. A formula changes only these copies. */
  readonly environmentVariables: IObject;
  readonly contextType: ContextType;
  /**
   * Pre-execution (docs/semantics/pre-execution.md): loads the data of the context type once, then copies
   * the environment variables that the context does not have yet.
   */
  preExecute(): void;
}

export interface IStandardVersion {
  /** `major.minor` */
  readonly version: string;
  readonly major: number;
  readonly minor: number;
}

/** A standard (Core or an extension) that an environment can support. */
export interface IStandard {
  /** `core`, `stock` */
  readonly id: string;
  readonly version: IStandardVersion;
  readonly name: string;
  /** Extended types defined by the standard, parents before children. */
  readonly extendedTypes: readonly string[];
  readonly extendedTypeTree: IAbstractTree<string>;
  readonly namedFunctions: readonly IFunction[];
}
