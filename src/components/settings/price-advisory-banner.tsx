"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { useRouter } from "next/navigation";
import { resolveManagedSaasTaskModelDefaults, type ModelPrice } from "@/lib/ai/model-catalog";
import { isManagedSaasDeployment } from "@/lib/deployment/mode";
import { fetchAllowedModelsForCurrentUser, fetchCurrentModelPricing } from "@/lib/subscription/client-tier-models";
import { createClient } from "@/lib/supabase/client";

const TASKS = [
  { task: "critic" as const, field: "llm_critic_model" as const, label: "Critic lenses" },
  { task: "rewrite" as const, field: "llm_rewrite_model" as const, label: "Full-book rewrite" },
  { task: "planning" as const, field: "llm_planning_model" as const, label: "Architecture & planning" },
];

// A model has to be at least this much cheaper (blended input+output cost)
// before this nags anyone about it -- a $0.001/M-token wobble is exactly
// the kind of noise refreshModelPricingFromOpenRouter itself already
// filters out for billing purposes; the bar for "worth the interruption of
// asking a user to switch" should be higher still.
const WORTH_SWITCHING_THRESHOLD = 0.9; // recommended must cost <= 90% of current

const SNOOZE_STORAGE_KEY = "bookforge:price-advisory-snoozed-until";
const SNOOZE_DAYS = 14;

type Suggestion = { task: (typeof TASKS)[number]["task"]; field: (typeof TASKS)[number]["field"]; label: string; from: string; to: string };

function blendedCost(price: ModelPrice): number {
  return price.inputUsdMicrosPerMillion + price.outputUsdMicrosPerMillion;
}

function isSnoozed(): boolean {
  if (typeof window === "undefined") return true;
  const until = window.localStorage.getItem(SNOOZE_STORAGE_KEY);
  return Boolean(until) && new Date(until as string).getTime() > Date.now();
}

function snooze() {
  const until = new Date(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  window.localStorage.setItem(SNOOZE_STORAGE_KEY, until);
}

/**
 * Advisory-only nudge for managed-SaaS accounts: "Get my Models" only ever
 * runs when a user thinks to click it, so a price move that happens the
 * next day (or the next month) just sits there unused. Compares the
 * account's saved per-task models against what resolveManagedSaasTaskModelDefaults
 * would currently pick (same live pricing "Get my Models" already uses) and
 * offers a one-click switch when the gap is real -- never auto-switches on
 * its own, since someone may have picked a pricier model deliberately.
 */
export function PriceAdvisoryBanner() {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [applying, setApplying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isManagedSaasDeployment() || isSnoozed()) return;

    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: current } = await supabase
        .from("user_settings")
        .select("llm_critic_model,llm_rewrite_model,llm_planning_model")
        .eq("user_id", user.id)
        .maybeSingle();
      // Nothing configured yet -- this account hasn't used "Get my Models"
      // or set anything manually, so there's nothing to compare against.
      if (!current || !(current.llm_critic_model || current.llm_rewrite_model || current.llm_planning_model)) return;

      const [allowedModels, pricing] = await Promise.all([fetchAllowedModelsForCurrentUser(), fetchCurrentModelPricing()]);
      if (allowedModels.size === 0) return;

      const recommended = resolveManagedSaasTaskModelDefaults(allowedModels, pricing);
      const found: Suggestion[] = [];
      for (const { task, field, label } of TASKS) {
        const currentModel = current[field];
        const recommendedModel = recommended[task];
        if (!currentModel || currentModel === recommendedModel) continue;

        const currentPrice = pricing.get(currentModel);
        const recommendedPrice = pricing.get(recommendedModel);
        if (!currentPrice || !recommendedPrice) continue; // don't guess without real numbers

        if (blendedCost(recommendedPrice) <= blendedCost(currentPrice) * WORTH_SWITCHING_THRESHOLD) {
          found.push({ task, field, label, from: currentModel, to: recommendedModel });
        }
      }

      if (!cancelled && found.length > 0) setSuggestions(found);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (dismissed || !suggestions || suggestions.length === 0) return null;

  async function applyAll() {
    if (!suggestions) return;
    setApplying(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const payload: Record<string, string> = { user_id: user.id };
      for (const suggestion of suggestions) payload[suggestion.field] = suggestion.to;
      await supabase.from("user_settings").upsert(payload, { onConflict: "user_id" });
      setDismissed(true);
      router.refresh();
    } finally {
      setApplying(false);
    }
  }

  function dismiss() {
    snooze();
    setDismissed(true);
  }

  return (
    <Alert color="teal" title="Cheaper models are available" mb="md">
      <Stack gap="xs">
        <Text size="sm">
          Pricing has shifted since you last set this up. Switching would keep the same quality tier you already
          approved, just cheaper:
        </Text>
        <Stack gap={2}>
          {suggestions.map((s) => (
            <Text size="sm" key={s.task}>
              <strong>{s.label}:</strong> {s.from} → {s.to}
            </Text>
          ))}
        </Stack>
        <Group gap="xs" mt={4}>
          <Button size="xs" color="teal" loading={applying} onClick={applyAll}>
            Switch now
          </Button>
          <Button size="xs" variant="subtle" color="gray" onClick={dismiss}>
            Not now
          </Button>
        </Group>
      </Stack>
    </Alert>
  );
}
