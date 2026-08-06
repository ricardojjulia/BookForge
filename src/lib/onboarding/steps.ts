import { createClient } from "@/lib/supabase/client";

export const ONBOARDING_STEPS = {
  aiSetup: "ai_setup",
  bookPipelineTour: "book_pipeline_tour",
} as const;

export async function markOnboardingStepDone(userId: string, stepKey: string, existingSteps: string[]) {
  const supabase = createClient();
  const steps = Array.from(new Set([...existingSteps, stepKey]));
  await supabase
    .from("user_settings")
    .upsert({ user_id: userId, onboarding_completed_steps: steps }, { onConflict: "user_id" });
}

/** AI-engine setup is a hard prerequisite -- don't show the book-pipeline
 * tour until it's done, so the two auto-opening wizards never compete. */
export function shouldAutoOpenBookPipelineTour(completedSteps: string[]) {
  return (
    completedSteps.includes(ONBOARDING_STEPS.aiSetup) &&
    !completedSteps.includes(ONBOARDING_STEPS.bookPipelineTour)
  );
}
