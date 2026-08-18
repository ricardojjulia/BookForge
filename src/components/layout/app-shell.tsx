"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Anchor, AppShell as MantineAppShell, Button, Group, Menu, Text, ThemeIcon, UnstyledButton } from "@mantine/core";
import { IconBook2, IconChevronDown, IconLogout, IconShieldCog } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { GlobalJobIndicator } from "@/components/layout/global-job-indicator";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [isSteward, setIsSteward] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function syncUser(userId: string | null, userEmail: string | null) {
      setEmail(userEmail);
      if (!userId) {
        setIsSteward(false);
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("platform_role").eq("id", userId).maybeSingle();
      setIsSteward(profile?.platform_role === "steward");
    }

    supabase.auth.getUser().then(({ data }) => syncUser(data.user?.id ?? null, data.user?.email ?? null));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncUser(session?.user?.id ?? null, session?.user?.email ?? null);
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
              My Book Room
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
                <GlobalJobIndicator />
                <Menu shadow="md" width={200} position="bottom-end">
                  <Menu.Target>
                    <UnstyledButton>
                      <Group gap={4}>
                        <Text size="sm" c="dimmed">
                          {email}
                        </Text>
                        <IconChevronDown size={14} color="var(--mantine-color-dimmed)" />
                      </Group>
                    </UnstyledButton>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {isSteward && (
                      <Menu.Item component={Link} href="/steward" leftSection={<IconShieldCog size={16} />}>
                        Steward console
                      </Menu.Item>
                    )}
                    <Menu.Item leftSection={<IconLogout size={16} />} onClick={() => void signOut()} disabled={signingOut}>
                      Sign out
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
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
