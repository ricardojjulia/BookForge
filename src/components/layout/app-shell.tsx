"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Anchor, AppShell as MantineAppShell, Button, Group, Text, ThemeIcon } from "@mantine/core";
import { IconBook2 } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  async function signOut() {
    setSigningOut(true);
    try {
      await createClient().auth.signOut();
      router.push("/auth");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <MantineAppShell header={{ height: 64 }} padding="md">
      <MantineAppShell.Header px="lg">
        <Group h="100%" justify="space-between">
          <Group>
            <ThemeIcon color="grape" radius="sm">
              <IconBook2 size={18} />
            </ThemeIcon>
            <Text fw={800}>BookForge AI</Text>
          </Group>
          <Group gap="lg">
            <Anchor component={Link} href="/dashboard">
              Dashboard
            </Anchor>
            <Anchor component={Link} href="/books/new">
              Import
            </Anchor>
            <Anchor component={Link} href="/creativewriter">
              CreativeWriter
            </Anchor>
            <Anchor component={Link} href="/series">
              Series
            </Anchor>
            <Anchor component={Link} href="/analytics">
              Analytics
            </Anchor>
            <Anchor component={Link} href="/settings">
              Settings
            </Anchor>
            <Anchor component={Link} href="/account">
              Account
            </Anchor>
            {email ? (
              <Group gap="xs">
                <Text size="sm" c="dimmed">
                  {email}
                </Text>
                <Button variant="light" color="dark" size="xs" loading={signingOut} onClick={() => void signOut()}>
                  Sign out
                </Button>
              </Group>
            ) : (
              <Button component={Link} href="/auth" variant="light" color="grape" size="xs">
                Sign In
              </Button>
            )}
          </Group>
        </Group>
      </MantineAppShell.Header>
      <MantineAppShell.Main bg="#fbfaf8">{children}</MantineAppShell.Main>
    </MantineAppShell>
  );
}
