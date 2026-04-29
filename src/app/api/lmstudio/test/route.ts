import { NextResponse } from "next/server";
import { z } from "zod";
import { testLmStudioConnection } from "@/lib/lmstudio/client";

const schema = z.object({
  baseUrl: z.string().url().optional(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const result = await testLmStudioConnection({ baseUrl: body.baseUrl });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Connection failed." },
      { status: 500 },
    );
  }
}
