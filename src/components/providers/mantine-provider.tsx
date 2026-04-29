"use client";

import { MantineProvider as BaseMantineProvider, createTheme } from "@mantine/core";

const theme = createTheme({
  primaryColor: "grape",
  defaultRadius: "md",
  fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
  headings: {
    fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
    fontWeight: "700",
  },
});

export function MantineProvider({ children }: { children: React.ReactNode }) {
  return <BaseMantineProvider theme={theme}>{children}</BaseMantineProvider>;
}
