"use client";

import Link from "next/link";
import { Anchor, AppShell as MantineAppShell, Button, Group, Text, ThemeIcon } from "@mantine/core";
import { IconBook2 } from "@tabler/icons-react";

export function AppShell({ children }: { children: React.ReactNode }) {
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
            <Anchor component={Link} href="/series">
              Series
            </Anchor>
            <Anchor component={Link} href="/settings">
              Settings
            </Anchor>
            <Button component={Link} href="/auth" variant="light" color="grape" size="xs">
              Auth
            </Button>
          </Group>
        </Group>
      </MantineAppShell.Header>
      <MantineAppShell.Main bg="#fbfaf8">{children}</MantineAppShell.Main>
    </MantineAppShell>
  );
}
