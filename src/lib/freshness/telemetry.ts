import type { FreshnessStatus } from "@/lib/freshness/policy";

export type FreshnessRefreshReason = "manual" | "forced";

export type FreshnessTelemetryEventName =
  | "freshness_refresh_attempt"
  | "freshness_refresh_success"
  | "freshness_refresh_failed"
  | "freshness_forced_refresh_triggered";

export type FreshnessTelemetryEvent = {
  name: FreshnessTelemetryEventName;
  routeKey: string;
  label?: string;
  status: FreshnessStatus;
  reason?: FreshnessRefreshReason;
  ageMs?: number;
  staleAfterHours?: number;
  forceAfterHours?: number;
  error?: string;
  occurredAt?: string;
};

type FreshnessTelemetryReporter = (event: FreshnessTelemetryEvent) => void | Promise<void>;

async function defaultReporter(event: FreshnessTelemetryEvent) {
  if (typeof window === "undefined") return;

  try {
    await fetch("/api/telemetry/freshness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    });
  } catch {
    // Keep UI interactions resilient even when telemetry transport fails.
  }
}

let reporter: FreshnessTelemetryReporter = defaultReporter;

export function emitFreshnessTelemetry(event: FreshnessTelemetryEvent) {
  const enrichedEvent: FreshnessTelemetryEvent = {
    ...event,
    occurredAt: event.occurredAt ?? new Date().toISOString(),
  };

  try {
    void Promise.resolve(reporter(enrichedEvent));
  } catch {
    // No-op. Telemetry must never break UX workflows.
  }
}

export function __setFreshnessTelemetryReporterForTests(nextReporter: FreshnessTelemetryReporter) {
  reporter = nextReporter;
}

export function __resetFreshnessTelemetryReporterForTests() {
  reporter = defaultReporter;
}
