import { Badge, Group, Paper, RingProgress, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { criticLenses } from "@/lib/critic/prompts";
import { extractCriticScore } from "@/lib/critic/score";
import type { CriticLens } from "@/lib/types";

type CriticReport = {
  id: string;
  report_type: string;
  created_at: string;
  content: Record<string, unknown> | null;
};

const lensDescriptions: Record<CriticLens, string> = {
  story_structure: "Structure and stakes",
  prose_quality: "Prose quality and voice",
  continuity: "Continuity and timeline",
  character_depth: "Character depth and interaction",
  market_fit: "Market fit and reader promise",
  theology_worldview: "Theology / worldview alignment",
  revision_priorities: "Highest-leverage revision priorities",
};

export function CriticScoreboard({ reports }: { reports: CriticReport[] }) {
  const latestByLens = getLatestReportByLens(reports);

  return (
    <Paper withBorder radius="md" p="xl" bg="white">
      <Group justify="space-between" mb="md" align="flex-start">
        <div>
          <Title order={2}>BookForge Critic</Title>
          <Text c="dimmed">Single-value evaluation graphs appear as each lens is run.</Text>
        </div>
        <Badge color="grape" variant="light">
          {reports.length} saved
        </Badge>
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {(Object.keys(criticLenses) as CriticLens[]).map((lens) => {
          const report = latestByLens.get(lens);
          const score = extractCriticScore(report?.content);
          const analyzed = Boolean(report);
          const scored = typeof score === "number";

          return (
            <Paper key={lens} withBorder radius="md" p="md" bg="#fbfaf8">
              <Group wrap="nowrap" align="center">
                <RingProgress
                  size={92}
                  thickness={9}
                  roundCaps
                  sections={[
                    {
                      value: scored ? score : 100,
                      color: scored ? scoreColor(score) : analyzed ? "grape" : "gray.3",
                    },
                  ]}
                  label={
                    <Text ta="center" fw={900} size="sm">
                      {scored ? score : "--"}
                    </Text>
                  }
                />
                <Stack gap={4} style={{ flex: 1 }}>
                  <Text fw={800} lh={1.15}>
                    {lensDescriptions[lens]}
                  </Text>
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {criticLenses[lens].instruction}
                  </Text>
                  <Group gap="xs">
                    <Badge size="sm" color={scored ? scoreColor(score) : analyzed ? "grape" : "gray"} variant="light">
                      {scored ? "Evaluated" : analyzed ? "Analyzed, no score" : "Not analyzed yet"}
                    </Badge>
                    {report && (
                      <Text size="xs" c="dimmed">
                        {new Date(report.created_at).toLocaleDateString()}
                      </Text>
                    )}
                  </Group>
                </Stack>
              </Group>
            </Paper>
          );
        })}
      </SimpleGrid>
    </Paper>
  );
}

function getLatestReportByLens(reports: CriticReport[]) {
  const map = new Map<CriticLens, CriticReport>();

  for (const report of [...reports].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))) {
    const lens = getLensFromReportType(report.report_type);
    if (!(lens in criticLenses) || map.has(lens)) continue;
    map.set(lens, report);
  }

  return map;
}

function getLensFromReportType(reportType: string) {
  return reportType.replace(/^critic_post:/, "").replace(/^critic:/, "") as CriticLens;
}

function scoreColor(score: number) {
  if (score >= 82) return "green";
  if (score >= 68) return "teal";
  if (score >= 52) return "yellow";
  return "red";
}
