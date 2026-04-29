export async function fetchJson<T = unknown>(
  path: string,
  options: RequestInit = {},
  label = "request",
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, options);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "network request failed";
    const online =
      typeof navigator === "undefined" || navigator.onLine ? "browser reports online" : "browser reports offline";
    throw new Error(`${label} could not reach ${path}. ${detail}. ${online}. Refresh the page and try again.`);
  }

  const result = await readResponseJson(response);
  if (!response.ok) {
    const message =
      result && typeof result === "object" && "error" in result
        ? String((result as { error: unknown }).error)
        : `${label} failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  return result as T;
}

async function readResponseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 500) };
  }
}
