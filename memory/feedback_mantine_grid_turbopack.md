---
name: feedback-mantine-grid-turbopack
description: Mantine Grid.Col breaks under Next.js Turbopack — use Group or SimpleGrid instead
metadata:
  type: feedback
---

Avoid `Grid.Col` from Mantine in this project. Turbopack drops the `Grid.Col = GridCol` static property assignment at runtime, causing "Element type is invalid: got undefined" errors.

**Why:** Next.js 16 with Turbopack tree-shakes the static property attachment, so `Grid.Col` is undefined at runtime even though TypeScript accepts it.

**How to apply:** Use `Group justify="space-between"` for two-column header rows, `SimpleGrid` for uniform grid layouts. Both are used consistently elsewhere in the codebase.
