"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, Button, Container, Loader, Paper, Stack, Text, Title } from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import { AppShell } from "@/components/layout/app-shell";

type State =
  | { status: "loading" }
  | { status: "success"; bookId: string; role: string }
  | { status: "error"; message: string };

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    async function accept() {
      try {
        const res = await fetch(`/api/invite/${token}`, { method: "POST" });
        const data = await res.json();
        if (data.error) {
          setState({ status: "error", message: data.error });
        } else {
          setState({ status: "success", bookId: data.bookId, role: data.role });
        }
      } catch {
        setState({ status: "error", message: "Something went wrong. Please try again." });
      }
    }
    accept();
  }, [token]);

  return (
    <AppShell>
      <Container size="xs" pt="xl">
        <Paper withBorder radius="md" p="xl">
          {state.status === "loading" && (
            <Stack align="center" gap="md">
              <Loader size="lg" color="grape" />
              <Text c="dimmed">Accepting invite…</Text>
            </Stack>
          )}

          {state.status === "success" && (
            <Stack align="center" gap="md">
              <IconCheck size={48} color="green" />
              <Title order={3}>You&apos;re in!</Title>
              <Text ta="center" c="dimmed">
                You have joined the book as a <strong>{state.role}</strong>.
              </Text>
              <Button color="grape" onClick={() => router.push(`/books/${state.bookId}`)}>
                Open the book
              </Button>
            </Stack>
          )}

          {state.status === "error" && (
            <Stack align="center" gap="md">
              <IconX size={48} color="red" />
              <Title order={3}>Invite failed</Title>
              <Alert color="red" w="100%">{state.message}</Alert>
              <Button variant="subtle" onClick={() => router.push("/dashboard")}>
                Go to Dashboard
              </Button>
            </Stack>
          )}
        </Paper>
      </Container>
    </AppShell>
  );
}
