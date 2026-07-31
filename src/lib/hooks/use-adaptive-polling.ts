"use client";

import { useEffect, useRef } from "react";

type PollFunction = () => boolean | Promise<boolean>;

type UseAdaptivePollingOptions = {
  activeIntervalMs: number;
  idleIntervalMs: number;
  pauseWhenHidden?: boolean;
  coordinatorKey?: string;
  coordinatorTtlMs?: number;
};

type PollCoordinatorLease = {
  ownerId: string;
  expiresAt: number;
};

const DEFAULT_COORDINATOR_TTL_MS = 12000;

function getCoordinatorStorageKey(coordinatorKey: string) {
  return `bookforge:poll-coordinator:${coordinatorKey}`;
}

function tryAcquireLease(coordinatorKey: string, ownerId: string, ttlMs: number) {
  if (typeof window === "undefined") return true;
  const now = Date.now();
  const storageKey = getCoordinatorStorageKey(coordinatorKey);

  let lease: PollCoordinatorLease | null = null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) lease = JSON.parse(raw) as PollCoordinatorLease;
  } catch {
    return true;
  }

  const isOwner = lease?.ownerId === ownerId;
  const isExpired = !lease || lease.expiresAt <= now;
  if (!isOwner && !isExpired) return false;

  const nextLease: PollCoordinatorLease = {
    ownerId,
    expiresAt: now + ttlMs,
  };

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(nextLease));
    const confirmRaw = window.localStorage.getItem(storageKey);
    if (!confirmRaw) return false;
    const confirm = JSON.parse(confirmRaw) as PollCoordinatorLease;
    return confirm.ownerId === ownerId;
  } catch {
    return true;
  }
}

function releaseLease(coordinatorKey: string, ownerId: string) {
  if (typeof window === "undefined") return;
  const storageKey = getCoordinatorStorageKey(coordinatorKey);
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return;
    const lease = JSON.parse(raw) as PollCoordinatorLease;
    if (lease.ownerId === ownerId) {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // best effort cleanup only
  }
}

export function useAdaptivePolling(
  poll: PollFunction,
  {
    activeIntervalMs,
    idleIntervalMs,
    pauseWhenHidden = true,
    coordinatorKey,
    coordinatorTtlMs = DEFAULT_COORDINATOR_TTL_MS,
  }: UseAdaptivePollingOptions,
) {
  const pollRef = useRef(poll);
  const ownerIdRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    let active = true;
    let timeoutId: number | null = null;
    const ownerId = ownerIdRef.current;

    const schedule = (delay: number) => {
      if (!active) return;
      timeoutId = window.setTimeout(() => {
        void tick();
      }, delay);
    };

    const tick = async () => {
      if (!active) return;
      if (pauseWhenHidden && typeof document !== "undefined" && document.visibilityState === "hidden") {
        schedule(idleIntervalMs);
        return;
      }

      if (coordinatorKey) {
        const isCoordinator = tryAcquireLease(coordinatorKey, ownerId, coordinatorTtlMs);
        if (!isCoordinator) {
          schedule(idleIntervalMs);
          return;
        }
      }

      const hasActiveWork = await pollRef.current();
      schedule(hasActiveWork ? activeIntervalMs : idleIntervalMs);
    };

    void tick();

    return () => {
      active = false;
      if (coordinatorKey) {
        releaseLease(coordinatorKey, ownerId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeIntervalMs, coordinatorKey, coordinatorTtlMs, idleIntervalMs, pauseWhenHidden]);
}