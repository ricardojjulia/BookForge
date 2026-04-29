import { jsonrepair } from "jsonrepair";

export function parseModelJson(content: string) {
  const trimmed = content.trim();

  if (!trimmed) {
    throw new Error("LM Studio returned an empty response.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) return parseJsonCandidate(fenced);

    const firstObject = trimmed.indexOf("{");
    const lastObject = trimmed.lastIndexOf("}");
    if (firstObject >= 0 && lastObject > firstObject) {
      return parseJsonCandidate(trimmed.slice(firstObject, lastObject + 1));
    }

    const firstArray = trimmed.indexOf("[");
    const lastArray = trimmed.lastIndexOf("]");
    if (firstArray >= 0 && lastArray > firstArray) {
      return parseJsonCandidate(trimmed.slice(firstArray, lastArray + 1));
    }

    throw new Error("LM Studio response was not valid JSON.");
  }
}

export function parseModelJsonOrFallback(content: string, fallback: (raw: string, error: string) => unknown) {
  try {
    return sanitizeForJsonb(parseModelJson(content));
  } catch (error) {
    return sanitizeForJsonb(
      fallback(sanitizeString(content.trim()).slice(0, 20000), error instanceof Error ? error.message : "Invalid model JSON."),
    );
  }
}

function parseJsonCandidate(candidate: string) {
  try {
    return JSON.parse(candidate);
  } catch {
    return JSON.parse(jsonrepair(candidate));
  }
}

function sanitizeForJsonb(value: unknown): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeForJsonb(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        sanitizeString(key),
        sanitizeForJsonb(item),
      ]),
    );
  }
  return value;
}

function sanitizeString(value: string) {
  return value.replace(/\u0000/g, "").replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
}
