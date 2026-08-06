/**
 * Sanitizes a `returnTo`/`returnLabel` query-param pair used by deep-link
 * entry points (e.g. CreativeWriter -> Reader View) that need to send the
 * user back to a non-hub context instead of the book's default subnav.
 */
export function safeReturnHref(value: string | undefined, fallbackBookId: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\n") || value.includes("\r")) {
    return `/books/${fallbackBookId}`;
  }
  return value;
}

export function safeReturnLabel(value: string | undefined, fallback = "Back to Book") {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > 48) return fallback;
  return trimmed;
}
