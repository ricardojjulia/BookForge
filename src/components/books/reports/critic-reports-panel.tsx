"use client";

import { Accordion, Badge, Button, Group, JsonInput, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useRouter } from "next/navigation";
import { extractCriticScore } from "@/lib/critic/score";

type CriticReport = {
  id: string;
  report_type: string;
  created_at: string;
  content: Record<string, unknown> | null;
};

export function CriticReportsPanel({ bookId, reports }: { bookId: string; reports: CriticReport[] }) {
  return (
    <Paper withBorder radius="md" p="xl" bg="white" mt="xl">
      <Group justify="space-between" mb="md">
        <div>
          <Title order={2}>Saved Critic Reports</Title>
          <Text c="dimmed">BookForge Critic saves reports here for review and comparison.</Text>
        </div>
        <Badge color="grape" variant="light">
          {reports.length}
        </Badge>
      </Group>

      {!reports.length ? (
        <Text c="dimmed">No critic reports yet. Run BookForge Critic to create one.</Text>
      ) : (
        <Accordion variant="separated">
          {reports.map((report) => {
            const content = report.content || {};
            const score = extractCriticScore(content);
            return (
              <Accordion.Item key={report.id} value={report.id}>
                <Accordion.Control>
                  <Group justify="space-between" pr="md">
                    <Stack gap={2}>
                      <Group gap="xs">
                        <Badge color="grape" variant="light">
                          {formatReportType(report.report_type)}
                        </Badge>
                        {typeof score === "number" && <Badge color="teal">Score {score}</Badge>}
                      </Group>
                      <Text size="sm" c="dimmed">
                        {new Date(report.created_at).toLocaleString()}
                      </Text>
                    </Stack>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack>
                    <Text>{summary(content)}</Text>
                    <Group>
                      <RecheckCriticButton bookId={bookId} reportType={report.report_type} />
                    </Group>
                    <FindingsToggle content={content} />
                    <FullJsonToggle content={content} />
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
      )}
    </Paper>
  );
}

function RecheckCriticButton({ bookId, reportType }: { bookId: string; reportType: string }) {
  const router = useRouter();
  const [loading, { open, close }] = useDisclosure(false);
  const lens = reportType.replace(/^critic:/, "");

  async function recheck() {
    open();
    try {
      const response = await fetch(`/api/books/${bookId}/critic`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lens }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to recheck report.");
      router.refresh();
    } finally {
      close();
    }
  }

  return (
    <Button variant="light" color="grape" size="xs" loading={loading} onClick={recheck}>
      Recheck this lens
    </Button>
  );
}

function FindingsToggle({ content }: { content: Record<string, unknown> }) {
  const [opened, { toggle }] = useDisclosure(false);
  return (
    <div>
      <Button variant="subtle" color="grape" size="xs" onClick={toggle}>
        {opened ? "Hide readable findings" : "Show readable findings"}
      </Button>
      {opened && (
        <Stack mt="sm">
          <ReportCards title="Highest-leverage fixes" items={arrayItems(content.highestLeverageFixes)} />
          <ReportCards title="Recommended fixes" items={arrayItems(content.recommendedFixes)} />
          <ReportCards title="Risks" items={arrayItems(content.risks)} />
          <ReportCards title="Strengths" items={arrayItems(content.strengths)} />
        </Stack>
      )}
    </div>
  );
}

function formatReportType(type: string) {
  return type.replace(/^critic:/, "").replace(/_/g, " ");
}

function summary(content: Record<string, unknown>) {
  return (
    stringValue(content.executiveSummary) ||
    stringValue(content.summary) ||
    stringValue(content.rawModelResponse) ||
    "No summary returned."
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function arrayItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8);
}

function ReportCards({ title, items }: { title: string; items: unknown[] }) {
  if (!items.length) return null;
  return (
    <div>
      <Text fw={700} mb={4}>
        {title}
      </Text>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {items.map((item, index) => (
          <ReadableReportItem key={readableKey(item, index)} item={item} />
        ))}
      </SimpleGrid>
    </div>
  );
}

function ReadableReportItem({ item }: { item: unknown }) {
  if (!item || typeof item !== "object") {
    return (
      <Paper withBorder radius="sm" p="md" bg="#fbfaf8">
        <Text size="sm">{String(item)}</Text>
      </Paper>
    );
  }

  const record = item as Record<string, unknown>;
  const title = stringValue(record.fix) || stringValue(record.title) || stringValue(record.issueType) || "Recommendation";
  const recommendation = stringValue(record.recommendation) || stringValue(record.suggestedFix) || stringValue(record.description);

  return (
    <Paper withBorder radius="sm" p="md" bg="#fbfaf8">
      <Stack gap="xs">
        <Group gap="xs">
          {stringValue(record.impact) && (
            <Badge color={impactColor(stringValue(record.impact))} variant="light">
              Impact: {stringValue(record.impact)}
            </Badge>
          )}
          {stringValue(record.effort) && (
            <Badge color="gray" variant="light">
              Effort: {stringValue(record.effort)}
            </Badge>
          )}
          {stringValue(record.severity) && (
            <Badge color={impactColor(stringValue(record.severity))} variant="light">
              {stringValue(record.severity)}
            </Badge>
          )}
        </Group>
        <Text fw={800}>{title}</Text>
        {recommendation && (
          <Text size="sm" c="dimmed">
            {recommendation}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

function FullJsonToggle({ content }: { content: Record<string, unknown> }) {
  const [opened, { toggle }] = useDisclosure(false);
  return (
    <div>
      <Button variant="subtle" color="dark" size="xs" onClick={toggle}>
        {opened ? "Hide full JSON" : "Show full JSON"}
      </Button>
      {opened && (
        <JsonInput
          label="Full report JSON"
          value={JSON.stringify(content, null, 2)}
          autosize
          minRows={8}
          readOnly
          mt="sm"
        />
      )}
    </div>
  );
}

function readableKey(item: unknown, index: number) {
  return `${index}-${typeof item === "string" ? item : JSON.stringify(item).slice(0, 80)}`;
}

function impactColor(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("critical") || normalized.includes("high")) return "red";
  if (normalized.includes("medium")) return "yellow";
  if (normalized.includes("low")) return "green";
  return "grape";
}
