import { FlError } from "./primitives/error.js";

/** Codes of the Core errors (docs/standards/core/errors/README.md). */
export const ErrorCode = {
  Success: 0,
  CustomError: 1,
  SyntaxError: 2,
  OperationError: 3,
  TypeError: 4,
  UnknownSymbolError: 5,
  ArgumentError: 6,
  InvalidIndexError: 7,
  InvalidKeyError: 8,
  InvalidIdentifierError: 9,
  EnvironmentError: 10,
  NotSupportedError: 11,
  UndefinedError: 12,
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Factory of the errors of the Core standard. Codes and names are copied from the standard. */
export const Errors = {
  success: (message = "Operation completed successfully.") => new FlError(ErrorCode.Success, "SUCCESS", message),
  customError: (message = "Custom error.") => new FlError(ErrorCode.CustomError, "CUSTOM_ERROR", message),
  syntaxError: (message = "Syntax error.") => new FlError(ErrorCode.SyntaxError, "SYNTAX_ERROR", message),
  operationError: (message = "Operation error.") => new FlError(ErrorCode.OperationError, "OPERATION_ERROR", message),
  typeError: (message = "Invalid type.") => new FlError(ErrorCode.TypeError, "TYPE_ERROR", message),
  unknownSymbolError: (message = "Unknown symbol.") =>
    new FlError(ErrorCode.UnknownSymbolError, "UNKNOWN_SYMBOL_ERROR", message),
  argumentError: (message = "Invalid argument.") => new FlError(ErrorCode.ArgumentError, "ARGUMENT_ERROR", message),
  invalidIndexError: (message = "Index out of bounds.") =>
    new FlError(ErrorCode.InvalidIndexError, "INVALID_INDEX_ERROR", message),
  invalidKeyError: (message = "Invalid key.") => new FlError(ErrorCode.InvalidKeyError, "INVALID_KEY_ERROR", message),
  invalidIdentifierError: (message = "Invalid identifier.") =>
    new FlError(ErrorCode.InvalidIdentifierError, "INVALID_IDENTIFIER_ERROR", message),
  environmentError: (message = "Environment error.") =>
    new FlError(ErrorCode.EnvironmentError, "ENVIRONMENT_ERROR", message),
  notSupportedError: (message = "Not supported.") =>
    new FlError(ErrorCode.NotSupportedError, "NOT_SUPPORTED_ERROR", message),
  undefinedError: (message = "Variable has no value.") =>
    new FlError(ErrorCode.UndefinedError, "UNDEFINED_ERROR", message),
} as const;
