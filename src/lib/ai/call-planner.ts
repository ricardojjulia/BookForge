export type AiCallPlan = {
  estimatedInputTokens: number;
  usableContextTokens: number;
  targetTokensPerCall: number;
  expectedCalls: number;
  estimatedSecondsPerCall: number;
  estimatedTotalSeconds: number;
  unitStrategy: "paragraphs" | "scenes" | "chapters" | "summaries";
  modelSizeB: number | null;
  quantization: string | null;
  speedBias: number;
  math: string;
  warnings: string[];
};

export function estimateAiCallPlan(input: {
  task: "book-bible" | "critic" | "revision";
  selectedModel: string;
  qualityProfile: string;
  contextWindowTokens: number;
  maxOutputTokens: number;
  chapterCount: number;
  sceneCount: number;
  paragraphCount: number;
  // Real median seconds-per-unit from completed jobs of this same task,
  // pooled across all users (see src/lib/ai/estimation-history.ts). The
  // formula below only knows local LM Studio token throughput, so it's
  // systematically wrong for cloud providers -- prefer real outcomes once
  // enough of them exist.
  historicalSecondsPerCall?: number | null;
}) {
  const modelSizeB = getModelSizeB(input.selectedModel);
  const quantization = getQuantization(input.selectedModel);
  const speedBias = getSpeedBias(input.qualityProfile, modelSizeB, quantization);
  const estimatedInputTokens = estimateManuscriptTokens(input);
  const reservedTokens = Math.max(1800, input.maxOutputTokens + 1400);
  const rawUsableContext = Math.max(1000, input.contextWindowTokens - reservedTokens);
  const usableContextTokens = Math.max(800, Math.floor(rawUsableContext * speedBias));
  const targetTokensPerCall = Math.max(700, Math.floor(usableContextTokens * taskContextShare(input.task)));
  const expectedCalls = Math.max(1, Math.ceil(estimatedInputTokens / targetTokensPerCall));
  const usingHistoricalEstimate = Boolean(input.historicalSecondsPerCall);
  const estimatedSecondsPerCall =
    input.historicalSecondsPerCall || estimateSecondsPerCall(targetTokensPerCall, modelSizeB, quantization);
  const estimatedTotalSeconds = Math.ceil(estimatedSecondsPerCall * expectedCalls);
  const unitStrategy = pickUnitStrategy(input, targetTokensPerCall);

  const warnings = [
    ...(input.task !== "critic" && expectedCalls > Math.max(1, input.chapterCount)
      ? ["Planner is intentionally using more AI calls than chapters to keep local-model context smaller and faster."]
      : []),
    ...(modelSizeB && modelSizeB >= 30
      ? ["Large local model detected. Smaller chunks are preferred to reduce latency and failure risk."]
      : []),
    ...(quantization && /q2|q3/i.test(quantization)
      ? ["Low quantization detected. Smaller calls help preserve output quality."]
      : []),
  ];

  return {
    estimatedInputTokens,
    usableContextTokens,
    targetTokensPerCall,
    expectedCalls,
    estimatedSecondsPerCall,
    estimatedTotalSeconds,
    unitStrategy,
    modelSizeB,
    quantization,
    speedBias,
    warnings,
    math: [
      `estimatedInputTokens = max(paragraphs*85, scenes*650, chapters*2200) = ${estimatedInputTokens}`,
      `reservedTokens = max(1800, maxOutputTokens + 1400) = ${reservedTokens}`,
      `rawUsableContext = contextWindowTokens - reservedTokens = ${rawUsableContext}`,
      `speedBias(${input.qualityProfile}, ${modelSizeB || "unknown"}B, ${quantization || "unknown"}) = ${speedBias.toFixed(2)}`,
      `usableContextTokens = rawUsableContext * speedBias = ${usableContextTokens}`,
      `targetTokensPerCall = usableContextTokens * taskShare(${input.task}) = ${targetTokensPerCall}`,
      `expectedCalls = ceil(estimatedInputTokens / targetTokensPerCall) = ${expectedCalls}`,
      usingHistoricalEstimate
        ? `estimatedSecondsPerCall = real median from past completed runs of this task = ${estimatedSecondsPerCall}`
        : `estimatedSecondsPerCall = local throughput estimate(${modelSizeB || "unknown"}B, ${quantization || "unknown"}) = ${estimatedSecondsPerCall} (no history yet for this task)`,
      `estimatedTotalSeconds = estimatedSecondsPerCall * expectedCalls = ${estimatedTotalSeconds}`,
    ].join("\n"),
  } satisfies AiCallPlan;
}

function estimateManuscriptTokens(input: {
  task: "book-bible" | "critic" | "revision";
  chapterCount: number;
  sceneCount: number;
  paragraphCount: number;
}) {
  if (input.task === "critic") {
    return Math.max(input.chapterCount * 180, input.sceneCount * 45, 900);
  }

  return Math.max(
    input.paragraphCount * 85,
    input.sceneCount * 650,
    input.chapterCount * 2200,
    1200,
  );
}

function taskContextShare(task: "book-bible" | "critic" | "revision") {
  if (task === "critic") return 0.72;
  if (task === "book-bible") return 0.58;
  return 0.52;
}

function getSpeedBias(profile: string, modelSizeB: number | null, quantization: string | null) {
  let bias = profile === "fast" ? 0.74 : profile === "premium" ? 0.62 : 0.68;

  if (modelSizeB && modelSizeB >= 70) bias -= 0.12;
  else if (modelSizeB && modelSizeB >= 30) bias -= 0.08;
  else if (modelSizeB && modelSizeB <= 14) bias += 0.06;

  if (quantization) {
    if (/q2|q3/i.test(quantization)) bias -= 0.08;
    if (/q4/i.test(quantization)) bias -= 0.04;
    if (/q5|q6|q8/i.test(quantization)) bias += 0.02;
  }

  return Math.min(0.78, Math.max(0.38, bias));
}

function pickUnitStrategy(
  input: {
    task: "book-bible" | "critic" | "revision";
    sceneCount: number;
    chapterCount: number;
  },
  targetTokensPerCall: number,
): AiCallPlan["unitStrategy"] {
  if (input.task === "critic") return "summaries";
  if (targetTokensPerCall < 1800) return "paragraphs";
  if (input.sceneCount >= input.chapterCount * 2) return "scenes";
  return "chapters";
}

function getModelSizeB(model: string) {
  const name = model.toLowerCase();
  const match = name.match(/(\d+(?:\.\d+)?)\s*b\b/) || name.match(/(?:^|[-_/ ])(\d{1,3})(?:b)(?:[-_/ ]|$)/);
  return match ? Number(match[1]) : null;
}

function getQuantization(model: string) {
  return model.match(/\bq[2-8](?:_[a-z0-9]+)?(?:_[a-z0-9]+)?\b/i)?.[0] || null;
}

function estimateSecondsPerCall(targetTokensPerCall: number, modelSizeB: number | null, quantization: string | null) {
  let tokensPerSecond = 8;

  if (modelSizeB) {
    if (modelSizeB <= 8) tokensPerSecond = 24;
    else if (modelSizeB <= 14) tokensPerSecond = 15;
    else if (modelSizeB <= 34) tokensPerSecond = 6.5;
    else if (modelSizeB <= 72) tokensPerSecond = 2.8;
    else tokensPerSecond = 1.8;
  }

  if (quantization) {
    if (/q2|q3/i.test(quantization)) tokensPerSecond *= 1.15;
    if (/q4/i.test(quantization)) tokensPerSecond *= 1.05;
    if (/q5/i.test(quantization)) tokensPerSecond *= 0.95;
    if (/q6|q8/i.test(quantization)) tokensPerSecond *= 0.82;
  }

  const promptEvalMultiplier = 0.38;
  const fixedOverheadSeconds = 8;
  return Math.max(10, Math.ceil(fixedOverheadSeconds + (targetTokensPerCall * promptEvalMultiplier) / tokensPerSecond));
}
