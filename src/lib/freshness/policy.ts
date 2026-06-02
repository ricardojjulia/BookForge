export type FreshnessStatus = "fresh" | "stale" | "expired";

export type FreshnessPolicy = {
  staleAfterHours: number;
  forceAfterHours: number;
};

export type FreshnessSnapshot = {
  status: FreshnessStatus;
  ageMs: number;
  ageHours: number;
};

export const DEFAULT_FRESHNESS_POLICY: FreshnessPolicy = {
  staleAfterHours: 24,
  forceAfterHours: 48,
};

export function evaluateFreshness(input: {
  asOf: Date;
  fetchedAt: Date;
  policy?: Partial<FreshnessPolicy>;
}): FreshnessSnapshot {
  const policy = {
    staleAfterHours: input.policy?.staleAfterHours ?? DEFAULT_FRESHNESS_POLICY.staleAfterHours,
    forceAfterHours: input.policy?.forceAfterHours ?? DEFAULT_FRESHNESS_POLICY.forceAfterHours,
  };

  const ageMs = Math.max(0, input.asOf.getTime() - input.fetchedAt.getTime());
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours >= policy.forceAfterHours) {
    return { status: "expired", ageMs, ageHours };
  }
  if (ageHours >= policy.staleAfterHours) {
    return { status: "stale", ageMs, ageHours };
  }
  return { status: "fresh", ageMs, ageHours };
}

export function formatAge(ageMs: number) {
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
