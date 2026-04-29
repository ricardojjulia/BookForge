import { Alert, Badge, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { auditBookStructure, type StructureAuditChapter, type StructureAuditParagraph } from "@/lib/structure/audit";

export function StructureAuditPanel({
  chapters,
  paragraphs,
}: {
  chapters: StructureAuditChapter[];
  paragraphs: StructureAuditParagraph[];
}) {
  const issues = auditBookStructure(chapters, paragraphs);
  const high = issues.filter((issue) => issue.severity === "high").length;
  const medium = issues.filter((issue) => issue.severity === "medium").length;

  return (
    <Paper withBorder radius="md" p="xl" bg="white" mt="xl">
      <Group justify="space-between" mb="md" align="flex-start">
        <div>
          <Title order={2}>Structure Audit</Title>
          <Text c="dimmed">
            Flags chapter-boundary and import issues before you repair the manuscript structure.
          </Text>
        </div>
        <Group gap="xs">
          <Badge color={high ? "red" : "green"} variant="light">
            {high} high
          </Badge>
          <Badge color={medium ? "yellow" : "green"} variant="light">
            {medium} medium
          </Badge>
        </Group>
      </Group>

      {!issues.length ? (
        <Alert color="green">No obvious chapter structure problems detected.</Alert>
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          {issues.slice(0, 12).map((issue) => (
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
    </Paper>
  );
}
