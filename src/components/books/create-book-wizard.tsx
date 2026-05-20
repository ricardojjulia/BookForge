"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/http/fetch-json";

type CloudProviderInfo = {
  provider: string;
  model: string | null;
  executionMode: string;
  usedForPlanning: boolean;
  usedForRewrite: boolean;
};

type ModelStatusResponse = {
  connected: boolean;
  baseUrl: string;
  qualityProfile: string;
  contextWindowTokens: number;
  availableModels: string[];
  configuredModels: Array<{ key: string; label: string; model: string; available: boolean }>;
  cloudProvider: CloudProviderInfo | null;
  executionMode: string;
  warnings: string[];
};

type CreationMode = "single_safe" | "dual_role_sequential";

type ConceptPass = {
  mainTheme?: string;
  readerPromise?: string;
  premise?: string;
  emotionalEngine?: string;
  genreFit?: string;
  targetAudienceFit?: string;
  creationThesis?: string;
  suggestedStructure?: Array<{ partTitle?: string; purpose?: string; chapterCount?: number }>;
  coreQuestions?: unknown[];
  majorRisks?: unknown[];
  differentiators?: unknown[];
  recommendedNextQuestionsForAuthor?: unknown[];
  modelStrategyRecommendation?: { mode?: string; reason?: string };
};

type ChapterArchitecture = {
  architectureSummary?: string;
  parts?: Array<{
    partNumber?: number;
    title?: string;
    purpose?: string;
    chapters?: Array<{
      chapterNumber?: number;
      title?: string;
      purpose?: string;
      targetWords?: number;
      targetPages?: number;
      emotionalMovement?: string;
      keyBeats?: unknown[];
      charactersOrConcepts?: unknown[];
      continuityNotes?: unknown[];
      riskNotes?: unknown[];
    }>;
  }>;
  globalContinuityRules?: unknown[];
  voiceRules?: unknown[];
  motifsToDevelop?: unknown[];
  generationWarnings?: unknown[];
};

export function CreateBookWizard() {
  const router = useRouter();
  const [workingTitle, setWorkingTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [genre, setGenre] = useState<string | null>("Literary nonfiction");
  const [audience, setAudience] = useState<string | null>("General adult");
  const [language, setLanguage] = useState<string | null>("Spanish");
  const [targetPages, setTargetPages] = useState<number | "">(120);
  const [tone, setTone] = useState("");
  const [boundaries, setBoundaries] = useState("");
  const [mode, setMode] = useState<CreationMode>("single_safe");
  const [status, setStatus] = useState<ModelStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [conceptLoading, setConceptLoading] = useState(false);
  const [architectureLoading, setArchitectureLoading] = useState(false);
  const [acceptingArchitecture, setAcceptingArchitecture] = useState(false);
  const [creationProjectId, setCreationProjectId] = useState<string | null>(null);
  const [concept, setConcept] = useState<ConceptPass | null>(null);
  const [architecture, setArchitecture] = useState<ChapterArchitecture | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { runModelPreflight(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function runModelPreflight() {
    setLoading(true);
    setError("");
    try {
      const result = await fetchJson<ModelStatusResponse>(
        "/api/lmstudio/status",
        { cache: "no-store" },
        "Creation model preflight",
      );
      setStatus(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to check LM Studio.");
    } finally {
      setLoading(false);
    }
  }

  async function acceptConceptAndGenerateArchitecture() {
    if (!creationProjectId || !concept) return;
    setArchitectureLoading(true);
    setError("");
    try {
      const result = await fetchJson<{ content?: { architecture?: ChapterArchitecture } }>(
        "/api/creation/architecture",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            creationProjectId,
            concept,
          }),
        },
        "Generate chapter architecture",
      );
      setArchitecture(result.content?.architecture || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate chapter architecture.");
    } finally {
      setArchitectureLoading(false);
    }
  }

  async function acceptArchitecture() {
    if (!creationProjectId || !architecture) return;
    setAcceptingArchitecture(true);
    setError("");
    try {
      const result = await fetchJson<{ content?: { bookId?: string; chapterCount?: number } }>(
        "/api/creation/accept-architecture",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            creationProjectId,
            architecture,
          }),
        },
        "Accept architecture",
      );
      const bookId = result.content?.bookId;
      if (bookId) router.push(`/books/${bookId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to accept architecture.");
    } finally {
      setAcceptingArchitecture(false);
    }
  }

  async function generateConceptPass() {
    setConceptLoading(true);
    setError("");
    try {
      const result = await fetchJson<{
        content?: {
          creationProject?: { id: string };
          concept?: ConceptPass;
        };
      }>(
        "/api/creation/concept",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            creationProjectId: creationProjectId || undefined,
            workingTitle,
            idea,
            genre: genre || "Unspecified",
            targetAudience: audience || "Unspecified",
            language: language || "English",
            targetPages: Number(targetPages || 120),
            tone,
            boundaries,
            creationMode: mode,
          }),
        },
        "Generate concept pass",
      );
      setCreationProjectId(result.content?.creationProject?.id || creationProjectId);
      setConcept(result.content?.concept || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate concept pass.");
    } finally {
      setConceptLoading(false);
    }
  }

  const recommendedMode = getRecommendedCreationMode(status);
  const pageCount = Number(targetPages || 0);
  const wordTarget = Math.round(pageCount * 275);
  const expectedChapters = Math.max(6, Math.min(24, Math.round(pageCount / 8)));

  return (
    <Stack>
      <Paper withBorder radius="md" p="xl" bg="white">
        <Stack>
          <Group justify="space-between" align="flex-start">
            <div>
              <Title>Create a Book From an Idea</Title>
              <Text c="dimmed">
                Build an approved plan first, then generate the draft in chapters and paragraph units. Target length is capped at 150 pages.
              </Text>
            </div>
            <Badge
              color={status?.cloudProvider?.usedForPlanning ? "blue" : "grape"}
              variant="light"
            >
              {status?.cloudProvider?.usedForPlanning
                ? `${providerLabel(status.cloudProvider.provider)} · ${status.cloudProvider.model || "default model"}`
                : "Local LM Studio"}
            </Badge>
          </Group>

          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <TextInput
              label="Working title"
              placeholder="Lo que pudo haber sido"
              value={workingTitle}
              onChange={(event) => setWorkingTitle(event.currentTarget.value)}
            />
            <NumberInput
              label="Target pages"
              description="Hard cap: 150 pages"
              value={targetPages}
              min={20}
              max={150}
              onChange={(value) => setTargetPages(value === "" ? "" : Number(value || 120))}
            />
            <Select
              label="Genre"
              value={genre}
              onChange={setGenre}
              data={["Literary nonfiction", "Memoir", "Self-help", "Devotional", "Novel", "Thriller", "Fantasy", "Romance", "Young adult"]}
            />
            <Select
              label="Target audience"
              value={audience}
              onChange={setAudience}
              data={["General adult", "Young adult", "Parents", "Pastors", "Church small groups", "Grief/loss readers", "Christian readers"]}
            />
            <Select
              label="Language"
              value={language}
              onChange={setLanguage}
              data={["English", "Spanish", "Bilingual English/Spanish"]}
            />
            <TextInput
              label="Tone"
              placeholder="Tender, literary, pastoral, hopeful"
              value={tone}
              onChange={(event) => setTone(event.currentTarget.value)}
            />
          </SimpleGrid>

          <Textarea
            label="Core idea or prompt"
            minRows={5}
            placeholder="Describe the book you want to create, the emotional promise, and what the reader should carry away."
            value={idea}
            onChange={(event) => setIdea(event.currentTarget.value)}
          />
          <Textarea
            label="Contemporary View or forbidden changes"
            minRows={3}
            placeholder="Optional boundaries: avoid prosperity-gospel tone, preserve grief tenderness, avoid academic language..."
            value={boundaries}
            onChange={(event) => setBoundaries(event.currentTarget.value)}
          />
        </Stack>
      </Paper>

      <Paper withBorder radius="md" p="xl" bg="#fbfaf8">
        <Stack>
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={2}>Creation AI Strategy</Title>
              <Text c="dimmed">
                {status?.cloudProvider?.usedForPlanning
                  ? `Concept and architecture passes will use ${providerLabel(status.cloudProvider.provider)}. Draft generation uses your execution mode setting.`
                  : "Default is one loaded model for memory safety. Dual-role mode is sequential, so BookForge does not assume two large models can stay loaded together."}
              </Text>
            </div>
            <Button color="teal" variant="light" loading={loading} onClick={runModelPreflight}>
              {status?.cloudProvider?.usedForPlanning ? "Refresh Status" : "Check LM Studio Fit"}
            </Button>
          </Group>

          {!(status?.cloudProvider?.usedForPlanning) && (
            <SegmentedControl
              value={mode}
              onChange={(value) => setMode(value as CreationMode)}
              data={[
                { label: "Single-model safe", value: "single_safe" },
                { label: "Dual-role sequential", value: "dual_role_sequential" },
              ]}
            />
          )}

          {error && <Alert color="red">{error}</Alert>}
          {status && (
            <SimpleGrid cols={{ base: 1, md: 4 }}>
              {status.cloudProvider?.usedForPlanning ? (
                <>
                  <Metric label="Provider" value={providerLabel(status.cloudProvider.provider)} ready />
                  <Metric label="Model" value={status.cloudProvider.model || "default"} ready />
                  <Metric label="Mode" value={status.cloudProvider.executionMode} ready />
                  <Metric label="LM Studio" value={status.connected ? "Also connected" : "Not required"} ready={status.connected} />
                </>
              ) : (
                <>
                  <Metric label="LM Studio" value={status.connected ? "Connected" : "Disconnected"} ready={status.connected} />
                  <Metric label="Available models" value={status.availableModels.length} ready={status.availableModels.length > 0} />
                  <Metric label="Recommended mode" value={recommendedMode === "dual_role_sequential" ? "Dual-role" : "Single"} ready />
                  <Metric label="Context window" value={status.contextWindowTokens.toLocaleString()} ready />
                </>
              )}
            </SimpleGrid>
          )}

          {status?.cloudProvider && !status.cloudProvider.usedForPlanning && (
            <Alert color="blue" variant="light">
              <Text size="sm">
                <strong>{providerLabel(status.cloudProvider.provider)}</strong> is configured but execution mode is set to <strong>Local</strong> — creation will use LM Studio.{" "}
                <Text component={Link} href="/settings" size="sm" c="blue" td="underline">
                  Change execution mode in Settings
                </Text>{" "}
                to Auto or Cloud to use {providerLabel(status.cloudProvider.provider)} for planning.
              </Text>
            </Alert>
          )}

          {!status?.cloudProvider?.usedForPlanning && status?.warnings?.length ? (
            <Alert color="yellow" variant="light">
              {status.warnings.slice(0, 3).map((warning) => (
                <Text key={warning} size="sm">
                  {warning}
                </Text>
              ))}
            </Alert>
          ) : null}
        </Stack>
      </Paper>

      <Paper withBorder radius="md" p="xl" bg="white">
        <Stack>
          <Title order={2}>Generation Plan Preview</Title>
          <SimpleGrid cols={{ base: 1, md: 3 }}>
            <Metric label="Estimated words" value={wordTarget.toLocaleString()} ready={pageCount > 0} />
            <Metric label="Expected chapters" value={expectedChapters} ready />
            <Metric label="Generation style" value="Unit-by-unit" ready />
          </SimpleGrid>
          <Alert color="blue" variant="light">
            Next implementation step: generate a Concept Pass from this intake, let the author edit/approve it, then build chapter architecture before creating manuscript text.
          </Alert>
          <Group>
            <Button color="grape" disabled={!idea.trim() || !workingTitle.trim()} loading={conceptLoading} onClick={generateConceptPass}>
              Generate Concept Pass
            </Button>
            <Button component="a" href="/dashboard" variant="light" color="dark">
              Back to Dashboard
            </Button>
          </Group>
        </Stack>
      </Paper>

      {concept && (
        <Paper withBorder radius="md" p="xl" bg="#fffdf8">
          <Stack>
            <Group justify="space-between" align="flex-start">
              <div>
                <Title order={2}>Concept Pass</Title>
                <Text c="dimmed">
                  Review and edit this before BookForge builds chapter architecture. Nothing has been drafted yet.
                </Text>
              </div>
              <Badge color="teal" variant="light">
                Saved
              </Badge>
            </Group>
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <ConceptField label="Main theme" value={concept.mainTheme} onChange={(value) => setConceptField("mainTheme", value)} />
              <ConceptField label="Reader promise" value={concept.readerPromise} onChange={(value) => setConceptField("readerPromise", value)} />
              <ConceptField label="Premise" value={concept.premise} onChange={(value) => setConceptField("premise", value)} />
              <ConceptField label="Emotional engine" value={concept.emotionalEngine} onChange={(value) => setConceptField("emotionalEngine", value)} />
              <ConceptField label="Genre fit" value={concept.genreFit} onChange={(value) => setConceptField("genreFit", value)} />
              <ConceptField label="Audience fit" value={concept.targetAudienceFit} onChange={(value) => setConceptField("targetAudienceFit", value)} />
            </SimpleGrid>
            <ConceptField label="Creation thesis" value={concept.creationThesis} onChange={(value) => setConceptField("creationThesis", value)} minRows={3} />
            <ConceptList title="Suggested structure" items={(concept.suggestedStructure || []).map((item) => `${item.partTitle || "Part"}: ${item.purpose || ""} (${item.chapterCount || 0} chapters)`)} />
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <ConceptList title="Core questions" items={concept.coreQuestions || []} />
              <ConceptList title="Major risks" items={concept.majorRisks || []} />
              <ConceptList title="Differentiators" items={concept.differentiators || []} />
              <ConceptList title="Questions for author" items={concept.recommendedNextQuestionsForAuthor || []} />
            </SimpleGrid>
            <Alert color="blue" variant="light">
              Next step: accept or revise this concept, then generate the chapter architecture from the approved concept.
            </Alert>
            <Group>
              <Button color="teal" loading={architectureLoading} onClick={acceptConceptAndGenerateArchitecture}>
                Accept Concept
              </Button>
              <Button color="grape" variant="light" loading={conceptLoading} onClick={generateConceptPass}>
                Regenerate Concept
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}

      {architecture && (
        <Paper withBorder radius="md" p="xl" bg="white">
          <Stack>
            <Group justify="space-between" align="flex-start">
              <div>
                <Title order={2}>Chapter Architecture</Title>
                <Text c="dimmed">
                  Edit this structure before drafting. BookForge will generate future manuscript text from approved chapter units, not one giant prompt.
                </Text>
              </div>
              <Badge color="grape" variant="light">
                Planning
              </Badge>
            </Group>
            <ConceptField
              label="Architecture summary"
              value={architecture.architectureSummary}
              minRows={3}
              onChange={(value) => setArchitecture((current) => ({ ...(current || {}), architectureSummary: value }))}
            />
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <ConceptList title="Global continuity rules" items={architecture.globalContinuityRules || []} />
              <ConceptList title="Voice rules" items={architecture.voiceRules || []} />
              <ConceptList title="Motifs to develop" items={architecture.motifsToDevelop || []} />
              <ConceptList title="Generation warnings" items={architecture.generationWarnings || []} />
            </SimpleGrid>
            <Stack>
              {(architecture.parts || []).map((part, partIndex) => (
                <Paper key={`part:${partIndex}`} withBorder radius="md" p="md" bg="#fbfaf8">
                  <Stack>
                    <Group justify="space-between">
                      <Title order={3}>
                        Part {part.partNumber || partIndex + 1}: {part.title || "Untitled"}
                      </Title>
                      <Badge color="teal" variant="light">
                        {part.chapters?.length || 0} chapters
                      </Badge>
                    </Group>
                    <Text c="dimmed">{part.purpose}</Text>
                    <SimpleGrid cols={{ base: 1, md: 2 }}>
                      {(part.chapters || []).map((chapter, chapterIndex) => (
                        <Paper key={`chapter:${partIndex}:${chapterIndex}`} withBorder radius="sm" p="md" bg="white">
                          <Stack gap="xs">
                            <Group justify="space-between">
                              <Text fw={900}>
                                {chapter.chapterNumber || chapterIndex + 1}. {chapter.title || "Untitled chapter"}
                              </Text>
                              <Badge color="gray" variant="light">
                                {chapter.targetWords || 0} words
                              </Badge>
                            </Group>
                            <Text size="sm">{chapter.purpose}</Text>
                            <Text size="sm" c="dimmed">
                              {chapter.emotionalMovement}
                            </Text>
                            <ConceptList title="Key beats" items={chapter.keyBeats || []} />
                          </Stack>
                        </Paper>
                      ))}
                    </SimpleGrid>
                  </Stack>
                </Paper>
              ))}
            </Stack>
            <Alert color="blue" variant="light">
              Next implementation step: accept this architecture, then create draft-generation jobs chapter by chapter.
            </Alert>
            <Group>
              <Button color="teal" loading={acceptingArchitecture} onClick={acceptArchitecture}>
                Accept Architecture
              </Button>
              <Button color="grape" variant="light" loading={architectureLoading} onClick={acceptConceptAndGenerateArchitecture}>
                Regenerate Architecture
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}
    </Stack>
  );

  function setConceptField(key: keyof ConceptPass, value: string) {
    setConcept((current) => ({
      ...(current || {}),
      [key]: value,
    }));
  }
}

function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google Gemini",
    lmstudio: "LM Studio",
  };
  return labels[provider] || provider;
}

function getRecommendedCreationMode(status: ModelStatusResponse | null): CreationMode {
  if (!status?.connected) return "single_safe";
  const availableSmallish = status.availableModels.filter((model) => {
    const normalized = model.toLowerCase();
    return /(^|[^0-9])(7b|8b|9b|14b)([^0-9]|$)/.test(normalized);
  });
  return availableSmallish.length >= 2 ? "dual_role_sequential" : "single_safe";
}

function Metric({ label, value, ready }: { label: string; value: string | number; ready: boolean }) {
  return (
    <Paper withBorder radius="sm" p="md" bg="white">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {label}
        </Text>
        <Badge color={ready ? "green" : "yellow"} variant="light">
          {ready ? "ready" : "check"}
        </Badge>
      </Group>
      <Text fw={900}>{value}</Text>
    </Paper>
  );
}

function ConceptField({
  label,
  value,
  onChange,
  minRows = 2,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  minRows?: number;
}) {
  return (
    <Textarea
      label={label}
      value={value || ""}
      minRows={minRows}
      autosize
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

function ConceptList({ title, items }: { title: string; items: unknown[] }) {
  return (
    <Paper withBorder radius="sm" p="md" bg="white">
      <Text fw={900} mb="xs">
        {title}
      </Text>
      {items.length ? (
        <Stack gap={4}>
          {items.map((item, index) => (
            <Text key={`${title}:${index}`} size="sm">
              {index + 1}. {renderConceptListItem(item)}
            </Text>
          ))}
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          None returned yet.
        </Text>
      )}
    </Paper>
  );
}

function renderConceptListItem(item: unknown): string {
  if (typeof item === "string") return item;
  if (typeof item === "number" || typeof item === "boolean") return String(item);
  if (Array.isArray(item)) return item.map(renderConceptListItem).join("; ");
  if (item && typeof item === "object") {
    const record = item as Record<string, unknown>;
    const preferred = [
      "question",
      "subtopic",
      "title",
      "name",
      "risk",
      "description",
      "recommendation",
      "purpose",
      "beat",
      "note",
    ]
      .map((key) => renderPrimitive(record[key]))
      .filter(Boolean);
    if (preferred.length) return preferred.join(": ");
    return Object.entries(record)
      .map(([key, value]) => `${humanizeKey(key)}: ${renderConceptListItem(value)}`)
      .join("; ");
  }
  return "";
}

function renderPrimitive(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function humanizeKey(key: string) {
  return key.replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
