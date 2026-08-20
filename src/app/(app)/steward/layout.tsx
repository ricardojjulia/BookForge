import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Container, Group, Stack } from "@mantine/core";
import { createClient } from "@/lib/supabase/server";

export default async function StewardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase.from("profiles").select("platform_role").eq("id", user.id).maybeSingle();
  if (profile?.platform_role !== "steward") redirect("/dashboard");

  return (
    <Stack gap="md">
      <Container size="xl" pt="md" pb={0}>
        <Group justify="space-between" align="center">
          <Group gap="lg">
            <Link href="/steward" style={{ textDecoration: "none", fontWeight: 700 }}>Overview</Link>
            <Link href="/steward/accounts" style={{ textDecoration: "none", fontWeight: 700 }}>Accounts</Link>
            <Link href="/steward/books" style={{ textDecoration: "none", fontWeight: 700 }}>Books</Link>
            <Link href="/steward/pricing" style={{ textDecoration: "none", fontWeight: 700 }}>Pricing</Link>
          </Group>
          <Badge color="grape" variant="light">Steward</Badge>
        </Group>
      </Container>
      {children}
    </Stack>
  );
}
