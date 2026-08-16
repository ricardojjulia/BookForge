import { Badge, Group, Paper, RingProgress, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { criticLenses } from "@/lib/critic/prompts";
import { isCriticReportType } from "@/lib/critic/progress";
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
  contemporary_view: "Contemporary View alignment",
  revision_priorities: "Highest-leverage revision priorities",
  dialogue_density: "Dialogue density vs. author's setting",
};

// Reports newer than this render as "just updated" -- a colored border plus
// a relative-time badge instead of the plain date -- so a critic re-run
// (e.g. Focused Rewrite's Re-evaluate stage) is noticeable here even after
// its own completion message has scrolled away or been dismissed.
const RECENT_THRESHOLD_MS = 15 * 60 * 1000;

export function CriticScoreboard({ reports }: { reports: CriticReport[] }) {
  // `reports` here is often the book's raw, unfiltered coherence_reports
  // feed (rewrite_execution, rewrite_plan, drift checks, etc. included) --
  // the badge must only count the critic ones, or it silently displays a
  // number larger than the 8 possible lenses could ever produce.
  const criticReports = reports.filter((report) => isCriticReportType(report.report_type));
  const latestByLens = getLatestReportByLens(criticReports);
  const now = Date.now();

  return (
    <Paper withBorder radius="md" p="xl" bg="white">
      <Group justify="space-between" mb="md" align="flex-start">
        <div>
          <Title order={2}>BookForge Critic</Title>
          <Text c="dimmed">Single-value evaluation graphs appear as each lens is run.</Text>
        </div>
        <Badge color="grape" variant="light">
          {criticReports.length} saved
        </Badge>
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {(Object.keys(criticLenses) as CriticLens[]).map((lens) => {
          const report = latestByLens.get(lens);
          const score = extractCriticScore(report?.content);
          const analyzed = Boolean(report);
          const scored = typeof score === "number";
          const ageMs = report ? now - Date.parse(report.created_at) : Infinity;
          const isRecent = ageMs < RECENT_THRESHOLD_MS;

          return (
            <Paper
              key={lens}
              withBorder
              radius="md"
              p="md"
              bg="#fbfaf8"
              style={isRecent ? { borderColor: "var(--mantine-color-grape-5)", borderWidth: 2 } : undefined}
            >
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
                    {report && isRecent && (
                      <Badge size="sm" color="grape" variant="filled">
                        Updated {formatRecency(ageMs)}
                      </Badge>
                    )}
                    {report && !isRecent && (
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

function formatRecency(ageMs: number) {
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return "just now";
  return `${minutes}m ago`;
}

function scoreColor(score: number) {
  if (score >= 82) return "green";
  if (score >= 68) return "teal";
  if (score >= 52) return "yellow";
  return "red";
}
