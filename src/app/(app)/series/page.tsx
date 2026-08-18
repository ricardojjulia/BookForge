import { Alert, Button, Container, Group, Paper, Text, Title } from "@mantine/core";
import Link from "next/link";
import { CreateSeriesButton } from "@/components/series/create-series-button";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SeriesListPage() {
  if (!hasSupabaseEnv()) {
    return <Container><Alert color="yellow">Configure Supabase.</Alert></Container>;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <Container><Alert color="grape" title="Login required">Sign in to manage series.</Alert></Container>;

  const { data: seriesList } = await supabase.from("series").select("id,title,description,created_at").eq("owner_id", user.id).order("created_at", { ascending: false });

  return (
    <Container size="xl">
      <Group justify="space-between" align="flex-start" mb={8} wrap="wrap">
        <div>
          <Title style={{ fontSize: 28, letterSpacing: "-0.01em" }}>Series Bible</Title>
          <Text mt={6} style={{ fontSize: 14, color: "oklch(0.5 0.005 90)" }}>
            Manage multi-book series, shared world-building, and cross-book continuity.
          </Text>
        </div>
        <CreateSeriesButton />
      </Group>

      <div style={{ marginTop: 24 }}>
        {(seriesList || []).map((s) => (
          <div
            key={s.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "16px 4px",
              borderBottom: "1px solid oklch(0.93 0.003 90)",
            }}
          >
            <span
              style={{
                width: 6,
                alignSelf: "stretch",
                borderRadius: 3,
                background: "oklch(0.5 0.16 275)",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "oklch(0.2 0.005 90)" }}>{s.title}</span>
              {s.description && (
                <div style={{ fontSize: 13, color: "oklch(0.6 0.005 90)", marginTop: 3 }}>{s.description}</div>
              )}
            </div>
            <Button component={Link} href={`/series/${s.id}`} color="grape" style={{ width: 150, flexShrink: 0 }}>
              Open Series Bible
            </Button>
          </div>
        ))}
      </div>

      {!seriesList?.length && (
        <Paper withBorder radius="md" p="xl" bg="white">
          <Text c="dimmed">No series yet. Create one to link books and track cross-book continuity.</Text>
        </Paper>
      )}
    </Container>
  );
}
