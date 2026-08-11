"use client";

import { useEffect, useState } from "react";
import { Alert, Progress, Text } from "@mantine/core";

/**
 * Live elapsed-time + estimated-progress feedback for a single blocking AI
 * call, meant to render immediately next to the button that triggered it
 * (not scrolled away in a separate panel) so a long wait never reads as
 * "stuck."
 */
export function GenerationProgressAlert({
  active,
  message,
  detail,
  estimatedSeconds = 25,
  color = "blue",
}: {
  active: boolean;
  message: string;
  detail?: string;
  estimatedSeconds?: number;
  color?: string;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!active) return;
    const resetId = window.setTimeout(() => setElapsedSeconds(0), 0);
    const intervalId = window.setInterval(() => setElapsedSeconds((current) => current + 1), 1000);
    return () => {
      window.clearTimeout(resetId);
      window.clearInterval(intervalId);
    };
  }, [active]);

  if (!active) return null;

  const progressPercent = Math.min(94, Math.round((1 - Math.exp(-elapsedSeconds / estimatedSeconds)) * 100));

  return (
    <Alert color={color} variant="light">
      <Text size="sm">{message}</Text>
      <Progress value={progressPercent} animated color={color} mt="xs" />
      <Text size="xs" c="dimmed" mt={4}>
        {elapsedSeconds}s elapsed{detail ? ` -- ${detail}` : ""} -- still working; no need to reload.
      </Text>
    </Alert>
  );
}
