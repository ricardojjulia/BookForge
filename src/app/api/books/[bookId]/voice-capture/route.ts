import { NextResponse } from "next/server";
import { z } from "zod";
import { createManagedChatCompletion } from "@/lib/lmstudio/client";
import { getLmStudioErrorMessage } from "@/lib/lmstudio/errors";
import { parseModelJsonOrFallback } from "@/lib/lmstudio/json";
import { getExtractionModelCandidates } from "@/lib/lmstudio/model-selection";
import { selectAndPrepareActiveModel } from "@/lib/lmstudio/orchestrator";
import { getUserLmStudioSettings } from "@/lib/lmstudio/settings";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  chapterIds: z.array(z.string().uuid()).min(1).max(5),
});

const VOICE_CAPTURE_PROMPT = (sampleText: string) => `You are a literary voice analyst. Analyze the following manuscript sample and extract a precise voice profile that can be used to guide AI rewriting to match this author's style.

MANUSCRIPT SAMPLE:
${sampleText}

Analyze and return a JSON object with these fields:
{
  "sentenceStyle": "description of typical sentence length, rhythm, and structure",
  "paragraphStructure": "how paragraphs are typically built — length, beat patterns, white space use",
  "dialogueStyle": "how dialogue is written — attribution style, beats, internal thought integration",
  "vocabularyRegister": "word choice level — literary/colloquial/technical, any distinctive patterns",
  "narrativeTone": "emotional register, distance, warmth, irony level",
  "paceSignature": "how pace is controlled — action density, reflection ratio, scene length",
  "distinctivePatterns": ["list of specific recurring stylistic choices or habits"],
  "avoidList": ["things that would break this voice — patterns the author never uses"],
  "rewriteInstruction": "one clear paragraph an AI rewriter should internalize to match this voice"
}

Return ONLY the JSON object.`;

export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: book } = await supabase.from("books").select("id").eq("id", bookId).eq("owner_id", user.id).single();
    if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

    const { data: paragraphs } = await supabase
      .from("paragraphs")
      .select("original_text,accepted_text,chapter_id,paragraph_number")
      .eq("book_id", bookId)
      .in("chapter_id", body.chapterIds)
      .order("paragraph_number");

    const sampleText = (paragraphs || [])
      .map((p) => (p.accepted_text || p.original_text || "").trim())
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 18000);

    if (sampleText.length < 200) {
      return NextResponse.json({ error: "Not enough text in the selected chapters to analyze voice." }, { status: 400 });
    }

    const settings = await getUserLmStudioSettings(user.id);
    const modelPlan = await selectAndPrepareActiveModel(settings, {
      task: "extraction",
      candidates: getExtractionModelCandidates(settings),
      expectedCalls: 1,
      latencyPreference: "quality",
    });
    const { client, preparedModel } = modelPlan;

    const completion = await createManagedChatCompletion(client, preparedModel, {
      temperature: 0.3,
      top_p: settings.topP,
      max_tokens: Math.min(settings.maxOutputTokens, 2000),
      messages: [{ role: "user", content: VOICE_CAPTURE_PROMPT(sampleText) }],
      response_format: { type: "text" },
    });

    const voiceProfile = parseModelJsonOrFallback(
      completion.choices[0]?.message.content || "{}",
      (raw) => ({ rewriteInstruction: raw, sentenceStyle: "", paragraphStructure: "", dialogueStyle: "", vocabularyRegister: "", narrativeTone: "", paceSignature: "", distinctivePatterns: [], avoidList: [] }),
    );

    const { data: existingBible } = await supabase.from("book_bibles").select("id").eq("book_id", bookId).maybeSingle();
    if (existingBible) {
      await supabase.from("book_bibles").update({ voice_profile: voiceProfile, updated_at: new Date().toISOString() }).eq("book_id", bookId);
    } else {
      await supabase.from("book_bibles").insert({ book_id: bookId, content: {}, voice_profile: voiceProfile });
    }

    return NextResponse.json({ voiceProfile });
  } catch (error) {
    console.error("voice-capture failed", error);
    const msg = getLmStudioErrorMessage(error, "") || (error instanceof Error ? error.message : "Failed.");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
