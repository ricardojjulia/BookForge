import { describe, expect, it } from "vitest";
import { computeDialogueRatio } from "@/lib/dialogue-density";

describe("computeDialogueRatio", () => {
  it("counts straight/curly double-quoted dialogue", () => {
    const text = 'She paused. "I never asked for this," she said. Then she left the room in silence.';
    const result = computeDialogueRatio(text);
    expect(result.dialogueWords).toBeGreaterThan(0);
    expect(result.ratio).toBeGreaterThan(0);
  });

  it("counts guillemet-delimited dialogue, common in Spanish and French prose", () => {
    const text = "Ella se detuvo. «Nunca pedí esto», dijo. Luego salió de la habitación en silencio.";
    const result = computeDialogueRatio(text);
    expect(result.dialogueWords).toBeGreaterThan(0);
  });

  it("counts em-dash-led dialogue lines, common in literary Spanish/French/Italian", () => {
    const text = ["Ella se detuvo un momento.", "—Nunca pedí esto —dijo con calma.", "Luego salió de la habitación."].join("\n");
    const result = computeDialogueRatio(text);
    expect(result.dialogueWords).toBeGreaterThan(0);
  });

  it("never reports a ratio above 1 even if matches overlap", () => {
    const text = '—"Nested punctuation," she said—';
    const result = computeDialogueRatio(text);
    expect(result.dialogueWords).toBeLessThanOrEqual(result.totalWords);
    expect(result.ratio).toBeLessThanOrEqual(1);
  });

  it("returns a zero ratio for prose with no dialogue markers", () => {
    const text = "The house stood quiet under the grey sky, waiting for a storm that never came.";
    const result = computeDialogueRatio(text);
    expect(result.dialogueWords).toBe(0);
    expect(result.ratio).toBe(0);
  });
});
