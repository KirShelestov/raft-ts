import type { LogEntry } from "../core/types.js";

export class InvalidMessageError extends Error {
  override readonly name = "InvalidMessageError";
}

export type Fields = Readonly<Record<string, unknown>>;

export function asFields(value: unknown, what: string): Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidMessageError(`${what} must be a JSON object`);
  }
  return value as Fields;
}

export function readNonNegativeInteger(fields: Fields, key: string): number {
  const value = fields[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new InvalidMessageError(`"${key}" must be a non-negative integer`);
  }
  return value;
}

export function readNodeId(fields: Fields, key: string): string {
  const value = fields[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new InvalidMessageError(`"${key}" must be a non-empty string`);
  }
  return value;
}

export function readNullableNodeId(fields: Fields, key: string): string | null {
  return fields[key] === null ? null : readNodeId(fields, key);
}

export function readBoolean(fields: Fields, key: string): boolean {
  const value = fields[key];
  if (typeof value !== "boolean") {
    throw new InvalidMessageError(`"${key}" must be a boolean`);
  }
  return value;
}

export function parseLogEntries(value: unknown, key = "entries"): LogEntry[] {
  if (!Array.isArray(value)) {
    throw new InvalidMessageError(`"${key}" must be an array`);
  }
  return value.map((item, position) => {
    const fields = asFields(item, `${key}[${position}]`);
    if (!("command" in fields)) {
      throw new InvalidMessageError(`${key}[${position}] must contain "command"`);
    }
    return { term: readNonNegativeInteger(fields, "term"), command: fields["command"] };
  });
}
