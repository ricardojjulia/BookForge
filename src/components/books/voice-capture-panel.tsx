"use client";

import { useState } from "react";
import { Alert, Badge, Button, Checkbox, Group, Paper, Stack, Text, Title } from "@mantine/core";
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
      const res = await fetchJson<{ voiceProfile: VoiceProfile }>(`/api/books/${bookId}/voice-capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterIds: selected }),
      });
      setProfile(res.voiceProfile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice capture failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Paper withBorder radius="md" p="xl" bg="white">
      <Stack gap="md">
        <div>
          <Title order={2}>Author Voice Capture</Title>
          <Text c="dimmed" size="sm">
            Select 1–5 chapters that best represent your writing at its strongest. BookForge will extract a voice fingerprint and inject it into every rewrite prompt.
          </Text>
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

        <Stack gap="xs">
          <Text size="sm" fw={500}>Select chapters to analyze (pick your best writing):</Text>
          {chapters.map((ch) => (
            <Checkbox
              key={ch.id}
              checked={selected.includes(ch.id)}
              onChange={() => toggle(ch.id)}
              disabled={!selected.includes(ch.id) && selected.length >= 5}
              label={`Ch. ${ch.chapter_number}${ch.title ? ` — ${ch.title}` : ""}`}
            />
          ))}
        </Stack>

        {error && <Alert color="red" variant="light">{error}</Alert>}

        <Button
          color="grape"
          loading={loading}
          disabled={selected.length === 0}
          onClick={capture}
        >
          {profile ? "Re-capture voice" : "Capture voice"} ({selected.length} chapter{selected.length !== 1 ? "s" : ""} selected)
        </Button>
      </Stack>
    </Paper>
  );
}
