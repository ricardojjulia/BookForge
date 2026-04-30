import { Badge, Group, JsonInput, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { applyRewritePlanDefaults } from "@/lib/rewrite/plan-defaults";

type ChapterContext = { chapter_number: number; title: string | null; summary: string | null };

export function RewritePlanView({
  content,
  chapters = [],
}: {
  content: Record<string, unknown> | null;
  chapters?: ChapterContext[];
}) {
  if (!content) {
    return (
      <Paper withBorder radius="md" p="xl" bg="white">
        <Title order={2}>No rewrite plan yet</Title>
        <Text c="dimmed" mt="xs">
          Generate a plan after chapter summaries, Manuscript Blueprint, and Critic reports are ready.
        </Text>
      </Paper>
    );
  }

  const plan = applyRewritePlanDefaults(content, { chapters });

  return (
    <Stack>
      <Paper withBorder radius="md" p="xl" bg="white">
        <Group justify="space-between" mb="md">
          <Title order={2}>Rewrite Objective</Title>
          <Badge color="grape" variant="light">
            Structured plan
          </Badge>
        </Group>
        <Text>{stringValue(plan.rewriteObjective) || "No objective returned."}</Text>
        {stringValue(plan.contextContinuityMandate) && (
          <Text mt="md" fw={700}>
            Context mandate: {stringValue(plan.contextContinuityMandate)}
          </Text>
        )}
      </Paper>

      <Paper withBorder radius="md" p="xl" bg="white">
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 800 }}>Plan Details</summary>
          <Stack mt="md">
            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              <ListPanel title="Global Guardrails" items={arrayValue(plan.globalGuardrails)} />
              <ObjectPanel title="Coherence Contract" value={objectValue(plan.coherenceContract)} />
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              <ObjectPanel
                title="Required Context Packet Per Call"
                value={objectValue(plan.contextPacketRequiredForEveryRewriteCall)}
              />
              <ObjectPanel title="Continuity Ledger" value={objectValue(plan.continuityLedger)} />
            </SimpleGrid>

            <RewriteModelPanel selection={objectValue(plan.rewriteModelSelection)} />
            <ObjectPanel title="Execution Strategy" value={objectValue(plan.executionStrategy)} />
            <ListPanel title="Unit Rewrite Protocol" items={arrayValue(plan.unitRewriteProtocol)} />
            <PhasePanel phases={arrayValue(plan.phases)} />
            <ChapterDirectivePanel directives={arrayValue(plan.chapterRewriteDirectives)} />
            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              <ListPanel title="Drift Checks" items={arrayValue(plan.driftChecks)} />
              <ListPanel title="Between-Phase Validation" items={arrayValue(plan.betweenPhaseValidation)} />
            </SimpleGrid>
            <ListPanel title="Post-Rewrite Critic Passes" items={arrayValue(plan.postRewriteCriticPasses)} />
            <ListPanel title="Acceptance Criteria" items={arrayValue(plan.acceptanceCriteria)} />
          </Stack>
        </details>
      </Paper>

      <Paper withBorder radius="md" p="xl" bg="white">
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 800 }}>Advanced: full rewrite plan JSON</summary>
          <JsonInput
            label="Full rewrite plan JSON"
            value={JSON.stringify(plan, null, 2)}
            autosize
            minRows={10}
            readOnly
            mt="md"
          />
        </details>
      </Paper>
    </Stack>
  );
}

function RewriteModelPanel({ selection }: { selection: Record<string, unknown> }) {
  const best = objectValue(selection.best);
  const score = Number(best.score ?? 0);
  const warning = stringValue(selection.warning);

  return (
    <Paper withBorder radius="md" p="xl" bg="white">
      <Group justify="space-between" mb="md">
        <Title order={2}>Rewrite Model Fit</Title>
        <Badge color={score >= 80 ? "green" : "yellow"} variant="light">
          {score ? `${score}% suited` : "Not scored"}
        </Badge>
      </Group>
      <Text fw={800}>{stringValue(best.model) || "No rewrite model selected"}</Text>
      <Text size="sm" c="dimmed" mt={4}>
        {arrayValue(best.reasons).map(readableValue).join(" ")}
      </Text>
      {warning && (
        <Text mt="md" c="orange" fw={700}>
          {warning}
        </Text>
      )}
    </Paper>
  );
}

function PhasePanel({ phases }: { phases: unknown[] }) {
  return (
    <Paper withBorder radius="md" p="xl" bg="white">
      <Title order={2} mb="md">
        Rewrite Phases
      </Title>
      <Stack>
        {phases.length ? (
          phases.map((phase, index) => {
            const item = objectValue(phase);
            return (
              <Paper key={index} withBorder radius="sm" p="md" bg="#fbfaf8">
                <Group gap="xs" mb="xs">
                  <Badge color="grape">Phase {stringValue(item.phase) || index + 1}</Badge>
                  <Badge color="teal" variant="light">
                    {stringValue(item.aiModelType) || "model"}
                  </Badge>
                  <Badge color="gray" variant="light">
                    {stringValue(item.unitStrategy) || "units"}
                  </Badge>
                </Group>
                <Text fw={800}>{stringValue(item.name) || "Untitled phase"}</Text>
                <Text size="sm" c="dimmed" mt={4}>
                  {stringValue(item.purpose)}
                </Text>
                <Text size="sm" mt="xs">
                  <strong>Continuity check:</strong> {stringValue(item.continuityCheck) || "Not specified"}
                </Text>
                <Text size="sm" mt={4}>
                  <strong>Quality gate:</strong> {stringValue(item.qualityGate) || "Not specified"}
                </Text>
              </Paper>
            );
          })
        ) : (
          <Text c="dimmed">No phases returned.</Text>
        )}
      </Stack>
    </Paper>
  );
}

function ChapterDirectivePanel({ directives }: { directives: unknown[] }) {
  return (
    <Paper withBorder radius="md" p="xl" bg="white">
      <Title order={2} mb="md">
        Chapter Rewrite Directives
      </Title>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {directives.slice(0, 12).map((directive, index) => {
          const item = objectValue(directive);
          return (
            <Paper key={index} withBorder radius="sm" p="md" bg="#fbfaf8">
              <Text fw={800}>
                {stringValue(item.chapterNumber) || index + 1}. {stringValue(item.chapterTitle) || "Untitled"}
              </Text>
              <Text size="sm" c="dimmed" mt={4}>
                {stringValue(item.primaryGoal)}
              </Text>
            </Paper>
          );
        })}
      </SimpleGrid>
    </Paper>
  );
}

function ListPanel({ title, items }: { title: string; items: unknown[] }) {
  return (
    <Paper withBorder radius="md" p="xl" bg="white">
      <Title order={2} mb="md">
        {title}
      </Title>
      <Stack gap="xs">
        {items.length ? items.map((item, index) => <Text key={index}>• {readableValue(item)}</Text>) : <Text c="dimmed">None returned.</Text>}
      </Stack>
    </Paper>
  );
}

function ObjectPanel({ title, value }: { title: string; value: Record<string, unknown> }) {
  return (
    <Paper withBorder radius="md" p="xl" bg="white">
      <Title order={2} mb="md">
        {title}
      </Title>
      <Stack gap="xs">
        {Object.keys(value).length ? (
          Object.entries(value).map(([key, item]) => (
            <Text key={key}>
              <strong>{formatKey(key)}:</strong> {readableValue(item)}
            </Text>
          ))
        ) : (
          <Text c="dimmed">None returned.</Text>
        )}
      </Stack>
    </Paper>
  );
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  if (typeof value === "number") return String(value);
  return typeof value === "string" ? value : "";
}

function readableValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Required" : "Not required";
  if (Array.isArray(value)) return value.map(readableValue).join(", ");
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (typeof object.description === "string" && typeof object.lens === "string") {
      return `${formatKey(object.lens.replace(/_/g, " "))}: ${object.description}`;
    }
    if (typeof object.name === "string" && typeof object.description === "string") {
      return `${object.name}: ${object.description}`;
    }
    if (typeof object.title === "string" && typeof object.recommendation === "string") {
      return `${object.title}: ${object.recommendation}`;
    }
    if (typeof object.fix === "string" && typeof object.recommendation === "string") {
      return `${object.fix}: ${object.recommendation}`;
    }
    return Object.entries(object)
      .map(([key, item]) => `${formatKey(key)}: ${readableValue(item)}`)
      .join("; ");
  }
  return "";
}

function formatKey(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}
