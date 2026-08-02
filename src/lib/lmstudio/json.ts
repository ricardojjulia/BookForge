import { jsonrepair } from "jsonrepair";

export function parseModelJson(content: string) {
  const trimmed = content.trim();

  if (!trimmed) {
    throw new Error("LM Studio returned an empty response.");
  }

  // Models frequently return otherwise-well-formed JSON where a prose field
  // (e.g. a rewritten paragraph) contains literal, unescaped newlines/tabs
  // instead of \n/\t — invalid per the JSON spec, and something jsonrepair
  // doesn't reliably fix since it can't tell a "broken" raw newline from
  // intentional multi-line formatting. Escaping raw control characters that
  // appear inside string literals (tracking quote/escape state) fixes this
  // dominant real-world failure mode without touching already-valid JSON.
  const sanitized = escapeRawControlCharsInStrings(trimmed);

  try {
    return JSON.parse(sanitized);
  } catch {
    const fenced = sanitized.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) return parseJsonCandidate(fenced);

    const firstObject = sanitized.indexOf("{");
    const lastObject = sanitized.lastIndexOf("}");
    if (firstObject >= 0 && lastObject > firstObject) {
      return parseJsonCandidate(sanitized.slice(firstObject, lastObject + 1));
    }

    const firstArray = sanitized.indexOf("[");
    const lastArray = sanitized.lastIndexOf("]");
    if (firstArray >= 0 && lastArray > firstArray) {
      return parseJsonCandidate(sanitized.slice(firstArray, lastArray + 1));
    }

    throw new Error("LM Studio response was not valid JSON.");
  }
}

function escapeRawControlCharsInStrings(text: string) {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (!inString) {
      if (ch === '"') inString = true;
      result += ch;
      continue;
    }
    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      result += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = false;
      result += ch;
      continue;
    }
    if (ch === "\n") { result += "\\n"; continue; }
    if (ch === "\r") { result += "\\r"; continue; }
    if (ch === "\t") { result += "\\t"; continue; }
    result += ch;
  }
  return result;
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
