import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { pullCreativeWriterSync, pushCreativeWriterSync, resolveCreativeWriterConflict } from "../src/lib/creativewriter-sync/cloud-sync";
import type { CreativeWriterLinkedProject, CreativeWriterLocalChange } from "../src/lib/creativewriter-sync";

const ids = {
  user: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  project: "4d000000-0000-4000-8000-000000000001",
  book: "4d000000-0000-4000-8000-000000000002",
  chapter: "4d000000-0000-4000-8000-000000000003",
  paragraph: "4d000000-0000-4000-8000-000000000004",
};

const localProjectId = "phase-4d-local-project";
const baseTime = "2026-08-02T14:00:00.000Z";
const cloudTime = "2026-08-02T16:00:00.000Z";

loadEnvFile(".env.local");

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const dbUrl = resolveLocalDbUrl(url);
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  runSql(dbUrl, seedSql());

  const pull = await pullCreativeWriterSync({
    supabase,
    userId: ids.user,
    bookId: ids.book,
    localProjectId,
  });
  assert(pull.project.bookforgeBookId === ids.book, "pull did not link the expected book");
  assert(pull.changes.length === 3, `expected 3 pull changes, received ${pull.changes.length}`);
  assert(pull.changes.some((change) => change.entityType === "paragraph" && change.entityId === ids.paragraph), "pull did not include the seeded paragraph");

  const appliedChange = paragraphChange(pull.project, {
    id: "phase-4d-applied-change",
    idempotencyKey: "phase-4d-applied-idempotency",
    baseVersion: versionFromDate(baseTime),
    localVersion: versionFromDate(baseTime) + 1,
    currentText: "Phase 4D applied paragraph update.",
  });
  const applied = await pushCreativeWriterSync({ supabase, request: { project: pull.project, changes: [appliedChange] } });
  assert(applied.appliedChanges.includes(appliedChange.id), "push did not report the applied paragraph change");
  assert(applied.conflicts.length === 0, "current-base push unexpectedly produced a conflict");

  const idempotent = await pushCreativeWriterSync({ supabase, request: { project: applied.project, changes: [appliedChange] } });
  assert(idempotent.appliedChanges.includes(appliedChange.id), "idempotent replay did not return applied status");

  runSql(
    dbUrl,
    `
      update public.paragraphs
      set current_text = 'Phase 4D cloud-side edit before stale push.',
          updated_at = '${cloudTime}'
      where id = '${ids.paragraph}';
    `,
  );

  const staleChange = paragraphChange(applied.project, {
    id: "phase-4d-conflict-change",
    idempotencyKey: "phase-4d-conflict-idempotency",
    baseVersion: versionFromDate(baseTime),
    localVersion: versionFromDate(baseTime) + 2,
    currentText: "Phase 4D stale local paragraph update.",
  });
  const conflict = await pushCreativeWriterSync({ supabase, request: { project: applied.project, changes: [staleChange] } });
  assert(conflict.conflicts.length === 1, `expected 1 conflict, received ${conflict.conflicts.length}`);
  assert(conflict.conflicts[0].id === `conflict-${staleChange.id}`, "conflict id did not match the stale local change");

  const resolved = await resolveCreativeWriterConflict({
    supabase,
    userId: ids.user,
    request: {
      project: conflict.project,
      conflictId: conflict.conflicts[0].id,
      resolution: "resolved_manual",
      resolvedPayload: { currentText: "Phase 4D manually resolved paragraph." },
      note: "Phase 4D verification resolved the stale local edit.",
    },
  });
  assert(resolved.resolutionStatus === "resolved_manual", "conflict resolution did not persist resolved_manual");

  const verification = runSql(
    dbUrl,
    `
      select
        (select count(*) from public.creativewriter_sync_projects where book_id = '${ids.book}' and account_id = '${ids.user}') as sync_projects,
        (select count(*) from public.creativewriter_sync_events where book_id = '${ids.book}' and status = 'applied') as applied_events,
        (select count(*) from public.creativewriter_sync_events where book_id = '${ids.book}' and status = 'conflict' and resolution_status = 'resolved_manual') as resolved_conflicts,
        (select current_text from public.paragraphs where id = '${ids.paragraph}') as paragraph_text;
    `,
  );

  if (!verification.includes("Phase 4D manually resolved paragraph.")) {
    throw new Error("final paragraph text was not the manually resolved text");
  }

  console.log("CreativeWriter Phase 4D verification passed.");
  console.log(`Book: ${ids.book}`);
  console.log(`Local project: ${localProjectId}`);
  console.log("Verified pull, applied push, idempotent replay, stale conflict creation, manual resolution, and ledger persistence.");
}

function paragraphChange(
  project: CreativeWriterLinkedProject,
  input: {
    id: string;
    idempotencyKey: string;
    baseVersion: number;
    localVersion: number;
    currentText: string;
  },
): CreativeWriterLocalChange {
  return {
    id: input.id,
    projectId: project.localProjectId,
    entityType: "paragraph",
    entityId: ids.paragraph,
    operation: "update",
    payload: { currentText: input.currentText },
    baseVersion: input.baseVersion,
    localVersion: input.localVersion,
    idempotencyKey: input.idempotencyKey,
    createdAt: new Date().toISOString(),
  };
}

function seedSql() {
  return `
    delete from public.projects where id = '${ids.project}';

    insert into public.projects (id, owner_id, name, description, created_at, updated_at)
    values ('${ids.project}', '${ids.user}', 'CreativeWriter Phase 4D Verification', 'Deterministic local verification fixture.', '${baseTime}', '${baseTime}');

    insert into public.books (id, project_id, owner_id, title, author_name, status, created_at, updated_at)
    values ('${ids.book}', '${ids.project}', '${ids.user}', 'Phase 4D Verification Manuscript', 'Factory Harness', 'draft', '${baseTime}', '${baseTime}');

    insert into public.chapters (id, book_id, chapter_number, title, original_text, current_text, status, created_at, updated_at)
    values ('${ids.chapter}', '${ids.book}', 1, 'Verification Chapter', 'Original chapter text.', 'Current chapter text.', 'pending', '${baseTime}', '${baseTime}');

    insert into public.paragraphs (id, book_id, chapter_id, paragraph_number, original_text, current_text, accepted_text, created_at, updated_at)
    values ('${ids.paragraph}', '${ids.book}', '${ids.chapter}', 1, 'Original paragraph text.', 'Current paragraph text.', null, '${baseTime}', '${baseTime}');
  `;
}

function runSql(dbUrl: string, sql: string) {
  return execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-q", "-c", sql], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function versionFromDate(value: string) {
  return Math.floor(new Date(value).getTime() / 1000);
}

function resolveLocalDbUrl(supabaseUrl: string) {
  const explicit = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (explicit) return explicit;

  const parsed = new URL(supabaseUrl);
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    throw new Error("SUPABASE_DB_URL or DATABASE_URL is required for non-local Supabase verification.");
  }
  const apiPort = Number(parsed.port);
  if (!Number.isFinite(apiPort)) throw new Error("Could not infer local Supabase database port.");
  return `postgresql://postgres:postgres@${parsed.hostname}:${apiPort + 1}/postgres`;
}

function loadEnvFile(path: string) {
  const envPath = resolve(process.cwd(), path);
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
