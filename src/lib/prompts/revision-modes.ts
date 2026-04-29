import type { RevisionMode } from "@/lib/types";

export const revisionModes: Record<RevisionMode, { label: string; purpose: string }> = {
  humanize: {
    label: "Humanize",
    purpose: "Make prose natural, emotionally believable, warm, rhythmic, and less stiff.",
  },
  context_enhancement: {
    label: "Deepen Context",
    purpose: "Add helpful context without bloating background, relationships, setting, or worldview.",
  },
  readability: {
    label: "Improve Readability",
    purpose: "Improve clarity, flow, sentence length, transitions, pacing, and reader orientation.",
  },
  character_interaction: {
    label: "Strengthen Character Interaction",
    purpose: "Improve dialogue realism, subtext, chemistry, tension, and character-specific voice.",
  },
  good_writer_motif: {
    label: "Enhance Motif",
    purpose: "Strengthen literary craft, symbolic objects, recurring images, callbacks, and resonance.",
  },
  continuity_review: {
    label: "Continuity Review",
    purpose: "Flag contradictions in names, timeline, locations, facts, relationships, and theology.",
  },
  voice_preservation: {
    label: "Preserve Voice",
    purpose: "Revise without over-polishing or flattening the author's style and personality.",
  },
  pacing: {
    label: "Tighten Pacing",
    purpose: "Improve movement, transitions, exposition balance, urgency, and emotional payoff.",
  },
  dialogue_polish: {
    label: "Polish Dialogue",
    purpose: "Make conversations natural, character-specific, subtext-rich, and less expository.",
  },
  show_dont_tell: {
    label: "Show, Don't Tell",
    purpose: "Convert flat explanation into vivid action, sensory details, and emotional demonstration.",
  },
  chapter_ending: {
    label: "Strengthen Chapter Ending",
    purpose: "Improve final paragraphs with emotional, suspenseful, reflective, or revelatory force.",
  },
  theological_alignment: {
    label: "Theological / Philosophical Alignment",
    purpose: "Preserve the author's intended worldview and flag drift or incompatible framing.",
  },
};
