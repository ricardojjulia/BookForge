"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, Group, Paper, Select, SegmentedControl, SimpleGrid, Stack, Table, Text } from "@mantine/core";
import {
  type FreshnessSummary,
  type FreshnessTrendBucket,
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

function TrendBars({ points }: { points: FreshnessTrendBucket[] }) {
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

const EMPTY_SUMMARY: FreshnessSummary = {
  totalEvents: 0,
  byEvent: {
    freshness_refresh_attempt: 0,
    freshness_refresh_success: 0,
    freshness_refresh_failed: 0,
    freshness_forced_refresh_triggered: 0,
  },
  routes: [],
  latestFailures: [],
};

const EMPTY_TREND: FreshnessTrendBucket[] = [];

export function FreshnessTelemetryPanel() {
  const [windowValue, setWindowValue] = useState<"24h" | "7d">("24h");
  const [routeKey, setRouteKey] = useState<string>("all");
  const [summary, setSummary] = useState<FreshnessSummary>(EMPTY_SUMMARY);
  const [trend, setTrend] = useState<FreshnessTrendBucket[]>(EMPTY_TREND);
  const [routeOptions, setRouteOptions] = useState<Array<{ label: string; value: string }>>([{ label: "All routes", value: "all" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [totalInWindow, setTotalInWindow] = useState(0);

  const limit = 100;
  const offset = page * limit;

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("window", windowValue);
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    if (routeKey !== "all") params.set("routeKey", routeKey);
    return `/api/analytics/freshness?${params.toString()}`;
  }, [limit, offset, routeKey, windowValue]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(requestUrl, { cache: "no-store" });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Failed to load freshness telemetry.");
        }

        if (cancelled) return;

        setSummary(data.summary ?? EMPTY_SUMMARY);
        setTrend((data.trend ?? EMPTY_TREND) as FreshnessTrendBucket[]);
        setTotalInWindow(data.pagination?.totalInWindow ?? 0);

        const routeChoices = [
          { label: "All routes", value: "all" },
          ...((data.summary?.routes ?? []) as Array<{ routeKey: string }>)
            .map((route) => route.routeKey)
            .sort((a, b) => a.localeCompare(b))
            .map((route) => ({ label: route, value: route })),
        ];
        setRouteOptions(routeChoices);
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load freshness telemetry.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [requestUrl]);

  const totalPages = Math.max(1, Math.ceil(totalInWindow / limit));

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
            onChange={(value) => {
              setPage(0);
              setWindowValue(value as "24h" | "7d");
            }}
            data={[
              { label: "24h", value: "24h" },
              { label: "7d", value: "7d" },
            ]}
          />
          <Select
            w={240}
            value={routeKey}
            onChange={(value) => {
              setPage(0);
              setRouteKey(value ?? "all");
            }}
            data={routeOptions}
            searchable
          />
        </Group>
      </Group>

      {error && <Text size="sm" c="red">{error}</Text>}
      {loading && <Text size="sm" c="dimmed">Loading freshness telemetry…</Text>}

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

      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          Showing {offset + 1}-{Math.min(offset + limit, totalInWindow)} of {totalInWindow} row(s)
        </Text>
        <Group gap="xs">
          <Paper
            withBorder
            px="sm"
            py={4}
            style={{ cursor: page > 0 ? "pointer" : "not-allowed", opacity: page > 0 ? 1 : 0.5 }}
            onClick={() => page > 0 && setPage(page - 1)}
          >
            <Text size="xs">Previous</Text>
          </Paper>
          <Text size="xs" c="dimmed">Page {page + 1} of {totalPages}</Text>
          <Paper
            withBorder
            px="sm"
            py={4}
            style={{ cursor: page + 1 < totalPages ? "pointer" : "not-allowed", opacity: page + 1 < totalPages ? 1 : 0.5 }}
            onClick={() => page + 1 < totalPages && setPage(page + 1)}
          >
            <Text size="xs">Next</Text>
          </Paper>
        </Group>
      </Group>
    </Stack>
  );
}
