"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Anchor, Badge, Box, Group, ScrollArea, Text } from "@mantine/core";
import {
  IconArrowUpRight,
  IconCompass,
  IconEye,
  IconFileCheck,
  IconFileText,
  IconHistory,
  IconLayoutDashboard,
  IconListCheck,
  IconScissors,
  IconSettings,
  IconTargetArrow,
  IconUsers,
  IconWorld,
} from "@tabler/icons-react";

function buildLinks(bookId: string) {
  return [
    { href: `/books/${bookId}`, label: "Overview", exact: true, icon: IconLayoutDashboard },
    { href: `/books/${bookId}/studio`, label: "Studio", exact: false, icon: IconSettings },
    { href: `/books/${bookId}/critic-quality`, label: "Critic & Quality", exact: false, icon: IconTargetArrow },
    { href: `/books/${bookId}/manuscript`, label: "Manuscript", exact: false, icon: IconFileText },
    { href: `/books/${bookId}/world`, label: "World Bible", exact: false, icon: IconWorld },
    { href: `/books/${bookId}/collaboration`, label: "Collaboration", exact: false, icon: IconUsers },
    { href: `/books/${bookId}/guidance`, label: "Guidance", exact: false, icon: IconCompass },
    { href: `/books/${bookId}/jobs`, label: "Jobs", exact: false, icon: IconListCheck },
    { href: `/books/${bookId}/revisions`, label: "Revisions", exact: false, icon: IconHistory },
    { href: `/books/${bookId}/final-manuscript`, label: "Final Manuscript", exact: false, icon: IconFileCheck },
    { href: `/books/${bookId}/publishing-lab`, label: "Publishing Lab", exact: false, icon: IconArrowUpRight },
    { href: `/books/${bookId}/abridgement`, label: "Abridgement", exact: false, icon: IconScissors },
    { href: `/books/${bookId}/read`, label: "Read", exact: false, icon: IconEye },
  ];
}

export function BookSubnav({ bookId, bookTitle }: { bookId: string; bookTitle: string }) {
  const pathname = usePathname();
  const links = buildLinks(bookId);

  return (
    <Box mb="lg" pb="xs" style={{ borderBottom: "1px solid var(--mantine-color-gray-3)" }}>
      <Group justify="space-between" align="center" mb={10} wrap="nowrap">
        <Anchor component={Link} href="/dashboard" size="sm" c="dimmed">
          ← Dashboard
        </Anchor>
        <Text size="sm" fw={700} lineClamp={1} style={{ flex: 1, textAlign: "center" }}>
          {bookTitle}
        </Text>
        <Badge visibleFrom="sm" color="grape" variant="light">
          Book
        </Badge>
      </Group>
      <ScrollArea type="auto" scrollbarSize={6}>
        <Group gap={28} wrap="nowrap" pb={4}>
          {links.map((link) => {
            const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Anchor
                key={link.href}
                component={Link}
                href={link.href}
                underline="never"
                px={active ? 18 : 2}
                py={active ? 10 : 4}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                  background: active ? "oklch(0.5 0.16 275)" : "transparent",
                  color: active ? "#fff" : "oklch(0.35 0.005 90)",
                  fontWeight: active ? 700 : 500,
                  fontSize: 14,
                }}
              >
                <Icon size={16} stroke={1.75} />
                {link.label}
              </Anchor>
            );
          })}
        </Group>
      </ScrollArea>
    </Box>
  );
}
