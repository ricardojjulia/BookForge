"use client";

import { Alert, Badge, Group, Modal, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { ManuscriptHealthCard } from "@/components/books/manuscript-health-card";
import { auditBookStructure, type StructureAuditChapter, type StructureAuditParagraph } from "@/lib/structure/audit";

export function StructureAuditPanel({
  chapters,
  paragraphs,
}: {
  chapters: StructureAuditChapter[];
  paragraphs: StructureAuditParagraph[];
}) {
  const [opened, { open, close }] = useDisclosure(false);
  const issues = auditBookStructure(chapters, paragraphs);
  const high = issues.filter((issue) => issue.severity === "high").length;
  const medium = issues.filter((issue) => issue.severity === "medium").length;

  return (
    <>
      <ManuscriptHealthCard
        icon="🔍"
        title="Structure Audit"
        description="Flags chapter-boundary and import issues before you repair the manuscript structure."
        pills={[
          { label: `${high} HIGH`, tone: high ? "warn" : "ok" },
          { label: `${medium} MEDIUM`, tone: medium ? "warn" : "ok" },
        ]}
        actionLabel="Run Audit"
        onAction={open}
        warning={high > 0 || medium > 0}
      />

      <Modal opened={opened} onClose={close} title="Structure Audit" size="75rem" centered>
        <Stack>
          <Group gap="xs">
            <Badge color={high ? "red" : "green"} variant="light">
              {high} high
            </Badge>
            <Badge color={medium ? "yellow" : "green"} variant="light">
              {medium} medium
            </Badge>
          </Group>

          {!issues.length ? (
            <Alert color="green">No obvious chapter structure problems detected.</Alert>
          ) : (
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              {issues.map((issue) => (
                <Paper key={issue.id} withBorder radius="md" p="md" bg="#fbfaf8">
                  <Stack gap="xs">
                    <Group gap="xs">
                      <Badge color={issue.severity === "high" ? "red" : issue.severity === "medium" ? "yellow" : "gray"}>
                        {issue.severity}
                      </Badge>
                      {issue.chapterNumber && (
                        <Badge color="grape" variant="light">
                          Chapter {issue.chapterNumber}
                        </Badge>
                      )}
                    </Group>
                    <Text fw={800}>{issue.title}</Text>
                    <Text size="sm" c="dimmed">
                      {issue.description}
                    </Text>
                  </Stack>
                </Paper>
              ))}
            </SimpleGrid>
          )}
        </Stack>
      </Modal>
    </>
  );
}
