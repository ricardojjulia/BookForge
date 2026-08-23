"use client";

import { useRef } from "react";
import { ModelStatus, type ModelStatusHandle } from "@/components/ai/model-status";
import { PriceAdvisoryBanner } from "@/components/settings/price-advisory-banner";
import { SettingsForm } from "@/components/settings/settings-form";
import type { Settings } from "@/components/settings/settings-form";

export function SettingsPageClient({
  userId,
  initial,
  hasApiKey,
}: {
  userId: string;
  initial?: Partial<Settings>;
  hasApiKey?: boolean;
}) {
  const modelStatusRef = useRef<ModelStatusHandle>(null);

  return (
    <>
      <PriceAdvisoryBanner />
      <SettingsForm userId={userId} initial={initial} hasApiKey={hasApiKey} onSaved={() => modelStatusRef.current?.refresh()} />
      <div style={{ marginTop: 24 }}>
        <ModelStatus ref={modelStatusRef} />
      </div>
    </>
  );
}
