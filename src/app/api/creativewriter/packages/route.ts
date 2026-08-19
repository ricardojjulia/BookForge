import { NextResponse } from "next/server";
import { z } from "zod";
import { logicalBookForgePackageSchema } from "@/lib/bookforge-package";
import { insertCreativeWriterPackage } from "@/lib/creativewriter-cloud/package-transfer";
import { creativeWriterAccessDenied } from "@/lib/creativewriter-ui/access";
import { forbiddenResponse } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const uploadSchema = z.object({
  package: logicalBookForgePackageSchema,
  projectName: z.string().trim().min(1).max(160).optional(),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to upload CreativeWriter package.";
}

export async function POST(request: Request) {
  try {
    const accessDenied = creativeWriterAccessDenied();
    if (accessDenied) return forbiddenResponse(accessDenied);

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const body = uploadSchema.parse(await request.json());
    const result = await insertCreativeWriterPackage({
      supabase,
      userId: user.id,
      pkg: body.package,
      projectName: body.projectName,
    });

    return NextResponse.json({
      content: {
        ...result,
        imported: true,
      },
    });
  } catch (error) {
    console.error("CreativeWriter package upload failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
