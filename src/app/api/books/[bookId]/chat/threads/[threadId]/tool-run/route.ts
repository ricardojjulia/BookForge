import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  toolName: z.enum(["rewrite_plan", "critic_all", "humanize_guidance"]),
  command: z.string().min(1).max(12000).optional(),
  idempotencyKey: z.string().min(1).max(120).optional(),
  toolArgs: z
    .object({
      stage: z.enum(["baseline", "post_rewrite"]).optional(),
      launch: z.boolean().optional(),
      metadataSnapshotId: z.string().uuid().optional(),
      metadataBranchName: z.string().min(1).max(80).optional(),
    })
    .optional(),
});

type ToolRunResult = {
  status: "queued" | "completed";
  summary: string;
  jobId: string | null;
  payload: Record<string, unknown>;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string; threadId: string }> },
) {
  try {
    const { bookId, threadId } = await params;
    const body = schema.parse(await request.json().catch(() => ({})));

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: thread, error: threadError } = await supabase
      .from("chat_threads")
      .select("id,book_id")
      .eq("id", threadId)
      .eq("book_id", bookId)
      .single();

    if (threadError) throw threadError;
    if (!thread) return NextResponse.json({ error: "Chat thread not found." }, { status: 404 });

    const userText = body.command?.trim() || `Run workflow: ${body.toolName}`;
    const now = new Date().toISOString();

    const { data: userMessage, error: userMessageError } = await supabase
      .from("chat_messages")
      .insert({
        thread_id: threadId,
        book_id: bookId,
        role: "user",
        content: userText,
        content_json: {
          mode: "run",
          requestedTool: body.toolName,
          toolArgs: body.toolArgs || {},
          idempotencyKey: body.idempotencyKey || null,
        },
        status: "completed",
        created_by: user.id,
      })
      .select("id,thread_id,role,content,content_json,created_at")
      .single();

    if (userMessageError) throw userMessageError;

    const { data: assistantMessage, error: assistantMessageError } = await supabase
      .from("chat_messages")
      .insert({
        thread_id: threadId,
        book_id: bookId,
        role: "assistant",
        content: `Running ${readableToolName(body.toolName)}...`,
        content_json: {
          mode: "run",
          pendingTool: body.toolName,
        },
        status: "streaming",
      })
      .select("id,thread_id,role,content,content_json,created_at")
      .single();

    if (assistantMessageError) throw assistantMessageError;

    const execution = await executeTool({ request, bookId, toolName: body.toolName, toolArgs: body.toolArgs || {} });

    const { data: toolCall, error: toolCallError } = await supabase
      .from("chat_tool_calls")
      .insert({
        thread_id: threadId,
        message_id: assistantMessage.id,
        tool_name: body.toolName,
        tool_args: body.toolArgs || {},
        tool_result: execution.payload,
        job_id: execution.jobId,
        status: execution.status,
      })
      .select("id,tool_name,status,job_id,tool_result,created_at")
      .single();

    if (toolCallError) throw toolCallError;

    const assistantContent = execution.summary;
    const { data: finalizedAssistant, error: finalizedAssistantError } = await supabase
      .from("chat_messages")
      .update({
        content: assistantContent,
        content_json: {
          mode: "run",
          toolCall: {
            id: toolCall.id,
            toolName: toolCall.tool_name,
            status: toolCall.status,
            jobId: toolCall.job_id,
          },
          toolResult: toolCall.tool_result,
        },
        status: "completed",
      })
      .eq("id", assistantMessage.id)
      .eq("thread_id", threadId)
      .eq("book_id", bookId)
      .select("id,thread_id,role,content,content_json,created_at")
      .single();

    if (finalizedAssistantError) throw finalizedAssistantError;

    await supabase
      .from("chat_threads")
      .update({
        mode: "run",
        last_message_preview: truncate(assistantContent.replace(/\s+/g, " "), 180),
        last_message_at: now,
        updated_at: now,
      })
      .eq("id", threadId)
      .eq("book_id", bookId);

    return NextResponse.json({
      toolCall,
      userMessage,
      assistantMessage: finalizedAssistant,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to run workflow tool." }, { status: 500 });
  }
}

async function executeTool(input: {
  request: Request;
  bookId: string;
  toolName: "rewrite_plan" | "critic_all" | "humanize_guidance";
  toolArgs: {
    stage?: "baseline" | "post_rewrite";
    launch?: boolean;
    metadataSnapshotId?: string;
    metadataBranchName?: string;
  };
}): Promise<ToolRunResult> {
  const origin = new URL(input.request.url).origin;

  if (input.toolName === "humanize_guidance") {
    const response = await postJson(`${origin}/api/books/${input.bookId}/humanize-guidance`, input.request, {});
    return {
      status: "completed",
      summary: "Humanized guidance generated and saved to reports.",
      jobId: null,
      payload: response,
    };
  }

  if (input.toolName === "rewrite_plan") {
    const queued = await postJson(
      `${origin}/api/books/${input.bookId}/rewrite-plan`,
      input.request,
      {
        serverManaged: true,
        metadataSnapshotId: input.toolArgs.metadataSnapshotId || undefined,
        metadataBranchName: input.toolArgs.metadataBranchName || undefined,
      },
    );

    const jobId = stringValue((queued as { content?: { jobId?: unknown } }).content?.jobId);
    const launch = input.toolArgs.launch === true;

    if (launch && jobId) {
      const launched = await postJson(
        `${origin}/api/books/${input.bookId}/rewrite-plan`,
        input.request,
        {
          jobId,
          metadataSnapshotId: input.toolArgs.metadataSnapshotId || undefined,
          metadataBranchName: input.toolArgs.metadataBranchName || undefined,
        },
      );
      return {
        status: "completed",
        summary: `Rewrite plan run finished. Job ${jobId}.`,
        jobId,
        payload: launched,
      };
    }

    return {
      status: "queued",
      summary: jobId ? `Rewrite plan queued as job ${jobId}.` : "Rewrite plan queued.",
      jobId: jobId || null,
      payload: queued,
    };
  }

  const queued = await postJson(
    `${origin}/api/books/${input.bookId}/critic/all`,
    input.request,
    {
      stage: input.toolArgs.stage || "post_rewrite",
      serverManaged: true,
      metadataSnapshotId: input.toolArgs.metadataSnapshotId || undefined,
      metadataBranchName: input.toolArgs.metadataBranchName || undefined,
    },
  );

  const jobId = stringValue((queued as { content?: { jobId?: unknown } }).content?.jobId);
  const launch = input.toolArgs.launch === true;

  if (launch && jobId) {
    const launched = await postJson(
      `${origin}/api/books/${input.bookId}/critic/all`,
      input.request,
      {
        stage: input.toolArgs.stage || "post_rewrite",
        jobId,
        metadataSnapshotId: input.toolArgs.metadataSnapshotId || undefined,
        metadataBranchName: input.toolArgs.metadataBranchName || undefined,
      },
    );
    return {
      status: "completed",
      summary: `Critic batch finished. Job ${jobId}.`,
      jobId,
      payload: launched,
    };
  }

  return {
    status: "queued",
    summary: jobId ? `Critic batch queued as job ${jobId}.` : "Critic batch queued.",
    jobId: jobId || null,
    payload: queued,
  };
}

async function postJson(url: string, parentRequest: Request, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: parentRequest.headers.get("cookie") || "",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(stringValue(payload.error) || `Tool execution failed with HTTP ${response.status}.`);
  }
  return payload;
}

function readableToolName(toolName: string) {
  if (toolName === "rewrite_plan") return "Rewrite Plan";
  if (toolName === "critic_all") return "Critic Batch";
  return "Humanize Guidance";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3))}...`;
}
