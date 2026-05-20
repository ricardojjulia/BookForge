import { Alert, Button, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { CreateSeriesButton } from "@/components/series/create-series-button";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SeriesListPage() {
  if (!hasSupabaseEnv()) {
    return <AppShell><Container><Alert color="yellow">Configure Supabase.</Alert></Container></AppShell>;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <AppShell><Container><Alert color="grape" title="Login required">Sign in to manage series.</Alert></Container></AppShell>;

  const { data: seriesList } = await supabase.from("series").select("id,title,description,created_at").eq("owner_id", user.id).order("created_at", { ascending: false });

  return (
    <AppShell>
      <Container size="lg">
        <Group justify="space-between" mb="xl">
          <div>
            <Title>Series Bible</Title>
            <Text c="dimmed">Manage multi-book series, shared world-building, and cross-book continuity.</Text>
          </div>
          <CreateSeriesButton />
        </Group>

        {!seriesList?.length && (
          <Paper withBorder radius="md" p="xl" bg="white">
            <Text c="dimmed">No series yet. Create one to link books and track cross-book continuity.</Text>
          </Paper>
        )}

        <Stack gap="md">
          {(seriesList || []).map((s) => (
            <Paper key={s.id} withBorder radius="md" p="lg" bg="white">
              <Group justify="space-between">
                <Stack gap={4}>
                  <Title order={3}>{s.title}</Title>
                  {s.description && <Text c="dimmed" size="sm">{s.description}</Text>}
                </Stack>
                <Link href={`/series/${s.id}`} style={{ textDecoration: "none" }}>
                  <Button color="grape" variant="light">Open Series Bible</Button>
                </Link>
              </Group>
            </Paper>
          ))}
        </Stack>
      </Container>
    </AppShell>
  );
}
