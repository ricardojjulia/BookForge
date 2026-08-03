"use client";

import { Badge, Table, Text } from "@mantine/core";

export type DailyCallStatsRow = {
  day: string;
  call_count: number;
  success_count: number;
  avg_duration_ms: number | null;
  p50_duration_ms: number | null;
  p95_duration_ms: number | null;
};

export type ModelCallStatsRow = {
  model: string;
  call_count: number;
  success_count: number;
  avg_duration_ms: number | null;
};

function fmtSeconds(ms: number | null) {
  if (ms === null || !Number.isFinite(ms)) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

function successRate(successCount: number, callCount: number) {
  if (!callCount) return null;
  return Math.round((successCount / callCount) * 100);
}

function successColor(rate: number | null) {
  if (rate === null) return "gray";
  if (rate >= 85) return "green";
  if (rate >= 70) return "yellow";
  return "red";
}

// Today's date is derived from the first row (data is ordered newest-first
// by the RPC), not from the client's clock -- avoids a mismatch if the
// server and browser disagree on "today" near a UTC day boundary.
export function DailyCallStatsTable({ rows }: { rows: DailyCallStatsRow[] }) {
  if (!rows.length) {
    return <Text c="dimmed" size="sm">No model calls recorded yet.</Text>;
  }
  const today = rows[0]?.day;

  return (
    <Table.ScrollContainer minWidth={640}>
      <Table verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Day</Table.Th>
            <Table.Th>Calls</Table.Th>
            <Table.Th>Success rate</Table.Th>
            <Table.Th>Avg</Table.Th>
            <Table.Th>p50</Table.Th>
            <Table.Th>p95</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => {
            const rate = successRate(row.success_count, row.call_count);
            return (
              <Table.Tr key={row.day} bg={row.day === today ? "var(--mantine-color-grape-0)" : undefined}>
                <Table.Td>
                  {row.day}
                  {row.day === today && (
                    <Badge ml={6} size="xs" color="grape" variant="light">
                      Today
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>{row.call_count}</Table.Td>
                <Table.Td>
                  <Badge color={successColor(rate)} variant="light" size="sm">
                    {rate === null ? "—" : `${rate}%`}
                  </Badge>
                </Table.Td>
                <Table.Td>{fmtSeconds(row.avg_duration_ms)}</Table.Td>
                <Table.Td>{fmtSeconds(row.p50_duration_ms)}</Table.Td>
                <Table.Td>{fmtSeconds(row.p95_duration_ms)}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

export function ModelCallBreakdownTable({ rows }: { rows: ModelCallStatsRow[] }) {
  if (!rows.length) {
    return <Text c="dimmed" size="sm">No model calls recorded yet.</Text>;
  }
  return (
    <Table.ScrollContainer minWidth={480}>
      <Table verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Model</Table.Th>
            <Table.Th>Calls</Table.Th>
            <Table.Th>Success rate</Table.Th>
            <Table.Th>Avg duration</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => {
            const rate = successRate(row.success_count, row.call_count);
            return (
              <Table.Tr key={row.model}>
                <Table.Td>
                  <Text size="sm" ff="monospace">{row.model}</Text>
                </Table.Td>
                <Table.Td>{row.call_count}</Table.Td>
                <Table.Td>
                  <Badge color={successColor(rate)} variant="light" size="sm">
                    {rate === null ? "—" : `${rate}%`}
                  </Badge>
                </Table.Td>
                <Table.Td>{fmtSeconds(row.avg_duration_ms)}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
