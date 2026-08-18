"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Group, Text } from "@mantine/core";
import { useRouter } from "next/navigation";
import { evaluateFreshness, formatAge } from "@/lib/freshness/policy";
import { emitFreshnessTelemetry } from "@/lib/freshness/telemetry";

const STORAGE_PREFIX = "bookforge:freshness:";

export function DataFreshnessBanner({
  routeKey,
  fetchedAt,
  label = "Data",
  staleAfterHours = 24,
  forceAfterHours = 48,
  variant = "alert",
}: {
  routeKey: string;
  fetchedAt: string;
  label?: string;
  staleAfterHours?: number;
  forceAfterHours?: number;
  /** "subtle": a single text row + outline button, no colored Alert chrome. */
  variant?: "alert" | "subtle";
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const hasAutoForced = useRef(false);

  const storageKey = `${STORAGE_PREFIX}${routeKey}`;
  // Anchored to fetchedAt (matching the server render) until the post-mount
  // effect below can safely check localStorage -- reading localStorage
  // directly in this computation ran during hydration too (window already
  // exists there), so a returning visitor with an earlier stored reference
  // time got a different freshness status client-side than the server had
  // just rendered, flipping the banner's color/title on hydration.
  const [referenceTime, setReferenceTime] = useState(() => new Date(fetchedAt));

  useEffect(() => {
    const existing = window.localStorage.getItem(storageKey);
    if (!existing) {
      window.localStorage.setItem(storageKey, fetchedAt);
      return;
    }
    const parsed = new Date(existing);
    if (Number.isFinite(parsed.getTime())) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReferenceTime(parsed);
    }
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

  function baseEvent() {
    return {
      routeKey,
      label,
      status: freshness.status,
      ageMs: freshness.ageMs,
      staleAfterHours,
      forceAfterHours,
    } as const;
  }

  async function refreshNow(reason: "manual" | "forced") {
    setRefreshing(true);
    setRefreshError(null);
    emitFreshnessTelemetry({
      name: "freshness_refresh_attempt",
      reason,
      ...baseEvent(),
    });

    try {
      const nowIso = new Date().toISOString();
      window.localStorage.setItem(storageKey, nowIso);
      router.refresh();
      emitFreshnessTelemetry({
        name: "freshness_refresh_success",
        reason,
        ...baseEvent(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Refresh failed.";
      setRefreshError(message);
      emitFreshnessTelemetry({
        name: "freshness_refresh_failed",
        reason,
        error: message,
        ...baseEvent(),
      });
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
    emitFreshnessTelemetry({
      name: "freshness_forced_refresh_triggered",
      reason: "forced",
      ...baseEvent(),
    });
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

  if (variant === "subtle") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "10px 4px", marginBottom: 24, borderBottom: "1px solid oklch(0.92 0.003 90)", flexWrap: "wrap" }}>
        <Text size="sm" c={freshness.status === "fresh" ? "dimmed" : color}>
          {label} fetched <span suppressHydrationWarning>{formatAge(freshness.ageMs)}</span> ago.
          {refreshError ? ` ${refreshError}` : ""}
        </Text>
        <Button
          variant="outline"
          color={freshness.status === "fresh" ? "grape" : color === "red" ? "orange" : color}
          size="xs"
          loading={refreshing}
          onClick={() => void refreshNow("manual")}
        >
          Refresh now
        </Button>
      </div>
    );
  }

  return (
    <Alert color={color} title={title} variant="light" mb="md">
      <Group justify="space-between" align="center" wrap="wrap">
        <Text size="sm">
          Data fetched <span suppressHydrationWarning>{formatAge(freshness.ageMs)}</span> ago. {freshness.status === "expired" ? "A forced refresh was triggered." : "Would you like to refresh now?"}
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
