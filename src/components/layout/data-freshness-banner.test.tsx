import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { DataFreshnessBanner } from "@/components/layout/data-freshness-banner";
import {
  __resetFreshnessTelemetryReporterForTests,
  __setFreshnessTelemetryReporterForTests,
  type FreshnessTelemetryEvent,
} from "@/lib/freshness/telemetry";

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

function renderBanner(node: ReactNode) {
  return render(<MantineProvider>{node}</MantineProvider>);
}

describe("DataFreshnessBanner", () => {
  let events: FreshnessTelemetryEvent[];

  beforeEach(() => {
    events = [];
    refreshMock.mockReset();
    window.localStorage.clear();
    __setFreshnessTelemetryReporterForTests((event) => {
      events.push(event);
    });
  });

  afterEach(() => {
    cleanup();
    __resetFreshnessTelemetryReporterForTests();
  });

  it("renders stale state and logs manual refresh lifecycle", async () => {
    const user = userEvent.setup();
    const fetchedAt = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();

    renderBanner(
      <DataFreshnessBanner
        routeKey="tests:stale"
        fetchedAt={fetchedAt}
        staleAfterHours={24}
        forceAfterHours={48}
      />,
    );

    expect(screen.getByText("Data is stale")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh now" }));

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    expect(events.map((event) => event.name)).toEqual([
      "freshness_refresh_attempt",
      "freshness_refresh_success",
    ]);
    expect(events[0]?.reason).toBe("manual");
  });

  it("renders fresh on the first paint and only applies an older stored reference time in an effect", async () => {
    const routeKey = "tests:anchored";
    const storageKey = `bookforge:freshness:${routeKey}`;
    const staleFetchedAt = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
    const freshFetchedAt = new Date().toISOString();
    window.localStorage.setItem(storageKey, staleFetchedAt);

    renderBanner(
      <DataFreshnessBanner
        routeKey={routeKey}
        fetchedAt={freshFetchedAt}
        staleAfterHours={24}
        forceAfterHours={48}
      />,
    );

    // Must resolve to the anchored (stale) reference time, not the fresh
    // fetchedAt prop -- and must not throw a hydration mismatch getting there.
    expect(await screen.findByText("Data is stale")).toBeInTheDocument();
    expect(window.localStorage.getItem(storageKey)).toBe(staleFetchedAt);
  });

  it("triggers forced refresh once and logs forced failure fallback", async () => {
    const routeKey = "tests:expired";
    const storageKey = `bookforge:freshness:${routeKey}`;
    const fetchedAt = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    window.localStorage.setItem(storageKey, fetchedAt);

    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("storage blocked");
      });

    renderBanner(
      <DataFreshnessBanner
        routeKey={routeKey}
        fetchedAt={fetchedAt}
        staleAfterHours={24}
        forceAfterHours={48}
      />,
    );

    expect(await screen.findByText(/Forced refresh failed: storage blocked/)).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();

    expect(events.map((event) => event.name)).toEqual([
      "freshness_forced_refresh_triggered",
      "freshness_refresh_attempt",
      "freshness_refresh_failed",
    ]);
    expect(events.filter((event) => event.name === "freshness_refresh_attempt")).toHaveLength(1);
    expect(events[2]?.error).toBe("storage blocked");

    setItemSpy.mockRestore();
  });
});
