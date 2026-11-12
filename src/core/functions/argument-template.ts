import type { IArgumentTemplate } from "../../abstractions/functions.js";
import type { IError, IType, IValue } from "../../abstractions/primitives.js";
import type { IEnvironment } from "../../abstractions/structures.js";
import { Errors } from "../errors.js";
import { TypeNames, Types } from "../primitives/types.js";

export interface ArgumentTemplateOptions {
  /** The argument may be omitted. */
  readonly optional?: boolean;
  /** The template is applied to the rest of the arguments. */
  readonly multiple?: boolean;
}

/** Immutable {@link IArgumentTemplate}. Create templates with the static factories. */
export class ArgumentTemplate implements IArgumentTemplate {
  private constructor(
    readonly name: string,
    readonly type: IType,
    readonly elementType: IType | undefined,
    readonly anyType: boolean,
    readonly multiple: boolean,
    readonly optional: boolean,
  ) {
    Object.freeze(this);
  }

  /** An argument of the type, e.g. `ArgumentTemplate.of("a", Types.Number)`. */
  static of(name: string, type: IType, options: ArgumentTemplateOptions = {}): ArgumentTemplate {
    return new ArgumentTemplate(name, type, undefined, false, options.multiple ?? false, options.optional ?? false);
  }

  /** An Array whose every element has the base type, e.g. `Array<Number>`. */
  static arrayOf(
    name: string,
    elementType: IType,
    options: Omit<ArgumentTemplateOptions, "multiple"> = {},
  ): ArgumentTemplate {
    return new ArgumentTemplate(name, Types.Array, elementType, false, false, options.optional ?? false);
  }

  /** An argument of any type, including an Error. */
  static any(name: string, options: ArgumentTemplateOptions = {}): ArgumentTemplate {
    return new ArgumentTemplate(
      name,
      Types.Undefined,
      undefined,
      true,
      options.multiple ?? false,
      options.optional ?? false,
    );
  }

  /** `...name? <Type>` */
  toString(): string {
    const type = this.anyType
      ? "Any"
      : this.elementType !== undefined
        ? `Array<${this.elementType.base}>`
        : (this.type.extended ?? this.type.base);
    return `${this.multiple ? "..." : ""}${this.name}${this.optional ? "?" : ""} <${type}>`;
  }
}

/**
 * Rules of argument collection templates (docs/implementation/argument_collection_template.md):
 * only the last template can be multiple, and required templates stand before the optional ones.
 */
export function validateTemplates(templates: readonly IArgumentTemplate[]): IError {
  for (let i = 0; i < templates.length; i++) {
    const template = templates[i]!;
    if (template.multiple && i !== templates.length - 1) {
      return Errors.argumentError("Only the last argument template can be multiple.");
    }
    if (i > 0 && templates[i - 1]!.optional && !template.optional) {
      return Errors.argumentError("All required argument templates must stand before the optional ones.");
    }
  }
  return Errors.success();
}

/** Whether a value matches an argument template (docs/implementation/argument_template.md). */
export function matchesTemplate(value: IValue, template: IArgumentTemplate, environment: IEnvironment): boolean {
  if (template.anyType) return true;
  if (template.elementType !== undefined) {
    const base = template.elementType.base;
    return (
      value.type.base === TypeNames.Array &&
      Array.isArray(value.raw) &&
      (value.raw as IValue[]).every((element) => element.type.base === base)
    );
  }
  const valueType = value.type;
  const templateType = template.type;
  // Without an extended type the base types must match: every extended type derives from Object
  if (!templateType.hasExtension()) return valueType.base === templateType.base;
  // With an extended type: the same extended type or a type derived from it
  if (!valueType.hasExtension() || valueType.base !== templateType.base) return false;
  if (valueType.extended === templateType.extended) return true;
  const tree = environment.extendedTypeTree;
  const node = tree.getNode(valueType.extended!);
  const ancestor = tree.getNode(templateType.extended!);
  return node !== undefined && ancestor !== undefined && node.isDescendantOf(ancestor);
}

/** Whether the arguments match an argument collection template. Every argument must be consumed. */
export function matchesTemplates(
  values: readonly IValue[],
  templates: readonly IArgumentTemplate[],
  environment: IEnvironment,
): boolean {
  let a = 0;
  for (const template of templates) {
    if (template.multiple) {
      let consumed = 0;
      for (; a < values.length; a++, consumed++) {
        if (!matchesTemplate(values[a]!, template, environment)) return false;
      }
      if (consumed === 0 && !template.optional) return false;
      continue;
    }
    if (a >= values.length) {
      if (!template.optional) return false;
      continue;
    }
    if (!matchesTemplate(values[a]!, template, environment)) return false;
    a++;
  }
  return a === values.length;
}
