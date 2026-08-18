"use client";

import { useMemo, useState } from "react";
import { Alert, Badge, Button, Group, Modal, Paper, ScrollArea, Stack, Text, Title } from "@mantine/core";
import { IconSparkles } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { useRouter } from "next/navigation";
import { GenerationProgressAlert } from "@/components/ai/generation-progress-alert";
import { fetchJson } from "@/lib/http/fetch-json";
import { ManuscriptHealthCard } from "@/components/books/manuscript-health-card";

type SceneEditorChapter = {
  id: string;
  chapter_number: number;
  title: string | null;
};

type SceneEditorScene = {
  id: string;
  chapter_id: string;
  scene_number: number;
  title: string | null;
  summary: string | null;
  status: string | null;
};

type SceneEditorParagraph = {
  id: string;
  chapter_id: string;
  scene_id: string | null;
  paragraph_number: number;
  original_text: string;
};

export type SceneSplitSuggestion = {
  id: string;
  chapter_id: string;
  start_paragraph_id: string;
  title: string;
  rationale: string | null;
  status: string;
};

export function SceneEditorPanel({
  chapters,
  scenes,
  paragraphs,
  suggestions = [],
}: {
  chapters: SceneEditorChapter[];
  scenes: SceneEditorScene[];
  paragraphs: SceneEditorParagraph[];
  suggestions?: SceneSplitSuggestion[];
}) {
  const router = useRouter();
  const [opened, { open, close }] = useDisclosure(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const paragraphsByChapter = useMemo(() => groupBy(paragraphs, "chapter_id"), [paragraphs]);
  const scenesByChapter = useMemo(() => groupBy(scenes, "chapter_id"), [scenes]);
  const suggestionsByChapter = useMemo(() => groupBy(suggestions, "chapter_id"), [suggestions]);
  const paragraphById = useMemo(() => new Map(paragraphs.map((paragraph) => [paragraph.id, paragraph])), [paragraphs]);
  const sceneIssues = useMemo(() => getSceneIssues(chapters, scenes, paragraphs), [chapters, paragraphs, scenes]);

  async function suggestScenes(chapterId: string) {
    setLoadingId(`suggest:${chapterId}`);
    setError("");
    try {
      await fetchJson(`/api/chapters/${chapterId}/suggest-scenes`, { method: "POST" }, "Suggest scenes");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to suggest scenes.");
    } finally {
      setLoadingId(null);
    }
  }

  async function reviewSuggestion(suggestion: SceneSplitSuggestion, status: "approved" | "rejected") {
    setLoadingId(`review:${suggestion.id}`);
    setError("");
    try {
      await fetchJson(
        `/api/scene-split-suggestions/${suggestion.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status }),
        },
        status === "approved" ? "Accept scene suggestion" : "Reject scene suggestion",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update suggestion.");
    } finally {
      setLoadingId(null);
    }
  }

  async function renameScene(scene: SceneEditorScene) {
    const title = window.prompt("Scene title", scene.title || `Scene ${scene.scene_number}`);
    if (title === null) return;
    setLoadingId(`rename:${scene.id}`);
    setError("");
    try {
      await fetchJson(
        `/api/scenes/${scene.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: title.trim() || null }),
        },
        "Rename scene",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to rename scene.");
    } finally {
      setLoadingId(null);
    }
  }

  async function mergeScene(scene: SceneEditorScene) {
    const confirmed = window.confirm(
      `Merge ${scene.title || `Scene ${scene.scene_number}`} with the next scene in this chapter?`,
    );
    if (!confirmed) return;
    setLoadingId(`merge:${scene.id}`);
    setError("");
    try {
      await fetchJson(`/api/scenes/${scene.id}/merge-next`, { method: "PATCH" }, "Merge scenes");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to merge scenes.");
    } finally {
      setLoadingId(null);
    }
  }

  async function startScene(paragraph: SceneEditorParagraph) {
    const title = window.prompt("Scene title", `Scene starting at paragraph ${paragraph.paragraph_number}`);
    if (title === null) return;
    const confirmed = window.confirm(
      "Create a new scene starting at this paragraph? BookForge will move this paragraph and following paragraphs up to the next scene boundary.",
    );
    if (!confirmed) return;

    setLoadingId(`start:${paragraph.id}`);
    setError("");
    try {
      await fetchJson(
        `/api/paragraphs/${paragraph.id}/scene-start`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title }),
        },
        "Create scene",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create scene.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <>
      <ManuscriptHealthCard
        icon="🎬"
        title="Scene Editor"
        description="Repair scene boundaries before running scene-level rewrite or export workflows."
        pills={[
          sceneIssues.length
            ? { label: `${sceneIssues.length} SCENE WARNINGS`, tone: "warn" }
            : { label: "SCENES LOOK USABLE", tone: "ok" },
        ]}
        actionLabel="Manage Scenes"
        onAction={open}
        warning={sceneIssues.length > 0}
      />

      <Modal opened={opened} onClose={close} title="Scene Editor" size="90rem" centered>
        <Stack>
          {error && <Alert color="red">{error}</Alert>}
          <Alert color="blue" variant="light">
            Scene edits update the parsed manuscript structure only. Original uploaded files and original paragraph text stay preserved.
          </Alert>
          {sceneIssues.length > 0 && (
            <Stack gap="xs">
              {sceneIssues.map((issue) => (
                <Alert key={issue.id} color={issue.severity === "high" ? "red" : "yellow"} variant="light">
                  <Text fw={700} size="sm">
                    {issue.title}
                  </Text>
                  <Text size="sm">{issue.description}</Text>
                </Alert>
              ))}
            </Stack>
          )}
          <ScrollArea h="72vh">
            <Stack>
              {chapters.map((chapter) => {
                const chapterScenes = (scenesByChapter[chapter.id] || []).sort(
                  (a, b) => a.scene_number - b.scene_number,
                );
                const chapterParagraphs = (paragraphsByChapter[chapter.id] || []).sort(
                  (a, b) => a.paragraph_number - b.paragraph_number,
                );
                const paragraphCounts = countParagraphsByScene(chapterParagraphs);
                const chapterSuggestions = (suggestionsByChapter[chapter.id] || []).filter(
                  (suggestion) => suggestion.status === "pending",
                );
                return (
                  <Paper key={chapter.id} withBorder radius="md" p="md" bg="#fbfaf8">
                    <Group justify="space-between" mb="sm">
                      <div>
                        <Title order={4}>
                          {chapter.chapter_number}. {chapter.title || "Untitled chapter"}
                        </Title>
                        <Text size="sm" c="dimmed">
                          {chapterScenes.length} scenes · {chapterParagraphs.length} paragraphs
                        </Text>
                      </div>
                      <Group gap="xs">
                        {!chapterScenes.length && (
                          <Badge color="red" variant="light">
                            No scenes
                          </Badge>
                        )}
                        <Button
                          size="xs"
                          variant="light"
                          color="grape"
                          leftSection={<IconSparkles size={14} />}
                          loading={loadingId === `suggest:${chapter.id}`}
                          disabled={chapterParagraphs.length < 2}
                          onClick={() => suggestScenes(chapter.id)}
                        >
                          Suggest Scenes
                        </Button>
                      </Group>
                    </Group>

                    <GenerationProgressAlert
                      active={loadingId === `suggest:${chapter.id}`}
                      message="Suggesting scene splits..."
                      estimatedSeconds={20}
                      color="grape"
                    />

                    {chapterSuggestions.length > 0 && (
                      <Stack gap="xs" mb="sm">
                        {chapterSuggestions.map((suggestion) => {
                          const targetParagraph = paragraphById.get(suggestion.start_paragraph_id);
                          return (
                            <Paper key={suggestion.id} withBorder radius="sm" p="sm" bg="#f8f0ff">
                              <Group justify="space-between" align="flex-start" wrap="nowrap">
                                <div>
                                  <Group gap="xs" mb={2}>
                                    <Badge color="grape" variant="light" size="sm">
                                      Suggested scene
                                    </Badge>
                                    {targetParagraph && (
                                      <Text size="xs" c="dimmed">
                                        starts at paragraph {targetParagraph.paragraph_number}
                                      </Text>
                                    )}
                                  </Group>
                                  <Text fw={700}>{suggestion.title}</Text>
                                  {suggestion.rationale && (
                                    <Text size="sm" c="dimmed">
                                      {suggestion.rationale}
                                    </Text>
                                  )}
                                </div>
                                <Group gap="xs" wrap="nowrap">
                                  <Button
                                    size="xs"
                                    color="teal"
                                    loading={loadingId === `review:${suggestion.id}`}
                                    onClick={() => reviewSuggestion(suggestion, "approved")}
                                  >
                                    Accept
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="subtle"
                                    color="gray"
                                    loading={loadingId === `review:${suggestion.id}`}
                                    onClick={() => reviewSuggestion(suggestion, "rejected")}
                                  >
                                    Reject
                                  </Button>
                                </Group>
                              </Group>
                            </Paper>
                          );
                        })}
                      </Stack>
                    )}

                    <Stack gap="sm">
                      {chapterScenes.map((scene, index) => (
                        <Paper key={scene.id} withBorder radius="sm" p="sm" bg="white">
                          <Group justify="space-between" align="flex-start">
                            <div>
                              <Group gap="xs">
                                <Badge variant="light">Scene {scene.scene_number}</Badge>
                                <Badge color={paragraphCounts[scene.id] ? "teal" : "red"} variant="light">
                                  {paragraphCounts[scene.id] || 0} paragraphs
                                </Badge>
                              </Group>
                              <Text fw={700} mt={4}>
                                {scene.title || "Untitled scene"}
                              </Text>
                              {scene.summary && (
                                <Text size="sm" c="dimmed" lineClamp={2}>
                                  {scene.summary}
                                </Text>
                              )}
                            </div>
                            <Group gap="xs">
                              <Button
                                size="xs"
                                variant="subtle"
                                color="dark"
                                loading={loadingId === `rename:${scene.id}`}
                                onClick={() => renameScene(scene)}
                              >
                                Rename
                              </Button>
                              <Button
                                size="xs"
                                variant="subtle"
                                color="grape"
                                disabled={index === chapterScenes.length - 1}
                                loading={loadingId === `merge:${scene.id}`}
                                onClick={() => mergeScene(scene)}
                              >
                                Merge next
                              </Button>
                            </Group>
                          </Group>
                        </Paper>
                      ))}

                      <Paper withBorder radius="sm" p="sm" bg="#fffdf8">
                        <Text fw={700} size="sm" mb="xs">
                          Start a scene at a paragraph
                        </Text>
                        <Stack gap="xs">
                          {chapterParagraphs.map((paragraph) => (
                            <Group key={paragraph.id} justify="space-between" align="flex-start" wrap="nowrap">
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <Group gap="xs" wrap="nowrap" align="flex-start">
                                  <Badge variant="outline" style={{ flexShrink: 0 }}>
                                    Paragraph {paragraph.paragraph_number}
                                  </Badge>
                                  <Text size="sm" lineClamp={2}>
                                    {paragraph.original_text}
                                  </Text>
                                </Group>
                              </div>
                              <Button
                                size="xs"
                                variant="light"
                                color="teal"
                                disabled={paragraph.paragraph_number === 1}
                                loading={loadingId === `start:${paragraph.id}`}
                                onClick={() => startScene(paragraph)}
                              >
                                Start scene here
                              </Button>
                            </Group>
                          ))}
                        </Stack>
                      </Paper>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          </ScrollArea>
        </Stack>
      </Modal>
    </>
  );
}

function groupBy<T extends Record<K, string>, K extends keyof T>(items: T[], key: K) {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    groups[item[key]] ||= [];
    groups[item[key]].push(item);
    return groups;
  }, {});
}

function countParagraphsByScene(paragraphs: SceneEditorParagraph[]) {
  return paragraphs.reduce<Record<string, number>>((counts, paragraph) => {
    if (!paragraph.scene_id) return counts;
    counts[paragraph.scene_id] = (counts[paragraph.scene_id] || 0) + 1;
    return counts;
  }, {});
}

function getSceneIssues(chapters: SceneEditorChapter[], scenes: SceneEditorScene[], paragraphs: SceneEditorParagraph[]) {
  const issues: Array<{ id: string; severity: "medium" | "high"; title: string; description: string }> = [];
  const scenesByChapter = groupBy(scenes, "chapter_id");
  const paragraphsByChapter = groupBy(paragraphs, "chapter_id");
  const paragraphCounts = countParagraphsByScene(paragraphs);

  chapters.forEach((chapter) => {
    const chapterScenes = scenesByChapter[chapter.id] || [];
    const chapterParagraphs = paragraphsByChapter[chapter.id] || [];
    if (chapterParagraphs.length > 2 && chapterScenes.length === 0) {
      issues.push({
        id: `no-scenes-${chapter.id}`,
        severity: "high",
        title: `Chapter ${chapter.chapter_number} has no scenes`,
        description: "Create scene boundaries before running scene-level rewrite passes.",
      });
    }

    chapterScenes.forEach((scene) => {
      const count = paragraphCounts[scene.id] || 0;
      if (count === 0) {
        issues.push({
          id: `empty-scene-${scene.id}`,
          severity: "high",
          title: `Chapter ${chapter.chapter_number}, scene ${scene.scene_number} is empty`,
          description: "Merge or recreate this scene so the export and rewrite context stay clean.",
        });
      } else if (count === 1) {
        issues.push({
          id: `short-scene-${scene.id}`,
          severity: "medium",
          title: `Chapter ${chapter.chapter_number}, scene ${scene.scene_number} is very short`,
          description: "A one-paragraph scene may be intentional, but it is worth checking before a batch rewrite.",
        });
      } else if (count > 30) {
        issues.push({
          id: `long-scene-${scene.id}`,
          severity: "medium",
          title: `Chapter ${chapter.chapter_number}, scene ${scene.scene_number} is long`,
          description: "Long scenes may need another split for faster local AI calls and stronger context control.",
        });
      }
    });
  });

  return issues;
}
