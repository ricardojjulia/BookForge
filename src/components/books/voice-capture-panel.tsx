"use client";

import { useState } from "react";
import { Alert, Badge, Button, Group, Stack, Text } from "@mantine/core";
import { fetchJson } from "@/lib/http/fetch-json";

type Chapter = { id: string; chapter_number: number; title: string | null };

type VoiceProfile = {
  sentenceStyle?: string;
  narrativeTone?: string;
  vocabularyRegister?: string;
  rewriteInstruction?: string;
  distinctivePatterns?: string[];
  avoidList?: string[];
};

type Props = {
  bookId: string;
  chapters: Chapter[];
  existingProfile?: VoiceProfile | null;
};

export function VoiceCapturePanel({ bookId, chapters, existingProfile }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<VoiceProfile | null>(existingProfile ?? null);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function capture() {
    if (selected.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const queued = await fetchJson<{ content?: { jobId?: string } }>(
        `/api/books/${bookId}/voice-capture`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapterIds: selected, serverManaged: true }),
        },
        "Queue voice capture",
      );
      const jobId = queued.content?.jobId;
      if (!jobId) throw new Error("Voice capture queue handoff failed.");

      const res = await fetchJson<{ voiceProfile: VoiceProfile }>(`/api/books/${bookId}/voice-capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterIds: selected, jobId }),
      });
      setProfile(res.voiceProfile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice capture failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: "#fff", border: "1px solid oklch(0.92 0.003 90)", borderRadius: 12, padding: "26px 28px" }}>
      <Stack gap="md">
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "oklch(0.2 0.005 90)" }}>Author Voice Capture</div>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "oklch(0.5 0.005 90)", lineHeight: 1.6, maxWidth: 900 }}>
            Select 1–5 chapters that best represent your writing at its strongest. BookForge will extract a voice fingerprint and inject it into every rewrite prompt.
          </p>
        </div>

        {profile && (
          <Alert color="teal" variant="light" title="Voice profile active">
            <Stack gap={4}>
              {profile.rewriteInstruction && <Text size="sm">{profile.rewriteInstruction}</Text>}
              {profile.narrativeTone && <Text size="xs" c="dimmed">Tone: {profile.narrativeTone}</Text>}
              {profile.sentenceStyle && <Text size="xs" c="dimmed">Sentences: {profile.sentenceStyle}</Text>}
              {(profile.distinctivePatterns || []).length > 0 && (
                <Group gap="xs" mt={4}>
                  {(profile.distinctivePatterns || []).map((p, i) => (
                    <Badge key={i} size="xs" variant="light" color="teal">{p}</Badge>
                  ))}
                </Group>
              )}
            </Stack>
          </Alert>
        )}

        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.25 0.005 90)", marginBottom: 10 }}>
            Select chapters to analyze (pick your best writing)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {chapters.map((ch) => {
              const on = selected.includes(ch.id);
              const disabled = !on && selected.length >= 5;
              return (
                <button
                  key={ch.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(ch.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: on ? "oklch(0.96 0.03 275)" : "#fff",
                    color: on ? "oklch(0.4 0.13 275)" : disabled ? "oklch(0.7 0.005 90)" : "oklch(0.35 0.005 90)",
                    border: `1px solid ${on ? "oklch(0.75 0.08 275)" : "oklch(0.87 0.005 90)"}`,
                    padding: "9px 16px",
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: disabled ? "default" : "pointer",
                    opacity: disabled ? 0.6 : 1,
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 4,
                      border: `2px solid ${on ? "oklch(0.5 0.16 275)" : "oklch(0.8 0.005 90)"}`,
                      background: on ? "oklch(0.5 0.16 275)" : "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: 9,
                      fontWeight: 800,
                    }}
                  >
                    {on ? "✓" : ""}
                  </span>
                  {`Ch. ${ch.chapter_number}${ch.title ? ` — ${ch.title}` : ""}`}
                </button>
              );
            })}
          </div>
        </div>

        {error && <Alert color="red" variant="light">{error}</Alert>}

        <Button
          fullWidth
          color="grape"
          loading={loading}
          disabled={selected.length === 0}
          onClick={capture}
        >
          {profile ? "Re-capture voice" : "Capture voice"} ({selected.length} chapter{selected.length !== 1 ? "s" : ""} selected)
        </Button>
      </Stack>
    </div>
  );
}
