export type RewriteStrategyId =
  | "conservative_polish"
  | "humanized_literary"
  | "clarity_readability"
  | "downsize_abridge"
  | "emotional_depth"
  | "theology_worldview"
  | "creative_enhancement"
  | "custom";

export type RewriteStrategySettings = {
  voicePreservation: number;
  expansionLimitPercent: number;
  sentenceRhythm: number;
  literaryIntensity: number;
  readabilityTarget: string;
  theologicalEmphasis: number;
  continuityStrictness: number;
  targetReductionPercent: number;
};

export type RewriteStrategy = {
  id: RewriteStrategyId;
  label: string;
  summary: string;
  bestFor: string;
  instructions: string[];
  settings: RewriteStrategySettings;
};

export const rewriteStrategies: Record<RewriteStrategyId, RewriteStrategy> = {
  conservative_polish: {
    id: "conservative_polish",
    label: "Conservative polish",
    summary: "Clean the prose without changing shape, meaning, or emotional temperature.",
    bestFor: "A near-final manuscript that needs smoother rhythm and fewer rough edges.",
    instructions: [
      "Make the smallest effective changes.",
      "Do not expand unless clarity absolutely requires it.",
      "Prefer preserving memorable rough phrasing over smoothing it into generic prose.",
      "Correct awkwardness, repetition, and unclear references without changing structure.",
    ],
    settings: {
      voicePreservation: 95,
      expansionLimitPercent: 5,
      sentenceRhythm: 55,
      literaryIntensity: 35,
      readabilityTarget: "General adult clarity",
      theologicalEmphasis: 50,
      continuityStrictness: 95,
      targetReductionPercent: 0,
    },
  },
  humanized_literary: {
    id: "humanized_literary",
    label: "Humanized literary pass",
    summary: "Make the writing warmer, less mechanical, more lived-in, and more emotionally resonant.",
    bestFor: "Reflective memoir, devotional, literary nonfiction, or emotionally intimate fiction.",
    instructions: [
      "Remove generic AI-like phrasing and over-polished abstraction.",
      "Add human texture through natural cadence, concrete feeling, and emotionally believable transitions.",
      "Use literary craft lightly: image, rhythm, compression, and resonance.",
      "Do not become melodramatic, ornate, or sentimental.",
    ],
    settings: {
      voicePreservation: 88,
      expansionLimitPercent: 12,
      sentenceRhythm: 82,
      literaryIntensity: 72,
      readabilityTarget: "Lyrical but clear",
      theologicalEmphasis: 55,
      continuityStrictness: 92,
      targetReductionPercent: 0,
    },
  },
  clarity_readability: {
    id: "clarity_readability",
    label: "Clarity/readability pass",
    summary: "Improve comprehension, flow, transitions, and sentence-level clarity.",
    bestFor: "Drafts that feel dense, repetitive, confusing, or uneven.",
    instructions: [
      "Prioritize clear meaning over decorative language.",
      "Reduce repetition and untangle long sentences.",
      "Improve transitions and reader orientation.",
      "Keep emotional meaning intact even when simplifying.",
    ],
    settings: {
      voicePreservation: 82,
      expansionLimitPercent: 8,
      sentenceRhythm: 70,
      literaryIntensity: 35,
      readabilityTarget: "Accessible adult / young adult",
      theologicalEmphasis: 50,
      continuityStrictness: 90,
      targetReductionPercent: 5,
    },
  },
  downsize_abridge: {
    id: "downsize_abridge",
    label: "Downsize / abridge",
    summary: "Use fewer words while preserving as much original meaning, voice, and emotional intent as possible.",
    bestFor: "A manuscript that needs to become shorter, tighter, less repetitive, or easier to publish in a smaller format.",
    instructions: [
      "Reduce word count by cutting repetition, filler, over-explanation, redundant imagery, and repeated emotional beats.",
      "Preserve the core idea, emotional meaning, chapter function, continuity, worldview, and author voice.",
      "Do not delete facts, characters, theological meaning, or important transitions just to make the text shorter.",
      "If the paragraph suggests a chapter could be merged or shortened, mention that in revisionNotes instead of silently changing book structure.",
      "Prefer compression, sentence fusion, and sharper phrasing over summary that feels flat or generic.",
    ],
    settings: {
      voicePreservation: 90,
      expansionLimitPercent: 0,
      sentenceRhythm: 72,
      literaryIntensity: 35,
      readabilityTarget: "Concise but faithful",
      theologicalEmphasis: 55,
      continuityStrictness: 96,
      targetReductionPercent: 25,
    },
  },
  emotional_depth: {
    id: "emotional_depth",
    label: "Emotional depth pass",
    summary: "Deepen emotional specificity while preserving restraint and authorial honesty.",
    bestFor: "Scenes or reflective chapters that need stronger felt experience.",
    instructions: [
      "Make emotional movement more specific and embodied.",
      "Prefer subtle human detail over explanation.",
      "Strengthen emotional turns, but do not exaggerate grief, joy, fear, or revelation.",
      "Preserve the original emotional meaning and pacing.",
    ],
    settings: {
      voicePreservation: 88,
      expansionLimitPercent: 15,
      sentenceRhythm: 75,
      literaryIntensity: 65,
      readabilityTarget: "Emotionally clear",
      theologicalEmphasis: 55,
      continuityStrictness: 92,
      targetReductionPercent: 0,
    },
  },
  theology_worldview: {
    id: "theology_worldview",
    label: "Theology/worldview alignment",
    summary: "Preserve and clarify philosophical or theological meaning without unwanted framing.",
    bestFor: "Devotional, pastoral, apologetic, grief, spiritual, or worldview-sensitive work.",
    instructions: [
      "Preserve the author's worldview, theological boundaries, and pastoral tone.",
      "Clarify meaning without preaching more than the original asks for.",
      "Flag theological or philosophical risks instead of silently changing meaning.",
      "Avoid prosperity-gospel tone, unwanted denominational framing, and overly academic language unless requested.",
    ],
    settings: {
      voicePreservation: 90,
      expansionLimitPercent: 10,
      sentenceRhythm: 65,
      literaryIntensity: 50,
      readabilityTarget: "Pastoral clarity",
      theologicalEmphasis: 90,
      continuityStrictness: 96,
      targetReductionPercent: 0,
    },
  },
  creative_enhancement: {
    id: "creative_enhancement",
    label: "Full creative enhancement",
    summary: "A bolder craft pass for imagery, momentum, resonance, and memorability.",
    bestFor: "Earlier drafts where the author wants meaningful stylistic elevation.",
    instructions: [
      "Improve imagery, openings, closings, specificity, rhythm, and emotional force.",
      "Allow moderate expansion when it creates clearer scene experience or stronger resonance.",
      "Strengthen motifs and callbacks only from existing manuscript material.",
      "Do not alter facts, character permanence, worldview, ending, or chapter function.",
    ],
    settings: {
      voicePreservation: 78,
      expansionLimitPercent: 20,
      sentenceRhythm: 86,
      literaryIntensity: 85,
      readabilityTarget: "Rich but readable",
      theologicalEmphasis: 55,
      continuityStrictness: 94,
      targetReductionPercent: 0,
    },
  },
  custom: {
    id: "custom",
    label: "Custom",
    summary: "Start from balanced defaults and tune the sliders yourself.",
    bestFor: "A targeted pass with author-specific instructions.",
    instructions: [
      "Follow the custom strategy settings and preserve the full coherence contract.",
      "When instructions conflict, preserve original meaning and continuity first.",
    ],
    settings: {
      voicePreservation: 85,
      expansionLimitPercent: 10,
      sentenceRhythm: 70,
      literaryIntensity: 55,
      readabilityTarget: "Balanced",
      theologicalEmphasis: 50,
      continuityStrictness: 92,
      targetReductionPercent: 0,
    },
  },
};

export function getRewriteStrategy(id: string | null | undefined) {
  return rewriteStrategies[(id || "humanized_literary") as RewriteStrategyId] || rewriteStrategies.humanized_literary;
}

export function clampStrategySettings(settings: Partial<RewriteStrategySettings>): RewriteStrategySettings {
  return {
    voicePreservation: clampNumber(settings.voicePreservation, 0, 100, 85),
    expansionLimitPercent: clampNumber(settings.expansionLimitPercent, 0, 40, 10),
    sentenceRhythm: clampNumber(settings.sentenceRhythm, 0, 100, 70),
    literaryIntensity: clampNumber(settings.literaryIntensity, 0, 100, 55),
    readabilityTarget: settings.readabilityTarget?.trim() || "Balanced",
    theologicalEmphasis: clampNumber(settings.theologicalEmphasis, 0, 100, 50),
    continuityStrictness: clampNumber(settings.continuityStrictness, 0, 100, 92),
    targetReductionPercent: clampNumber(settings.targetReductionPercent, 0, 60, 0),
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, number));
}
