export function getLmStudioErrorMessage(error: unknown, fallback: string) {
  const message = extractErrorMessage(error);

  if (/model unloaded/i.test(message)) {
    return [
      "LM Studio says the selected model is unloaded.",
      "Open LM Studio, load the configured model for this task, or choose a loaded model in Settings.",
    ].join(" ");
  }

  if (/model.*not.*found|not found.*model|unknown model/i.test(message)) {
    return [
      "LM Studio could not find the selected model.",
      "Choose one of the models shown in Settings, then save and retry.",
    ].join(" ");
  }

  if (/ECONNREFUSED|fetch failed|connection refused|Failed to fetch/i.test(message)) {
    return "BookForge could not reach LM Studio. Start the LM Studio local server and retry.";
  }

  return message || fallback;
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "";
}
