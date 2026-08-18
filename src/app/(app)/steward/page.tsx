import Link from "next/link";
import { Alert, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function StewardOverviewPage() {
  const admin = createAdminClient();
  const now = new Date();
  const upcomingHorizon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: readyForPurge }, { data: upcoming }] = await Promise.all([
    admin
      .from("account_deletion_requests")
      .select("id, user_id, email_at_request, display_name_at_request, requested_at, purge_after")
      .eq("status", "ready_for_purge")
      .order("requested_at", { ascending: true }),
    admin
      .from("account_deletion_requests")
      .select("id, user_id, email_at_request, purge_after")
      .eq("status", "pending")
      .lte("purge_after", upcomingHorizon)
      .order("purge_after", { ascending: true }),
  ]);

  return (
    <Container size="xl">
      <Title mb="lg">Steward console</Title>

      <Paper withBorder radius="md" p="lg" mb="md" style={{ borderColor: (readyForPurge?.length || 0) > 0 ? "var(--mantine-color-red-4)" : undefined }}>
        <Title order={4} mb="sm">Pending review — ready for purge</Title>
        <Text size="sm" c="dimmed" mb="md">
          These accounts passed their 30-day retention window. Nothing is deleted until you explicitly confirm it on the Accounts page.
        </Text>
        {!readyForPurge?.length ? (
          <Text size="sm" c="dimmed">Nothing waiting on a decision.</Text>
        ) : (
          <Stack gap="xs">
            {readyForPurge.map((request) => (
              <Group key={request.id} justify="space-between">
                <Text size="sm">{request.email_at_request || request.user_id} — requested {new Date(request.requested_at).toLocaleDateString()}</Text>
                <Link href="/steward/accounts">Review →</Link>
              </Group>
            ))}
          </Stack>
        )}
      </Paper>

      <Paper withBorder radius="md" p="lg">
        <Title order={4} mb="sm">Purging in the next 3 days</Title>
        {!upcoming?.length ? (
          <Text size="sm" c="dimmed">No accounts approaching their retention deadline.</Text>
        ) : (
          <Stack gap="xs">
            {upcoming.map((request) => (
              <Text key={request.id} size="sm">
                {request.email_at_request || request.user_id} — {new Date(request.purge_after).toLocaleDateString()}
              </Text>
            ))}
          </Stack>
        )}
      </Paper>

      {(readyForPurge?.length || 0) === 0 && (upcoming?.length || 0) === 0 && (
        <Alert color="teal" variant="light" mt="md">Nothing needs attention right now.</Alert>
      )}
    </Container>
  );
}
