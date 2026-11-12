import { describe, expect, it } from "vitest";
import {
  AbstractTree,
  ArgumentTemplate,
  Associativity,
  Constant,
  ContainerType,
  Context,
  ContextType,
  Environment,
  ErrorCode,
  Errors,
  Executor,
  FlFunction,
  FlObject,
  FunctionOverload,
  type IEnvironment,
  type IValue,
  OperatorType,
  Operators,
  TypeNames,
  Types,
  Value,
  Variable,
  isOperatorSpelling,
  operatorList,
} from "../../src/index.js";

const N = (n: number): IValue => Value.number(n);
const T = (t: string): IValue => Value.text(t);
const max = (values: readonly IValue[]): number => Math.max(...values.map((v) => v.raw as number));

function createMax(): FlFunction {
  return new FlFunction("MAX", [
    new FunctionOverload([ArgumentTemplate.of("a", Types.Number), ArgumentTemplate.of("b", Types.Number)], (args) =>
      Value.number(max(args)),
    ),
    new FunctionOverload([ArgumentTemplate.of("numbers", Types.Number, { multiple: true })], (args) =>
      Value.number(max(args)),
    ),
    new FunctionOverload([ArgumentTemplate.of("numbers", Types.Array)], (args) =>
      Value.number(max(args[0]!.raw as IValue[])),
    ),
  ]);
}

const context = Context.create(Environment.create());

// docs/implementation/argument_template.md, docs/implementation/argument_collection_template.md
describe("Functions and argument templates", () => {
  it("uses the first matching overload", () => {
    const fn = createMax();
    expect(fn.invoke([N(3), N(5)], context).raw).toBe(5);
    expect(fn.invoke([N(5), N(15), N(25), N(10), N(20)], context).raw).toBe(25);
    expect(fn.invoke([Value.array([N(15), N(25), N(20)])], context).raw).toBe(25);
  });

  it("does not match an argument of another type", () => {
    const abs = new FlFunction("ABS", [
      new FunctionOverload([ArgumentTemplate.of("num", Types.Number)], (args) =>
        Value.number(Math.abs(args[0]!.raw as number)),
      ),
    ]);
    const code = (args: IValue[]): number | undefined => (abs.invoke(args, context) as Value).asError()?.code;
    expect(code([T("x"), N(5)])).toBe(ErrorCode.ArgumentError);
    expect(code([N(5), T("x")])).toBe(ErrorCode.ArgumentError);
    expect(code([])).toBe(ErrorCode.ArgumentError);
    expect(abs.invoke([N(-5)], context).raw).toBe(5);
  });

  it("propagates the leftmost Error argument when no overload matches", () => {
    const first = Value.error(Errors.customError("first"));
    const second = Value.error(Errors.customError("second"));
    expect(createMax().invoke([N(1), first, second], context)).toBe(first);
  });

  it("matches an optional multiple template with no arguments", () => {
    const overload = new FunctionOverload(
      [ArgumentTemplate.any("elements", { optional: true, multiple: true })],
      (args) => Value.array(args),
    );
    expect(overload.matches([], context)).toBe(true);
    expect(overload.matches([N(3), T("a")], context)).toBe(true);
  });

  it("requires one argument for a required multiple template", () => {
    const overload = new FunctionOverload([ArgumentTemplate.of("numbers", Types.Number, { multiple: true })], () =>
      Value.null(),
    );
    expect(overload.matches([], context)).toBe(false);
    expect(overload.matches([N(1), T("a")], context)).toBe(false);
  });

  it("matches an optional argument", () => {
    const overload = new FunctionOverload(
      [ArgumentTemplate.of("array", Types.Array), ArgumentTemplate.of("separator", Types.Text, { optional: true })],
      () => Value.null(),
    );
    const array = Value.array([N(1)]);
    expect(overload.matches([array], context)).toBe(true);
    expect(overload.matches([array, T("-")], context)).toBe(true);
    expect(overload.matches([array, T("-"), T("x")], context)).toBe(false);
  });

  it("rejects invalid templates", () => {
    expect(
      () =>
        new FunctionOverload(
          [ArgumentTemplate.of("a", Types.Number, { multiple: true }), ArgumentTemplate.of("b", Types.Number)],
          () => Value.null(),
        ),
    ).toThrow(TypeError);
    expect(
      () =>
        new FunctionOverload(
          [ArgumentTemplate.of("a", Types.Number, { optional: true }), ArgumentTemplate.of("b", Types.Number)],
          () => Value.null(),
        ),
    ).toThrow(TypeError);
  });

  it("matches extended types with themselves, their parents and Object (docs/semantics/inheritance.md)", () => {
    const environment = Environment.create();
    environment.registerExtendedType("Geometry.Shape");
    environment.registerExtendedType("Geometry.Circle", "Geometry.Shape");
    const ctx = Context.create(environment);
    const circle = Value.object(new FlObject(), "Geometry.Circle");
    const plain = Value.object(new FlObject());
    const shape = new FunctionOverload([ArgumentTemplate.of("s", Types.of("Object", "Geometry.Shape"))], () =>
      Value.null(),
    );
    const object = new FunctionOverload([ArgumentTemplate.of("o", Types.Object)], () => Value.null());
    const circleOnly = new FunctionOverload([ArgumentTemplate.of("c", Types.of("Object", "Geometry.Circle"))], () =>
      Value.null(),
    );
    expect(shape.matches([circle], ctx)).toBe(true);
    expect(object.matches([circle], ctx)).toBe(true);
    expect(circleOnly.matches([circle], ctx)).toBe(true);
    expect(shape.matches([plain], ctx)).toBe(false);
    expect(shape.matches([N(1)], ctx)).toBe(false);
  });

  it("is a Delegate value", () => {
    const fn = createMax();
    expect(fn.getValue().type.base).toBe(TypeNames.Delegate);
    expect(fn.getValue().toString()).toBe("MAX(args) => any");
  });

  it("describes templates in the notation of the standard", () => {
    expect(ArgumentTemplate.of("numbers", Types.Number, { multiple: true }).toString()).toBe("...numbers <Number>");
    expect(ArgumentTemplate.arrayOf("values", Types.Number, { optional: true }).toString()).toBe(
      "values? <Array<Number>>",
    );
    expect(ArgumentTemplate.any("value").toString()).toBe("value <Any>");
  });
});

// docs/core/context.md, "Context types"
describe("Custom context types", () => {
  const close = [10, 12, 11, 15];

  /** A context type with its own constants: CLOSE, N and I. */
  class CandleContext extends Context {
    loadCount = 0;

    constructor(environment: IEnvironment) {
      super(environment, ContextType.Persistent);
    }

    protected override loadContextData(): void {
      this.loadCount++;
      this.setConstant(
        "CLOSE",
        Value.array(
          close.map((c) => Value.number(c)),
          "CLOSE",
        ),
      );
      this.setConstant("N", Value.number(close.length, "N"));
      this.setConstant("I", Value.number(0, "I"));
    }

    moveTo(iteration: number): void {
      this.setConstant("I", Value.number(iteration, "I"));
    }
  }

  it("loads the context constants before the first execution", () =>
    expect(
      Executor.create().execute("CLOSE[N - 1] - CLOSE[0]", new CandleContext(Environment.create())).value.toString(),
    ).toBe("5"));

  it("keeps the variables while the host moves the iteration", () => {
    const ctx = new CandleContext(Environment.create());
    const executor = Executor.create();
    const results = close.map((_, i) => {
      ctx.moveTo(i);
      return executor.execute("$sum := 0\n$sum = $sum + CLOSE[I]\n$sum / (I + 1)", ctx).value.toString();
    });
    expect(results).toEqual(["10", "11", "11", "12"]);
    expect(ctx.loadCount).toBe(1);
  });

  it("does not let a formula change a context constant", () => {
    const ctx = new CandleContext(Environment.create());
    const result = Executor.create().execute("SET(N, 1)", ctx);
    expect(result.error.code).toBe(ErrorCode.ArgumentError);
    expect(ctx.getProperty("N")?.getValue().toString()).toBe("4");
  });

  it("does not know the constants of another context type", () =>
    expect(Executor.create().execute("CLOSE[0]", Environment.create()).error.code).toBe(ErrorCode.UnknownSymbolError));

  it("replaces a constant with setConstant", () => {
    const object = new FlObject();
    object.setConstant("X", Value.number(1));
    object.setConstant("X", Value.text("a"));
    expect(object.getProperty("X")?.containerType).toBe(ContainerType.Constant);
    expect(object.getProperty("X")?.getValue().toString()).toBe("a");
  });
});

// docs/core/primitives.md, docs/core/containers.md, docs/core/values.md
describe("Primitives", () => {
  it("are immutable values", () => {
    const value = Value.number(1);
    expect(value.setValue(Value.number(2)).isFailed()).toBe(true);
    expect(value.raw).toBe(1);
    expect(Object.isFrozen(value)).toBe(true);
  });

  it("keep the type of the stored value in a variable", () => {
    const x = new Variable("x");
    expect(x.type.isUndefined()).toBe(true);
    expect(x.setValue(Value.number(3)).isSuccess()).toBe(true);
    expect(x.type.base).toBe(TypeNames.Number);
    expect(x.expression).toBe("3");
    expect(x.setValue(Value.text("a")).code).toBe(ErrorCode.TypeError);
  });

  it("return UNDEFINED_ERROR for a variable without a value", () => {
    const x = new Variable("x");
    expect(x.canAccessValue).toBe(false);
    const value = x.getValue();
    expect(value.type.base).toBe(TypeNames.Error);
    expect((value as Value).asError()?.code).toBe(ErrorCode.UndefinedError);
  });

  it("check access without throwing", () => {
    expect(Value.null().canAccessValue).toBe(true);
    expect(new Variable("x", Value.number(1)).canUpdateValue.isSuccess()).toBe(true);
    expect(new Constant("C", Value.number(1)).canUpdateValue.isFailed()).toBe(true);
  });

  it("give typed access to the raw value", () => {
    const text = Value.text("a");
    expect(text.asNumber()).toBeUndefined();
    expect(text.asText()).toBe("a");
    expect(Value.boolean(false).asBoolean()).toBe(false);
    const object = new FlObject();
    expect(Value.object(object).asObject()).toBe(object);
  });

  it("classify the types by value semantics", () => {
    expect(Types.Error.isSimple()).toBe(false);
    expect(Types.Error.isComplex()).toBe(true);
    expect(Types.Delegate.isComplex()).toBe(true);
    expect(Types.Text.isSimple()).toBe(true);
    expect(Types.of("Object", "Stock.Candle").toString()).toBe("Object<Stock.Candle>");
  });

  it("serialize simple values", () => {
    expect(Value.null().toString()).toBe("null");
    expect(Value.boolean(true).toString()).toBe("true");
    expect(Value.boolean(false).toString()).toBe("false");
    expect(Value.text("This is text value").toString()).toBe("This is text value");
    expect(Value.error(Errors.customError("You've reached a breakpoint.")).toString()).toBe(
      "[CUSTOM_ERROR (1)] You've reached a breakpoint.",
    );
  });

  it("serialize arrays", () => {
    expect(Value.array(Array.from({ length: 10 }, (_, i) => N(i + 1))).toString()).toBe(
      "[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]",
    );
    expect(Value.array([T("abc"), T('d"f')]).toString()).toBe('["abc", "d\\"f"]');
    expect(Value.array([]).toString()).toBe("[]");
  });

  it("serialize objects", () => {
    const object = new FlObject();
    object.initConstant("name", T("John"));
    object.initVariable("age", N(24));
    expect(Value.object(object).toString()).toBe('{ name: "John", age: 24 }');
    expect(object.toString()).toBe('{ name: "John", age: 24 }');
  });

  it("build abstract trees", () => {
    const tree = new AbstractTree<string>("Object", "Object");
    tree.addNode("Geometry.Shape", "Geometry.Shape", "Object");
    tree.addNode("Geometry.Circle", "Geometry.Circle", "Geometry.Shape");
    const circle = tree.getNode("Geometry.Circle")!;
    expect(circle.isDescendantOf(tree.root)).toBe(true);
    expect(tree.root.isAncestorOf(circle)).toBe(true);
    expect(circle.isChildOf(tree.getNode("Geometry.Shape")!)).toBe(true);
    expect(tree.root.isChildOf(circle)).toBe(false);
    expect(() => tree.addNode("Geometry.Circle", "x", "Object")).toThrow();
    expect(tree.removeNode("Object")).toBe(false);
    expect(tree.removeNode("Geometry.Shape")).toBe(true);
    expect(tree.containsNode("Geometry.Circle")).toBe(false);
    expect(tree.root.children).toHaveLength(0);
  });
});

// Identifiers copied from the standard
describe("Definitions of the standard", () => {
  it("has the codes and names of the Core error list", () => {
    const expected: [number, string, ReturnType<typeof Errors.success>][] = [
      [0, "SUCCESS", Errors.success()],
      [1, "CUSTOM_ERROR", Errors.customError()],
      [2, "SYNTAX_ERROR", Errors.syntaxError()],
      [3, "OPERATION_ERROR", Errors.operationError()],
      [4, "TYPE_ERROR", Errors.typeError()],
      [5, "UNKNOWN_SYMBOL_ERROR", Errors.unknownSymbolError()],
      [6, "ARGUMENT_ERROR", Errors.argumentError()],
      [7, "INVALID_INDEX_ERROR", Errors.invalidIndexError()],
      [8, "INVALID_KEY_ERROR", Errors.invalidKeyError()],
      [9, "INVALID_IDENTIFIER_ERROR", Errors.invalidIdentifierError()],
      [10, "ENVIRONMENT_ERROR", Errors.environmentError()],
      [11, "NOT_SUPPORTED_ERROR", Errors.notSupportedError()],
      [12, "UNDEFINED_ERROR", Errors.undefinedError()],
    ];
    for (const [code, name, error] of expected) expect([error.code, error.name]).toEqual([code, name]);
  });

  it("has the operator spellings of the operator length table", () => {
    const expected = [
      "$",
      "@",
      ";",
      "=",
      "(",
      ")",
      "[",
      "]",
      "{",
      "}",
      '"',
      ",",
      ":",
      ".",
      ">",
      "<",
      "+",
      "-",
      "*",
      "/",
      "%",
      "^",
      "!",
      ":=",
      "?=",
      "=>",
      "&&",
      "||",
      ">=",
      "<=",
      "==",
      "<>",
      "!=",
    ];
    const spellings = [...new Set(operatorList.map((o) => o.symbol))].filter((s) => s !== "\n");
    expect(spellings.sort()).toEqual([...expected].sort());
    expect(isOperatorSpelling("#")).toBe(false);
  });

  it("has the binding powers in the order of the standard", () => {
    const lowestToHighest = [
      [Operators.setVariable, Operators.initVariable, Operators.conditionalSetVariable],
      [Operators.lambda],
      [Operators.or],
      [Operators.and],
      [
        Operators.equal,
        Operators.notEqualA,
        Operators.notEqualB,
        Operators.lesser,
        Operators.lesserOrEqual,
        Operators.greater,
        Operators.greaterOrEqual,
      ],
      [Operators.add, Operators.subtract],
      [Operators.multiply, Operators.divide, Operators.modulo],
      [Operators.power],
      [Operators.negate, Operators.not],
      [Operators.dot, Operators.openSquareBracket, Operators.openCircleBracket],
      [Operators.contextSigil, Operators.environmentSigil],
    ];
    lowestToHighest.forEach((level, i) => level.forEach((op) => expect(op.priority, op.symbol).toBe(i + 1)));
  });

  it("has the associativity of the standard", () => {
    expect(Operators.power.associativity).toBe(Associativity.Right);
    expect(Operators.setVariable.associativity).toBe(Associativity.Right);
    expect(Operators.lambda.associativity).toBe(Associativity.Right);
    expect(Operators.lesser.associativity).toBe(Associativity.None);
    expect(Operators.subtract.associativity).toBe(Associativity.Left);
  });

  it("does not treat sequence boundaries as expression operators", () => {
    expect(Operators.newLine.type).toBe(OperatorType.Boundary);
    expect(Operators.terminator.type).toBe(OperatorType.Boundary);
  });

  it("has the constants and variables of the Core environment", () => {
    const environment = Environment.create();
    const raw = (name: string): unknown => environment.getProperty(name)?.getValue().raw;
    expect(environment.supports("core-0.3")).toBe(true);
    expect(environment.getProperty("STANDARDS")?.getValue().toString()).toBe('["core-0.3"]');
    expect(raw("E")).toBe(Math.E);
    expect(raw("PI")).toBe(Math.PI);
    expect(raw("PHI")).toBeCloseTo(1.618033988749894, 14);
    expect(raw("array_indexing")).toBe(0);
    expect(raw("suppress_errors")).toBe(false);
    expect(environment.getProperty("PI")?.mutable).toBe(false);
    expect(environment.getProperty("array_indexing")?.mutable).toBe(true);
  });

  it("does not let the environment constants change", () => {
    const environment = Environment.create();
    expect(environment.setProperty("PI", Value.number(3)).code).toBe(ErrorCode.EnvironmentError);
    expect(environment.setProperty("array_indexing", Value.number(1)).isSuccess()).toBe(true);
  });

  it("adds a registered standard to STANDARDS", () => {
    const environment = Environment.create();
    environment.registerStandard("stock-0.1");
    expect(environment.supports("stock-0.1")).toBe(true);
    expect(environment.getProperty("STANDARDS")?.getValue().toString()).toBe('["core-0.3", "stock-0.1"]');
  });

  it("rejects a function that is already defined", () =>
    expect(() => Environment.create().registerFunction(createMax())).toThrow('Function "MAX" is already defined.'));
});
