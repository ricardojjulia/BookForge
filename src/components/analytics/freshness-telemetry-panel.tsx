"use client";

import { useMemo, useState } from "react";
import { Box, Group, Paper, Select, SegmentedControl, SimpleGrid, Stack, Table, Text } from "@mantine/core";
import {
  buildFreshnessTrend,
  filterFreshnessEvents,
  summarizeFreshnessEvents,
  type FreshnessEventRow,
  type FreshnessWindowHours,
} from "@/lib/freshness/analytics";

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Paper withBorder radius="md" p="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
      <Text size="xl" fw={700} mt={4}>{value}</Text>
      {sub && <Text size="xs" c="dimmed">{sub}</Text>}
    </Paper>
  );
}

function TrendBars({ points }: { points: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...points.map((point) => point.count));

  return (
    <Paper withBorder radius="md" p="sm">
      <Text size="xs" fw={600} mb="xs">Event trend</Text>
      <Group align="flex-end" gap="xs" wrap="nowrap">
        {points.map((point) => (
          <Stack key={point.label} gap={4} align="center" style={{ flex: 1 }}>
            <Text size="xs" c="dimmed">{point.count}</Text>
            <Box
              bg="grape.5"
              w="100%"
              style={{
                borderRadius: 6,
                minHeight: 8,
                height: `${Math.max(8, Math.round((point.count / max) * 72))}px`,
              }}
            />
            <Text size="xs" c="dimmed">{point.label}</Text>
          </Stack>
        ))}
      </Group>
    </Paper>
  );
}

export function FreshnessTelemetryPanel({ rows, fetchedAt }: { rows: FreshnessEventRow[]; fetchedAt: string }) {
  const asOf = useMemo(() => new Date(fetchedAt), [fetchedAt]);
  const [windowValue, setWindowValue] = useState<"24h" | "7d">("24h");
  const [routeKey, setRouteKey] = useState<string>("all");

  const routeOptions = useMemo(
    () => [
      { label: "All routes", value: "all" },
      ...Array.from(new Set(rows.map((row) => row.route_key)))
        .sort((a, b) => a.localeCompare(b))
        .map((route) => ({ label: route, value: route })),
    ],
    [rows],
  );

  const windowHours: FreshnessWindowHours = windowValue === "24h" ? 24 : 168;
  const filteredRows = useMemo(
    () =>
      filterFreshnessEvents(rows, {
        windowHours,
        routeKey: routeKey === "all" ? null : routeKey,
        asOf,
      }),
    [asOf, routeKey, rows, windowHours],
  );

  const summary = useMemo(() => summarizeFreshnessEvents(filteredRows), [filteredRows]);
  const trend = useMemo(() => buildFreshnessTrend(filteredRows, { windowHours, asOf }), [asOf, filteredRows, windowHours]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div>
          <Text fw={600}>Freshness Telemetry</Text>
          <Text size="xs" c="dimmed">Filter by window and route to inspect refresh reliability.</Text>
        </div>
        <Group gap="sm" wrap="wrap">
          <SegmentedControl
            value={windowValue}
            onChange={(value) => setWindowValue(value as "24h" | "7d")}
            data={[
              { label: "24h", value: "24h" },
              { label: "7d", value: "7d" },
            ]}
          />
          <Select
            w={240}
            value={routeKey}
            onChange={(value) => setRouteKey(value ?? "all")}
            data={routeOptions}
            searchable
          />
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <MetricCard
          label="Refresh Attempts"
          value={String(summary.byEvent.freshness_refresh_attempt)}
          sub={`${summary.totalEvents} total events`}
        />
        <MetricCard
          label="Refresh Success"
          value={String(summary.byEvent.freshness_refresh_success)}
        />
        <MetricCard
          label="Refresh Failed"
          value={String(summary.byEvent.freshness_refresh_failed)}
        />
        <MetricCard
          label="Forced Triggered"
          value={String(summary.byEvent.freshness_forced_refresh_triggered)}
        />
      </SimpleGrid>

      <TrendBars points={trend} />

      {summary.routes.length > 0 ? (
        <Table withTableBorder withColumnBorders striped fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Route</Table.Th>
              <Table.Th>Total Events</Table.Th>
              <Table.Th>Attempts</Table.Th>
              <Table.Th>Success</Table.Th>
              <Table.Th>Failed</Table.Th>
              <Table.Th>Forced</Table.Th>
              <Table.Th>Success Rate</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {summary.routes.slice(0, 12).map((route) => (
              <Table.Tr key={route.routeKey}>
                <Table.Td>{route.routeKey}</Table.Td>
                <Table.Td>{route.total}</Table.Td>
                <Table.Td>{route.attempts}</Table.Td>
                <Table.Td>{route.successes}</Table.Td>
                <Table.Td>{route.failures}</Table.Td>
                <Table.Td>{route.forcedTriggers}</Table.Td>
                <Table.Td>{route.successRate !== null ? `${route.successRate}%` : "—"}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Text size="sm" c="dimmed">No freshness telemetry for current filters.</Text>
      )}

      {summary.latestFailures.length > 0 && (
        <Stack gap={4}>
          <Text size="sm" fw={600}>Latest refresh failures</Text>
          {summary.latestFailures.map((failure, index) => (
            <Text size="xs" c="dimmed" key={`${failure.routeKey}:${failure.occurredAt}:${index}`}>
              {new Date(failure.occurredAt).toLocaleString()} • {failure.routeKey} • {failure.error}
            </Text>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
