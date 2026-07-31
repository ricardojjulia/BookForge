"use client";

import { useState } from "react";
import { Alert, Badge, Button, Group, Paper, Select, Stack, Text, Title } from "@mantine/core";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/http/fetch-json";

type RewriteApprovalPanelProps = {
  bookId: string;
  reviewerId: string | null;
  reviewStatus: "unassigned" | "assigned" | "in_review" | "approved" | "changes_requested";
  reviewerOptions: Array<{ value: string; label: string }>;
  currentUserId: string | null;
};

export function RewriteApprovalPanel({
  bookId,
  reviewerId,
  reviewStatus,
  reviewerOptions,
  currentUserId,
}: RewriteApprovalPanelProps) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function runAction(action: "assign" | "start" | "approve" | "request_changes" | "unassign", nextReviewerId?: string) {
    setLoadingAction(action);
    setMessage("");
    setError("");
    try {
      await fetchJson(
        `/api/books/${bookId}/rewrite-workflow/review`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, reviewerId: nextReviewerId }),
        },
        "Update rewrite approval workflow",
      );
      setMessage(
        action === "assign"
          ? "Rewrite approval reviewer assigned."
          : action === "start"
            ? "Rewrite approval marked in review."
            : action === "approve"
              ? "Rewrite approval marked approved."
              : action === "request_changes"
                ? "Rewrite approval marked changes requested."
                : "Rewrite approval assignment cleared.",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update rewrite approval workflow.");
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <Paper withBorder radius="md" p="xl" bg="white" mb="xl">
      <Stack>
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>Rewrite Approval Workflow</Title>
            <Text c="dimmed" size="sm">
              Assign a reviewer for rewrite strategy ownership and track approval status transitions.
            </Text>
          </div>
          <Badge color={statusColor(reviewStatus)} variant="light">
            {statusLabel(reviewStatus)}
          </Badge>
        </Group>

        {message && <Alert color="green">{message}</Alert>}
        {error && <Alert color="red">{error}</Alert>}

        <Group align="flex-end">
          <Select
            label="Assigned reviewer"
            placeholder="Select reviewer"
            data={reviewerOptions}
            value={reviewerId}
            onChange={(value) => {
              if (value) void runAction("assign", value);
            }}
            w={320}
          />
          {reviewerId && (
            <Button variant="light" color="dark" loading={loadingAction === "unassign"} onClick={() => runAction("unassign")}>
              Unassign
            </Button>
          )}
        </Group>

        <Group>
          {(reviewStatus === "assigned" || reviewStatus === "changes_requested") &&
            (!reviewerId || reviewerId === currentUserId) && (
              <Button variant="light" color="blue" loading={loadingAction === "start"} onClick={() => runAction("start")}>
                Start review
              </Button>
            )}
          {reviewStatus === "in_review" && (
            <>
              <Button variant="light" color="green" loading={loadingAction === "approve"} onClick={() => runAction("approve")}>
                Approve strategy
              </Button>
              <Button
                variant="outline"
                color="orange"
                loading={loadingAction === "request_changes"}
                onClick={() => runAction("request_changes")}
              >
                Request changes
              </Button>
            </>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}

function statusLabel(status: RewriteApprovalPanelProps["reviewStatus"]) {
  if (status === "in_review") return "In review";
  if (status === "changes_requested") return "Changes requested";
  if (status === "approved") return "Approved";
  if (status === "assigned") return "Assigned";
  return "Unassigned";
}

function statusColor(status: RewriteApprovalPanelProps["reviewStatus"]) {
  if (status === "in_review") return "blue";
  if (status === "changes_requested") return "orange";
  if (status === "approved") return "teal";
  if (status === "assigned") return "grape";
  return "gray";
}
