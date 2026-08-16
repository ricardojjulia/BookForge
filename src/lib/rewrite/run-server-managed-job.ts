import { fetchJson } from "@/lib/http/fetch-json";

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour safety cap

export type ManagedJobRow = {
  id: string;
  status: string | null;
  error_message: string | null;
  progress: {
    currentUnit?: string | null;
    totalUnits?: number;
    attempted?: number;
    successful?: number;
    failed?: number;
    skipped?: number;
  } | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Shared queue-then-poll driver for any "serverManaged" job endpoint in this
// app (rewrite-plan, rewrite-execute, critic, revisions/accept-all, ...):
// queue the job, fire the worker call without awaiting it (it can run for
// many minutes), then poll /jobs by id until it leaves running/queued/paused.
// See FocusedRewritePanel's runServerManagedStep for the pattern this was
// extracted from.
export async function runServerManagedJob(
  bookId: string,
  path: string,
  body: Record<string, unknown>,
  label: string,
  onProgress?: (job: ManagedJobRow) => void,
): Promise<ManagedJobRow> {
  const queued = await fetchJson<{ content?: { jobId?: string } }>(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, serverManaged: true }),
    },
    `${label} (queue)`,
  );
  const jobId = queued.content?.jobId;
  if (!jobId) throw new Error(`${label} did not return a job id.`);

  void fetchJson(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, jobId }),
    },
    `${label} (worker)`,
  ).catch(() => {
    // Errors surface through the polled job row's status/error_message below.
  });

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const result = await fetchJson<{ content?: { jobs: ManagedJobRow[] } }>(
      `/api/books/${bookId}/jobs`,
      { cache: "no-store" },
      `${label} (status)`,
    );
    const job = result.content?.jobs.find((row) => row.id === jobId);
    if (!job) continue;
    onProgress?.(job);
    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(job.error_message || `${label} failed.`);
    if (job.status === "cancelled") throw new Error(`${label} was cancelled.`);
  }
  throw new Error(`${label} timed out waiting for completion.`);
}
