---
name: project-bookforge-overview
description: BookForge app overview — purpose, stack, key design principles, and major features
metadata:
  type: project
---

BookForge is a local-first AI manuscript editor. Authors import or create manuscripts, run AI-assisted analysis and revision workflows, and export polished drafts.

**Why:** Privacy-first (LM Studio runs on localhost by default), author control (original text never overwritten, append-only revision history), structured safety (locked passages, voice preservation, drift checks).

**Stack:** Next.js 16 App Router, Mantine 9, Supabase (auth + Postgres + storage), pluggable LLM backend (LM Studio default, OpenAI/Anthropic/Gemini optional).

**Key workflows:**
- Import → Summarize → Blueprint → Critic (7 lenses) → Rewrite (12 modes) → Drift check → Export
- Auto-Review Wizard orchestrates the full pipeline autonomously
- Guidance Workflow Panel: turns humanized guidance reports into tracked, actionable rewrite tasks

**Ports:** App runs on 4747 (changed from default 3000). Local Supabase DB on port 58322.

**How to apply:** Use this to understand scope and motivation behind any feature request.
