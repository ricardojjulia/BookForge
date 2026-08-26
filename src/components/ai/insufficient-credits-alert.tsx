"use client";

import Link from "next/link";
import { Alert, Button, Group, Text } from "@mantine/core";

export function InsufficientCreditsAlert({ message }: { message: string }) {
  return (
    <Alert color="red" title="Out of credits">
      <Text size="sm">{message}</Text>
      <Group mt="xs">
        <Link href="/account" style={{ textDecoration: "none" }}>
          <Button size="xs" color="red" variant="filled">
            Upgrade your plan
          </Button>
        </Link>
      </Group>
    </Alert>
  );
}
