"use client";

import { useRef } from "react";
import { ModelStatus, type ModelStatusHandle } from "@/components/ai/model-status";
import { SettingsForm } from "@/components/settings/settings-form";
import type { Settings } from "@/components/settings/settings-form";

export function SettingsPageClient({
  userId,
  initial,
}: {
  userId: string;
  initial?: Partial<Settings>;
}) {
  const modelStatusRef = useRef<ModelStatusHandle>(null);

  return (
    <>
      <SettingsForm userId={userId} initial={initial} onSaved={() => modelStatusRef.current?.refresh()} />
      <div style={{ marginTop: 24 }}>
        <ModelStatus ref={modelStatusRef} />
      </div>
    </>
  );
}
