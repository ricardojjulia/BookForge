"use client";

import { MantineProvider as BaseMantineProvider, createTheme } from "@mantine/core";

const theme = createTheme({
  primaryColor: "grape",
  defaultRadius: "md",
  fontFamily: "var(--font-inter), system-ui, sans-serif",
  headings: {
    fontFamily: "var(--font-inter), system-ui, sans-serif",
    fontWeight: "700",
  },
  colors: {
    grape: [
      "oklch(0.97 0.02 275)",
      "oklch(0.92 0.045 275)",
      "oklch(0.85 0.08 275)",
      "oklch(0.75 0.11 275)",
      "oklch(0.65 0.135 275)",
      "oklch(0.57 0.15 275)",
      "oklch(0.5 0.16 275)",
      "oklch(0.44 0.155 275)",
      "oklch(0.4 0.16 275)",
      "oklch(0.33 0.14 275)",
    ],
  },
});

export function MantineProvider({ children }: { children: React.ReactNode }) {
  return <BaseMantineProvider theme={theme}>{children}</BaseMantineProvider>;
}
