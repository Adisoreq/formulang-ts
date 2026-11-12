import type { IAbstractTree, IAbstractTreeNode } from "../../abstractions/structures.js";

export class AbstractTreeNode<T> implements IAbstractTreeNode<T> {
  readonly #children: AbstractTreeNode<T>[] = [];
  #parent: AbstractTreeNode<T> | undefined;

  constructor(
    readonly key: string,
    public value: T,
    parent?: AbstractTreeNode<T>,
  ) {
    if (parent !== undefined) this.setParent(parent);
  }

  get parent(): AbstractTreeNode<T> | undefined {
    return this.#parent;
  }

  get children(): readonly AbstractTreeNode<T>[] {
    return this.#children;
  }

  /** @throws {Error} if the node would become a child of itself or of its descendant. */
  setParent(parent: AbstractTreeNode<T>): void {
    if (parent === this || parent.isDescendantOf(this)) {
      throw new Error("A node cannot become a child of itself or of its descendant.");
    }
    this.removeParent();
    this.#parent = parent;
    parent.#children.push(this);
  }

  removeParent(): void {
    if (this.#parent !== undefined) {
      const siblings = this.#parent.#children;
      siblings.splice(siblings.indexOf(this), 1);
    }
    this.#parent = undefined;
  }

  isParentOf(node: IAbstractTreeNode<T>): boolean {
    return node.parent === this;
  }

  isChildOf(node: IAbstractTreeNode<T>): boolean {
    return this.#parent !== undefined && this.#parent === node;
  }

  isAncestorOf(node: IAbstractTreeNode<T>): boolean {
    return node.isDescendantOf(this);
  }

  isDescendantOf(node: IAbstractTreeNode<T>): boolean {
    for (let current = this.#parent as IAbstractTreeNode<T> | undefined; current; current = current.parent) {
      if (current === node) return true;
    }
    return false;
  }

  toString(): string {
    return this.key;
  }
}

/** Tree of uniquely keyed nodes. */
export class AbstractTree<T> implements IAbstractTree<T> {
  readonly #nodes = new Map<string, AbstractTreeNode<T>>();
  readonly root: AbstractTreeNode<T>;

  constructor(rootKey: string, rootValue: T) {
    this.root = new AbstractTreeNode(rootKey, rootValue);
    this.#nodes.set(rootKey, this.root);
  }

  containsNode(key: string): boolean {
    return this.#nodes.has(key);
  }

  getNode(key: string): AbstractTreeNode<T> | undefined {
    return this.#nodes.get(key);
  }

  /** @throws {Error} if the key already exists or the parent does not exist. */
  addNode(key: string, value: T, parentKey: string): AbstractTreeNode<T> {
    if (this.#nodes.has(key)) throw new Error(`Node with key '${key}' already exists.`);
    const parent = this.#nodes.get(parentKey);
    if (parent === undefined) throw new Error(`Parent node with key '${parentKey}' not found.`);
    const node = new AbstractTreeNode(key, value, parent);
    this.#nodes.set(key, node);
    return node;
  }

  /** Removes the node and its descendants; the root cannot be removed. */
  removeNode(key: string): boolean {
    const node = this.#nodes.get(key);
    if (node === undefined || node === this.root) return false;
    node.removeParent();
    const pending = [node];
    for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
      this.#nodes.delete(current.key);
      pending.push(...current.children);
    }
    return true;
  }
}
