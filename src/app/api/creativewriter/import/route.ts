import { NextResponse } from "next/server";
import { buildCreativeWriterPackageFromImport, creativeWriterImportSourceSchema } from "@/lib/creativewriter-import";
import { insertCreativeWriterPackage } from "@/lib/creativewriter-cloud/package-transfer";
import { createClient } from "@/lib/supabase/server";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to import CreativeWriter files.";
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const formData = await request.formData();
    const files = [...formData.getAll("files"), ...formData.getAll("file")].filter((value): value is File => value instanceof File && value.size > 0);
    const title = String(formData.get("title") || "");
    const authorName = String(formData.get("authorName") || "");
    const projectName = String(formData.get("projectName") || "");
    const source = creativeWriterImportSourceSchema.parse(String(formData.get("source") || "auto"));

    const imported = await buildCreativeWriterPackageFromImport({
      files,
      title,
      authorName: authorName || null,
      source,
    });

    const result = await insertCreativeWriterPackage({
      supabase,
      userId: user.id,
      pkg: imported.package,
      projectName: projectName || undefined,
    });

    return NextResponse.json({
      content: {
        ...result,
        imported: true,
        source: imported.source,
        importedFileCount: imported.importedFileCount,
        manuscriptEntryCount: imported.manuscriptEntryCount,
        noteEntryCount: imported.noteEntryCount,
        warnings: imported.warnings,
      },
    });
  } catch (error) {
    console.error("CreativeWriter import failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
