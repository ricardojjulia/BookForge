"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Group, Text } from "@mantine/core";
import { useRouter } from "next/navigation";
import { evaluateFreshness, formatAge } from "@/lib/freshness/policy";

const STORAGE_PREFIX = "bookforge:freshness:";

export function DataFreshnessBanner({
  routeKey,
  fetchedAt,
  label = "Data",
  staleAfterHours = 24,
  forceAfterHours = 48,
}: {
  routeKey: string;
  fetchedAt: string;
  label?: string;
  staleAfterHours?: number;
  forceAfterHours?: number;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const hasAutoForced = useRef(false);

  const storageKey = `${STORAGE_PREFIX}${routeKey}`;
  const referenceTime = useMemo(() => {
    if (typeof window === "undefined") return new Date(fetchedAt);
    const existing = window.localStorage.getItem(storageKey);
    if (!existing) {
      window.localStorage.setItem(storageKey, fetchedAt);
      return new Date(fetchedAt);
    }
    const parsed = new Date(existing);
    return Number.isFinite(parsed.getTime()) ? parsed : new Date(fetchedAt);
  }, [fetchedAt, storageKey]);

  const freshness = useMemo(
    () =>
      evaluateFreshness({
        asOf: new Date(),
        fetchedAt: referenceTime,
        policy: { staleAfterHours, forceAfterHours },
      }),
    [forceAfterHours, referenceTime, staleAfterHours],
  );

  async function refreshNow(reason: "manual" | "forced") {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const nowIso = new Date().toISOString();
      window.localStorage.setItem(storageKey, nowIso);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Refresh failed.";
      setRefreshError(message);
      if (reason === "forced") {
        setRefreshError(`Forced refresh failed: ${message}. Showing last available snapshot.`);
      }
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (freshness.status !== "expired" || hasAutoForced.current) return;
    hasAutoForced.current = true;
    void refreshNow("forced");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshness.status]);

  const color = freshness.status === "fresh" ? "teal" : freshness.status === "stale" ? "yellow" : "red";
  const title =
    freshness.status === "fresh"
      ? `${label} is fresh`
      : freshness.status === "stale"
        ? `${label} is stale`
        : `${label} has expired`;

  return (
    <Alert color={color} title={title} variant="light" mb="md">
      <Group justify="space-between" align="center" wrap="wrap">
        <Text size="sm">
          Data fetched {formatAge(freshness.ageMs)} ago. {freshness.status === "expired" ? "A forced refresh was triggered." : "Would you like to refresh now?"}
        </Text>
        <Button size="xs" color={color === "red" ? "orange" : "grape"} loading={refreshing} onClick={() => void refreshNow("manual")}>
          Refresh now
        </Button>
      </Group>
      {refreshError && (
        <Text size="xs" c="red" mt="xs">
          {refreshError}
        </Text>
      )}
    </Alert>
  );
}
