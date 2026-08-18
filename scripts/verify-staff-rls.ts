import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Rerunnable regression check for the platform-staff RLS bypass (has_book_role +
// storage bucket policies) and the ban-based account deletion round trip. There is
// no RLS test infrastructure in this repo -- Vitest tests all use mocked Supabase
// clients, which structurally cannot catch an RLS regression -- so this script is
// the load-bearing check for changes to has_book_role, run against the real local
// Supabase stack. Usage: npx tsx scripts/verify-staff-rls.ts

loadEnvFile(".env.local");

const URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const ANON = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

// Two pre-existing local-dev-only test accounts already used throughout this
// project for live verification (see reference_local_test_accounts memory).
const USER_A_EMAIL = "openrouter-test@bookforge.local";
const USER_A_PASSWORD = "OpenRouterTest123!";
const TARGET_BOOK_ID = "60c97fde-e68a-4071-9e84-271fc023ddd8"; // "ULT.IO", owned by User A
const USER_B_EMAIL = "test@bookforge.local"; // promoted to steward mid-test, then demoted back
const USER_B_PASSWORD = "bookforge123";

let failures = 0;
function check(label: string, condition: unknown) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
  if (!condition) failures++;
}

async function signInAs(email: string, password: string) {
  const client = createClient(URL, ANON);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { client, userId: data.user.id };
}

async function countRows(table: string, column: string, value: string) {
  const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  if (error) throw error;
  return count;
}

async function main() {
  const userB = await signInAs(USER_B_EMAIL, USER_B_PASSWORD);

  console.log("\n=== Non-staff User B cannot see User A's book ===");
  const { data: booksBefore } = await userB.client.from("books").select("id").eq("id", TARGET_BOOK_ID);
  check("0 rows via `books` table (its own inlined policy path)", (booksBefore || []).length === 0);

  const { data: chaptersBefore } = await userB.client.from("chapters").select("id").eq("book_id", TARGET_BOOK_ID);
  check("0 rows via `chapters` (can_view_book -> has_book_role wrapper path)", (chaptersBefore || []).length === 0);

  console.log("\n=== Promoting User B to steward ===");
  const { error: promoteError } = await admin.from("profiles").update({ platform_role: "steward" }).eq("id", userB.userId);
  if (promoteError) throw promoteError;

  const { data: booksAfter, error: booksAfterErr } = await userB.client.from("books").select("id,title").eq("id", TARGET_BOOK_ID);
  check("Steward CAN see the book via `books`' own inlined policy", !booksAfterErr && (booksAfter || []).length === 1);

  const { data: chaptersAfter, error: chaptersAfterErr } = await userB.client.from("chapters").select("id").eq("book_id", TARGET_BOOK_ID);
  check("Steward CAN see chapters via the wrapper-function path", !chaptersAfterErr && (chaptersAfter?.length || 0) > 0);

  const { data: firstChapter, error: firstChapterErr } = await admin
    .from("chapters")
    .select("id")
    .eq("book_id", TARGET_BOOK_ID)
    .order("chapter_number")
    .limit(1)
    .single();
  if (firstChapterErr) throw firstChapterErr;
  const { error: updateErr } = await userB.client.from("chapters").update({ updated_at: new Date().toISOString() }).eq("id", firstChapter.id);
  check("Steward can UPDATE a chapter (can_edit_book path)", !updateErr);

  console.log("\n=== Demoting User B back to ordinary ===");
  const { error: demoteError } = await admin.from("profiles").update({ platform_role: null }).eq("id", userB.userId);
  if (demoteError) throw demoteError;

  const { data: booksAfterDemote } = await userB.client.from("books").select("id").eq("id", TARGET_BOOK_ID);
  check("Demoted user sees 0 rows again", (booksAfterDemote || []).length === 0);

  console.log("\n=== Ban -> restore round trip preserves all data ===");
  const beforeCounts = {
    chapters: await countRows("chapters", "book_id", TARGET_BOOK_ID),
    paragraphs: await countRows("paragraphs", "book_id", TARGET_BOOK_ID),
    revisions: await countRows("revision_versions", "book_id", TARGET_BOOK_ID),
  };
  console.log("row counts before ban:", beforeCounts);

  const { data: userList, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw listErr;
  const userA = userList.users.find((u) => u.email === USER_A_EMAIL);
  if (!userA) throw new Error(`Could not find ${USER_A_EMAIL} via listUsers`);

  const { error: banErr } = await admin.auth.admin.updateUserById(userA.id, { ban_duration: "720h" });
  check("Ban call succeeds", !banErr);

  const afterBanCounts = {
    chapters: await countRows("chapters", "book_id", TARGET_BOOK_ID),
    paragraphs: await countRows("paragraphs", "book_id", TARGET_BOOK_ID),
    revisions: await countRows("revision_versions", "book_id", TARGET_BOOK_ID),
  };
  check("Row counts unchanged immediately after ban (no cascade fired)", JSON.stringify(beforeCounts) === JSON.stringify(afterBanCounts));

  const bannedSignIn = await createClient(URL, ANON).auth.signInWithPassword({ email: USER_A_EMAIL, password: USER_A_PASSWORD });
  check("Banned user cannot sign in", !!bannedSignIn.error);

  const { error: unbanErr } = await admin.auth.admin.updateUserById(userA.id, { ban_duration: "none" });
  check("Unban call succeeds", !unbanErr);

  const afterRestoreCounts = {
    chapters: await countRows("chapters", "book_id", TARGET_BOOK_ID),
    paragraphs: await countRows("paragraphs", "book_id", TARGET_BOOK_ID),
    revisions: await countRows("revision_versions", "book_id", TARGET_BOOK_ID),
  };
  check("Row counts unchanged after restore", JSON.stringify(beforeCounts) === JSON.stringify(afterRestoreCounts));

  const restoredSignIn = await createClient(URL, ANON).auth.signInWithPassword({ email: USER_A_EMAIL, password: USER_A_PASSWORD });
  check("Restored user can sign in again", !restoredSignIn.error);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
