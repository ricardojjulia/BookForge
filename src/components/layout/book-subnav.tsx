"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Anchor, Badge, Box, Group, ScrollArea, Text } from "@mantine/core";

/**
 * Links only to routes that exist today. The hub page is still one big
 * "Overview" screen pending the Phase 4 route breakup (Studio, Critic &
 * Quality, Manuscript, Bible, Collaboration) -- this list gets trimmed and
 * re-pointed at those seam routes once they exist.
 */
function buildLinks(bookId: string) {
  return [
    { href: `/books/${bookId}`, label: "Overview", exact: true },
    { href: `/books/${bookId}/rewrite-plan`, label: "Rewrite Plan" },
    { href: `/books/${bookId}/revisions`, label: "Revisions" },
    { href: `/books/${bookId}/jobs`, label: "Jobs" },
    { href: `/books/${bookId}/world`, label: "World Bible" },
    { href: `/books/${bookId}/final-manuscript`, label: "Final Manuscript" },
    { href: `/books/${bookId}/publishing-lab`, label: "Publishing Lab" },
    { href: `/books/${bookId}/abridgement`, label: "Abridgement" },
    { href: `/books/${bookId}/read`, label: "Read" },
  ];
}

export function BookSubnav({ bookId, bookTitle }: { bookId: string; bookTitle: string }) {
  const pathname = usePathname();
  const links = buildLinks(bookId);

  return (
    <Box mb="lg" pb="xs" style={{ borderBottom: "1px solid var(--mantine-color-gray-3)" }}>
      <Group justify="space-between" align="center" mb={6} wrap="nowrap">
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
        <Group gap="xs" wrap="nowrap" pb={4}>
          {links.map((link) => {
            const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
            return (
              <Anchor
                key={link.href}
                component={Link}
                href={link.href}
                px="sm"
                py={4}
                fw={active ? 700 : 500}
                style={{
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                  background: active ? "var(--mantine-color-grape-1)" : "transparent",
                  color: active ? "var(--mantine-color-grape-8)" : "var(--mantine-color-dark-6)",
                }}
              >
                {link.label}
              </Anchor>
            );
          })}
        </Group>
      </ScrollArea>
    </Box>
  );
}
