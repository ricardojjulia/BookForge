"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Box, Group, Paper, Select, SegmentedControl, SimpleGrid, Stack, Table, Text } from "@mantine/core";
import {
  type FreshnessAlertRow,
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

const EVENT_FILTER_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "All events", value: "all" },
  { label: "Refresh attempt", value: "freshness_refresh_attempt" },
  { label: "Refresh success", value: "freshness_refresh_success" },
  { label: "Refresh failed", value: "freshness_refresh_failed" },
  { label: "Forced refresh triggered", value: "freshness_forced_refresh_triggered" },
];

const STATUS_FILTER_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "All statuses", value: "all" },
  { label: "Fresh", value: "fresh" },
  { label: "Stale", value: "stale" },
  { label: "Expired", value: "expired" },
];

export function FreshnessTelemetryPanel() {
  const [windowValue, setWindowValue] = useState<"24h" | "7d">("24h");
  const [routeKey, setRouteKey] = useState<string>("all");
  const [eventName, setEventName] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [summary, setSummary] = useState<FreshnessSummary>(EMPTY_SUMMARY);
  const [trend, setTrend] = useState<FreshnessTrendBucket[]>(EMPTY_TREND);
  const [rows, setRows] = useState<Array<{
    id?: string;
    event_name: string;
    route_key: string;
    status: string;
    error: string | null;
    occurred_at: string;
  }>>([]);
  const [alerts, setAlerts] = useState<FreshnessAlertRow[]>([]);
  const [routeOptions, setRouteOptions] = useState<Array<{ label: string; value: string }>>([{ label: "All routes", value: "all" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [page, setPage] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalInWindow, setTotalInWindow] = useState(0);

  const limit = 100;
  const currentCursor = cursorStack[page] ?? null;

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("window", windowValue);
    params.set("limit", String(limit));
    if (currentCursor) params.set("cursor", currentCursor);
    if (routeKey !== "all") params.set("routeKey", routeKey);
    if (eventName !== "all") params.set("eventName", eventName);
    if (status !== "all") params.set("status", status);
    return `/api/analytics/freshness?${params.toString()}`;
  }, [currentCursor, eventName, limit, routeKey, status, windowValue]);

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
        setRows(data.rows ?? []);
        setAlerts((data.alerts ?? []) as FreshnessAlertRow[]);
        setTotalInWindow(data.pagination?.totalInWindow ?? 0);
        setNextCursor(data.pagination?.nextCursor ?? null);
        setHasMore(Boolean(data.pagination?.hasMore));

        const routeChoices = [
          { label: "All routes", value: "all" },
          ...((data.availableRoutes ?? []) as string[])
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
  const pageStart = page * limit + 1;
  const pageEnd = Math.min(page * limit + rows.length, totalInWindow);
  const attempts = summary.byEvent.freshness_refresh_attempt;
  const successes = summary.byEvent.freshness_refresh_success;
  const failures = summary.byEvent.freshness_refresh_failed;
  const forced = summary.byEvent.freshness_forced_refresh_triggered;
  const successRate = attempts > 0 ? Math.round((successes / attempts) * 100) : null;
  const failureRate = attempts > 0 ? Math.round((failures / attempts) * 100) : null;
  const forcedRate = attempts > 0 ? Math.round((forced / attempts) * 100) : null;

  function resetPagination() {
    setPage(0);
    setCursorStack([null]);
    setNextCursor(null);
    setHasMore(false);
  }

  function onNextPage() {
    if (!hasMore || !nextCursor) return;
    setCursorStack((prev) => {
      const next = [...prev];
      next[page + 1] = nextCursor;
      return next;
    });
    setPage((prev) => prev + 1);
  }

  function onPreviousPage() {
    if (page === 0) return;
    setPage((prev) => Math.max(0, prev - 1));
  }

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
              resetPagination();
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
              resetPagination();
              setRouteKey(value ?? "all");
            }}
            data={routeOptions}
            searchable
          />
          <Select
            w={220}
            value={eventName}
            onChange={(value) => {
              resetPagination();
              setEventName(value ?? "all");
            }}
            data={EVENT_FILTER_OPTIONS}
          />
          <Select
            w={180}
            value={status}
            onChange={(value) => {
              resetPagination();
              setStatus(value ?? "all");
            }}
            data={STATUS_FILTER_OPTIONS}
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

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Paper withBorder radius="md" p="sm">
          <Group justify="space-between">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Refresh Success Rate</Text>
            <Badge color={successRate === null ? "gray" : successRate >= 95 ? "green" : successRate >= 90 ? "yellow" : "red"} variant="light">
              {successRate === null ? "n/a" : successRate >= 95 ? "healthy" : "degraded"}
            </Badge>
          </Group>
          <Text fw={700} mt={4}>{successRate === null ? "—" : `${successRate}%`}</Text>
          <Text size="xs" c="dimmed">SLO target ≥ 95%</Text>
        </Paper>

        <Paper withBorder radius="md" p="sm">
          <Group justify="space-between">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Refresh Failure Rate</Text>
            <Badge color={failureRate === null ? "gray" : failureRate <= 5 ? "green" : failureRate <= 10 ? "yellow" : "red"} variant="light">
              {failureRate === null ? "n/a" : failureRate <= 5 ? "healthy" : "degraded"}
            </Badge>
          </Group>
          <Text fw={700} mt={4}>{failureRate === null ? "—" : `${failureRate}%`}</Text>
          <Text size="xs" c="dimmed">SLO target ≤ 5%</Text>
        </Paper>

        <Paper withBorder radius="md" p="sm">
          <Group justify="space-between">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Forced Refresh Rate</Text>
            <Badge color={forcedRate === null ? "gray" : forcedRate <= 10 ? "green" : forcedRate <= 20 ? "yellow" : "red"} variant="light">
              {forcedRate === null ? "n/a" : forcedRate <= 10 ? "healthy" : "watch"}
            </Badge>
          </Group>
          <Text fw={700} mt={4}>{forcedRate === null ? "—" : `${forcedRate}%`}</Text>
          <Text size="xs" c="dimmed">SLO target ≤ 10%</Text>
        </Paper>
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

      {alerts.length > 0 && (
        <Stack gap={4}>
          <Text size="sm" fw={600}>Active reliability alerts</Text>
          {alerts.map((alert) => (
            <Group key={alert.id} gap="xs" wrap="wrap">
              <Badge color={alert.severity === "critical" ? "red" : "yellow"} variant="light">
                {alert.severity}
              </Badge>
              <Text size="xs" c="dimmed">
                {new Date(alert.created_at).toLocaleString()} • {alert.route_key} • {alert.reason.replace(/_/g, " ")}
              </Text>
            </Group>
          ))}
        </Stack>
      )}

      {rows.length > 0 && (
        <Table withTableBorder withColumnBorders fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Occurred</Table.Th>
              <Table.Th>Route</Table.Th>
              <Table.Th>Event</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Error</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row, index) => (
              <Table.Tr key={row.id ?? `${row.occurred_at}:${index}`}>
                <Table.Td>{new Date(row.occurred_at).toLocaleString()}</Table.Td>
                <Table.Td>{row.route_key}</Table.Td>
                <Table.Td>{row.event_name}</Table.Td>
                <Table.Td>{row.status}</Table.Td>
                <Table.Td>{row.error ?? "—"}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          Showing {rows.length ? pageStart : 0}-{rows.length ? pageEnd : 0} of {totalInWindow} row(s)
        </Text>
        <Group gap="xs">
          <Paper
            withBorder
            px="sm"
            py={4}
            style={{ cursor: page > 0 ? "pointer" : "not-allowed", opacity: page > 0 ? 1 : 0.5 }}
            onClick={onPreviousPage}
          >
            <Text size="xs">Previous</Text>
          </Paper>
          <Text size="xs" c="dimmed">Page {page + 1} of {totalPages}</Text>
          <Paper
            withBorder
            px="sm"
            py={4}
            style={{ cursor: hasMore ? "pointer" : "not-allowed", opacity: hasMore ? 1 : 0.5 }}
            onClick={onNextPage}
          >
            <Text size="xs">Next</Text>
          </Paper>
        </Group>
      </Group>
    </Stack>
  );
}
