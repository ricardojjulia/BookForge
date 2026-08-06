import useSWR from "swr";
import { fetchJson } from "@/lib/http/fetch-json";

export type AutoReviewJobLogEntry = {
  message?: string;
  stage?: string;
  iteration?: number;
  type?: string;
};

export type AutoReviewJob = {
  id: string;
  book_id: string;
  mode: "full_review" | "make_shorter" | "make_longer";
  status: "running" | "completed" | "failed" | "cancelled";
  current_stage: string | null;
  stages_completed: string[] | null;
  iteration: number | null;
  config: Record<string, unknown> | null;
  log: AutoReviewJobLogEntry[] | null;
  error: string | null;
  export_id: string | null;
  created_at: string;
  completed_at: string | null;
};

export type AutoReviewStatusResponse = {
  job: AutoReviewJob | null;
  acceptedParagraphCount: number;
  transient?: boolean;
};

const EMPTY_RESPONSE: AutoReviewStatusResponse = { job: null, acceptedParagraphCount: 0 };

/**
 * Single shared cache entry for GET /api/books/[bookId]/auto-review so every
 * consumer (the "last run" banner in book-actions.tsx, the live wizard
 * progress in auto-review-runner.tsx) sees the same job data and the same
 * staleness derivation, instead of each polling into its own local state
 * and risking a staleness fix applied to one but not the other.
 */
export function useAutoReviewStatus(
  bookId: string,
  options: { refreshInterval?: number | ((data: AutoReviewStatusResponse | undefined) => number) } = {},
) {
  const { refreshInterval = 30000 } = options;

  const { data, error, isLoading, mutate } = useSWR<AutoReviewStatusResponse>(
    bookId ? `/api/books/${bookId}/auto-review` : null,
    (path: string) => fetchJson<AutoReviewStatusResponse>(path, { cache: "no-store" }, "Auto-review latest job status"),
    { refreshInterval, revalidateOnFocus: false },
  );

  const job = data?.job ?? null;
  const acceptedParagraphCount = data?.acceptedParagraphCount ?? 0;
  const autoReviewOutputStale = job?.status === "completed" && acceptedParagraphCount === 0;

  return {
    job,
    acceptedParagraphCount,
    autoReviewOutputStale,
    isLoading,
    error,
    refresh: mutate,
    raw: data ?? EMPTY_RESPONSE,
  };
}
