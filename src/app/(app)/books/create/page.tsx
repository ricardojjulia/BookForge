import { Alert, Container } from "@mantine/core";
import { CreateBookWizard } from "@/components/books/create-book-wizard";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CreateBookPage() {
  if (!hasSupabaseEnv()) {
    return (
      <Container size="xl">
        <Alert color="yellow">Configure Supabase before creating a book.</Alert>
      </Container>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Container size="xl">
        <Alert color="grape">Sign in to create a book.</Alert>
      </Container>
    );
  }

  // A concept pass and/or generated architecture can represent real AI work
  // (10-30+ seconds each) that's fully saved server-side the moment it's
  // generated -- but the wizard itself only ever starts from blank local
  // state, with no way to notice or resume an in-progress project. Any
  // reload, tab close, or navigation away made that work look permanently
  // lost even though it was sitting safely in the database the whole time.
  let { data: existingProjectRow } = await supabase
    .from("creation_projects")
    .select("*")
    .eq("owner_id", user.id)
    .is("created_book_id", null)
    .neq("status", "cancelled")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // A creation_projects row can end up permanently unlinked (created_book_id
  // stays null) if an earlier attempt failed or was quietly abandoned when
  // the user just retried with the same idea -- new attempts now cancel
  // their predecessors going forward (see concept/route.ts), but this
  // guards against whatever's already sitting stale in the database today,
  // and against any other path that could leave one behind. Found live:
  // resuming a stale row like this reopens the wizard at "generate a fresh
  // draft," which risks the user mistaking it for -- and re-spending real
  // AI credits re-generating -- a book they already finished under a
  // different, successfully-linked creation_projects row. A title match
  // against a real book the user already owns is treated as proof this
  // attempt was superseded, and self-heals by cancelling it here so it
  // stops surfacing on every future visit too, not just this one.
  if (existingProjectRow?.working_title) {
    const { data: matchingBook } = await supabase
      .from("books")
      .select("id")
      .ilike("title", existingProjectRow.working_title)
      .limit(1)
      .maybeSingle();
    if (matchingBook) {
      await supabase
        .from("creation_projects")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", existingProjectRow.id);
      existingProjectRow = null;
    }
  }

  let existingProject = null;
  if (existingProjectRow) {
    const [{ data: conceptVersion }, { data: architectureVersion }] = await Promise.all([
      supabase
        .from("creation_plan_versions")
        .select("content, created_at")
        .eq("creation_project_id", existingProjectRow.id)
        .eq("version_type", "concept")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("creation_plan_versions")
        .select("content, created_at")
        .eq("creation_project_id", existingProjectRow.id)
        .eq("version_type", "architecture")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    existingProject = {
      id: existingProjectRow.id as string,
      workingTitle: existingProjectRow.working_title as string,
      idea: existingProjectRow.idea_prompt as string,
      genre: existingProjectRow.genre as string | null,
      audience: existingProjectRow.target_audience as string | null,
      language: existingProjectRow.language as string | null,
      targetPages: existingProjectRow.target_pages as number,
      tone: (existingProjectRow.tone as string | null) || "",
      boundaries: (existingProjectRow.boundaries as string | null) || "",
      mode: existingProjectRow.creation_mode as "single_safe" | "dual_role_sequential",
      dialogDensity: (existingProjectRow.dialog_density as string | null) || "normal",
      updatedAt: existingProjectRow.updated_at as string,
      concept: (conceptVersion?.content as Record<string, unknown> | null) || null,
      architecture: (architectureVersion?.content as Record<string, unknown> | null) || null,
    };
  }

  return (
    <Container size="xl">
      <CreateBookWizard existingProject={existingProject} />
    </Container>
  );
}
