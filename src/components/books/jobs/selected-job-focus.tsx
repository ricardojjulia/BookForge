"use client";

import { useEffect } from "react";

export function SelectedJobFocus({ jobId }: { jobId: string }) {
  useEffect(() => {
    if (!jobId) return;

    const timer = window.setTimeout(() => {
      const row = document.querySelector<HTMLElement>(`[data-job-id="${jobId}"]`);
      if (!row) return;
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.focus({ preventScroll: true });
    }, 50);

    return () => window.clearTimeout(timer);
  }, [jobId]);

  return null;
}
