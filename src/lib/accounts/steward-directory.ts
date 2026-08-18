import type { createAdminClient } from "@/lib/supabase/admin";

type AdminSupabase = ReturnType<typeof createAdminClient>;

export type StewardAccount = {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  deletionStatus: "pending" | "ready_for_purge" | null;
  purgeAfter: string | null;
  platformRole: string | null;
  bookCount: number;
};

export type StewardBook = {
  id: string;
  title: string;
  author_name: string | null;
  status: string | null;
  owner_id: string;
  ownerEmail: string | null;
  updated_at: string | null;
};

const PER_PAGE = 50;

// Shared between the initial server-rendered page load and the client's
// search/pagination requests to /api/steward/accounts, so the listUsers +
// deletion-status join logic exists in exactly one place.
export async function listStewardAccounts(admin: AdminSupabase, options: { search?: string; page?: number } = {}) {
  const search = (options.search || "").trim().toLowerCase();
  const page = Math.max(1, options.page || 1);

  const [{ data: userList, error: listError }, { data: activeRequests, error: requestsError }, { data: profileRows, error: profilesError }, { data: ownerRows, error: ownerError }] = await Promise.all([
    admin.auth.admin.listUsers({ page, perPage: PER_PAGE }),
    admin
      .from("account_deletion_requests")
      .select("user_id, status, requested_at, purge_after")
      .in("status", ["pending", "ready_for_purge"]),
    admin.from("profiles").select("id, platform_role"),
    // Just the owner_id column, tallied in JS -- the JS client has no GROUP BY,
    // and this is a single narrow column across all books, acceptable at the
    // same "internal support tool" scale as the rest of this module.
    admin.from("books").select("owner_id"),
  ]);
  if (listError) throw listError;
  if (requestsError) throw requestsError;
  if (profilesError) throw profilesError;
  if (ownerError) throw ownerError;

  const deletionByUserId = new Map((activeRequests || []).map((row) => [row.user_id, row]));
  const roleByUserId = new Map((profileRows || []).map((row) => [row.id, row.platform_role]));
  const bookCountByOwnerId = new Map<string, number>();
  for (const row of ownerRows || []) {
    bookCountByOwnerId.set(row.owner_id, (bookCountByOwnerId.get(row.owner_id) || 0) + 1);
  }

  // listUsers has no server-side email filter; the search box only narrows the
  // current page rather than searching the whole user base. Acceptable for an
  // internal support tool at this scale -- revisit if the user list grows large
  // enough that this stops being useful.
  const accounts: StewardAccount[] = userList.users
    .filter((account) => !search || account.email?.toLowerCase().includes(search))
    .map((account) => {
      const deletionRequest = deletionByUserId.get(account.id);
      return {
        id: account.id,
        email: account.email ?? null,
        createdAt: account.created_at,
        lastSignInAt: account.last_sign_in_at || null,
        bannedUntil: account.banned_until || null,
        deletionStatus: (deletionRequest?.status as StewardAccount["deletionStatus"]) || null,
        purgeAfter: deletionRequest?.purge_after || null,
        platformRole: roleByUserId.get(account.id) || null,
        bookCount: bookCountByOwnerId.get(account.id) || 0,
      };
    });

  return { accounts, page, hasMore: userList.users.length === PER_PAGE };
}

export async function listStewardBooks(admin: AdminSupabase, options: { search?: string; page?: number; ownerId?: string } = {}) {
  const search = (options.search || "").trim();
  const page = Math.max(1, options.page || 1);

  let query = admin
    .from("books")
    .select("id, title, author_name, status, owner_id, updated_at", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  if (search) query = query.ilike("title", `%${search}%`);
  if (options.ownerId) query = query.eq("owner_id", options.ownerId);

  const { data: books, error, count } = await query;
  if (error) throw error;

  const ownerIds = [...new Set((books || []).map((book) => book.owner_id))];
  const { data: userList, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  const emailByOwnerId = new Map(userList.users.filter((account) => ownerIds.includes(account.id)).map((account) => [account.id, account.email ?? null]));

  return {
    books: (books || []).map((book): StewardBook => ({ ...book, ownerEmail: emailByOwnerId.get(book.owner_id) || null })),
    page,
    hasMore: (count || 0) > page * PER_PAGE,
  };
}

const MAX_EMAIL_LOOKUP_PAGES = 20;

// listUsers has no server-side email filter (no getUserByEmail exists in the
// Admin API either), so resolving an exact email to a user id means paging
// through listUsers ourselves. Capped at 20,000 users -- an internal-tool
// scale limit consistent with the rest of this module.
export async function findUserIdByEmail(admin: AdminSupabase, email: string) {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= MAX_EMAIL_LOOKUP_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((account) => account.email?.toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}
