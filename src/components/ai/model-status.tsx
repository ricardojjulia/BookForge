"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Button, Group, Loader, Text, Title } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";

type ConfiguredModel = {
  key: string;
  label: string;
  model: string;
  available: boolean;
};

type RecentIssue = {
  model: string;
  task: string;
  incidentCount: number;
  signature: string;
  sampleSize: number;
};

type ModelStatusPayload = {
  connected: boolean;
  baseUrl: string;
  availableModels: string[];
  configuredModels: ConfiguredModel[];
  rewriteModelSuitability?: {
    best: { model: string; score: number; label: string; reasons: string[] } | null;
    warning: string | null;
  };
  warnings: string[];
  recentIssues?: RecentIssue[];
  error: string | null;
};

export type ModelStatusHandle = { refresh: () => void };

type PillTone = "ok" | "warn" | "neutral";

const PILL_PALETTE: Record<PillTone, { bg: string; color: string }> = {
  ok: { bg: "oklch(0.94 0.05 165)", color: "oklch(0.4 0.1 165)" },
  warn: { bg: "oklch(0.95 0.06 45)", color: "oklch(0.5 0.12 45)" },
  neutral: { bg: "oklch(0.93 0.003 90)", color: "oklch(0.5 0.005 90)" },
};

function Pill({ label, tone }: { label: string; tone: PillTone }) {
  const palette = PILL_PALETTE[tone];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.03em",
        padding: "3px 9px",
        borderRadius: 5,
        background: palette.bg,
        color: palette.color,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function classifyModelKind(name: string): { kind: string; color: string } {
  const lower = name.toLowerCase();
  if (lower.includes("embed")) return { kind: "Embedding", color: "oklch(0.6 0.1 250)" };
  if (lower.includes("rerank")) return { kind: "Reranker", color: "oklch(0.6 0.1 300)" };
  return { kind: "Generation", color: "oklch(0.6 0.13 165)" };
}

export const ModelStatus = forwardRef<ModelStatusHandle>(function ModelStatus(_, ref) {
  const [status, setStatus] = useState<ModelStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);

  async function getStatus(): Promise<ModelStatusPayload> {
    try {
      const response = await fetch("/api/lmstudio/status", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load model status.");
      return result;
    } catch (error) {
      return {
        connected: false,
        baseUrl: "Unknown",
        availableModels: [],
        configuredModels: [],
        warnings: [],
        recentIssues: [],
        error: error instanceof Error ? error.message : "Unable to load model status.",
      };
    }
  }

  async function load() {
    setLoading(true);
    const result = await getStatus();
    setStatus(result);
    setLoading(false);
  }

  useImperativeHandle(ref, () => ({ refresh: load }));

  useEffect(() => {
    let active = true;
    getStatus().then((result) => {
      if (!active) return;
      setStatus(result);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      <Group justify="space-between" align="flex-start" mb={28} wrap="wrap">
        <div>
          <Title style={{ fontSize: 28, fontWeight: 800, color: "oklch(0.2 0.005 90)", letterSpacing: "-0.01em" }}>
            Model Status
          </Title>
          <Text mt={6} style={{ fontSize: 14, color: "oklch(0.5 0.005 90)" }}>
            LM Studio connection, visible models, and configured task assignments.
          </Text>
        </div>
        <Button leftSection={<IconRefresh size={16} />} color="grape" loading={loading} onClick={load}>
          Refresh
        </Button>
      </Group>

      {loading && !status ? <Loader color="grape" /> : null}

      {status && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
            <StatusMetric label="LM Studio" value={status.connected ? "Connected" : "Disconnected"} ok={status.connected} />
            <StatusMetric label="Base URL" value={status.baseUrl} />
            <StatusMetric label="Available models" value={status.availableModels.length} />
          </div>

          <div
            style={{
              background: "#fff",
              border: "1px solid oklch(0.92 0.003 90)",
              borderRadius: 12,
              padding: "22px 24px",
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 13, color: "oklch(0.55 0.005 90)" }}>Best available rewrite model</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: "oklch(0.2 0.005 90)" }}>
                {status.rewriteModelSuitability?.best?.model || "None detected"}
              </span>
              <Pill
                label={
                  status.rewriteModelSuitability?.best?.score
                    ? `${status.rewriteModelSuitability.best.score}% SUITED`
                    : "NOT SCORED"
                }
                tone={(status.rewriteModelSuitability?.best?.score || 0) >= 80 ? "ok" : "warn"}
              />
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 13, color: "oklch(0.5 0.005 90)", lineHeight: 1.6 }}>
              {status.rewriteModelSuitability?.best?.reasons?.join(" ") ||
                "Load a prose-capable instruction model in LM Studio."}
            </p>
          </div>

          {status.error && (
            <div
              style={{
                background: "oklch(0.96 0.04 25)",
                border: "1px solid oklch(0.85 0.08 25)",
                borderRadius: 10,
                padding: "14px 18px",
                marginBottom: 16,
                fontSize: 13,
                color: "oklch(0.4 0.1 25)",
              }}
            >
              {status.error}
            </div>
          )}
          {status.warnings.map((warning) => (
            <div
              key={warning}
              style={{
                background: "oklch(0.97 0.04 95)",
                border: "1px solid oklch(0.88 0.06 95)",
                borderRadius: 10,
                padding: "14px 18px",
                marginBottom: 16,
                fontSize: 13,
                color: "oklch(0.4 0.06 85)",
              }}
            >
              {warning}
            </div>
          ))}

          {!!status.recentIssues?.length && (
            <div
              style={{
                background: "#fff",
                border: "1px solid oklch(0.92 0.003 90)",
                borderRadius: 12,
                padding: "18px 22px",
                marginBottom: 28,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "oklch(0.2 0.005 90)", marginBottom: 12 }}>
                Recent issues (last 14 days)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {status.recentIssues.map((issue) => (
                  <div
                    key={`${issue.model}:${issue.task}`}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                  >
                    <span style={{ fontSize: 13, color: "oklch(0.4 0.005 90)" }}>
                      <strong style={{ fontWeight: 700, color: "oklch(0.2 0.005 90)" }}>{issue.model}</strong> on{" "}
                      {issue.task} — {issue.signature.replaceAll("_", " ")}
                    </span>
                    <Pill label={`${issue.incidentCount}/${issue.sampleSize} CALLS`} tone="warn" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "oklch(0.2 0.005 90)", marginBottom: 12 }}>
              Task assignments
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {status.configuredModels.map((item) => {
                const tone: PillTone = item.model && item.available ? "ok" : item.model ? "warn" : "neutral";
                const barColor =
                  tone === "ok" ? "oklch(0.6 0.13 165)" : tone === "warn" ? "oklch(0.65 0.13 70)" : "oklch(0.8 0.003 90)";
                return (
                  <div
                    key={item.key}
                    style={{
                      background: "#fff",
                      border: "1px solid oklch(0.92 0.003 90)",
                      borderLeft: `3px solid ${barColor}`,
                      borderRadius: 10,
                      padding: "16px 18px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.2 0.005 90)" }}>{item.label}</span>
                      <Pill label={item.model && item.available ? "AVAILABLE" : item.model ? "UNAVAILABLE" : "UNSET"} tone={tone} />
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        color: "oklch(0.45 0.005 90)",
                        fontFamily: "ui-monospace, monospace",
                        lineHeight: 1.4,
                        wordBreak: "break-all",
                      }}
                    >
                      {item.model || "Not configured"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "oklch(0.2 0.005 90)" }}>Available models</span>
              <span style={{ fontSize: 13, color: "oklch(0.55 0.005 90)" }}>{status.availableModels.length} total</span>
            </div>
            {status.availableModels.length ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                {status.availableModels.map((model) => {
                  const { kind, color } = classifyModelKind(model);
                  return (
                    <div
                      key={model}
                      style={{
                        background: "#fff",
                        border: "1px solid oklch(0.92 0.003 90)",
                        borderRadius: 10,
                        padding: "12px 14px",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "oklch(0.25 0.005 90)",
                            fontFamily: "ui-monospace, monospace",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {model}
                        </div>
                        <div style={{ fontSize: 11, color: "oklch(0.55 0.005 90)", marginTop: 2 }}>{kind}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Text c="dimmed">No models reported by LM Studio.</Text>
            )}
          </div>
        </>
      )}
    </div>
  );
});

function StatusMetric({ label, value, ok }: { label: string; value: string | number; ok?: boolean }) {
  return (
    <div style={{ background: "#fff", border: "1px solid oklch(0.92 0.003 90)", borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ fontSize: 13, color: "oklch(0.55 0.005 90)" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: "oklch(0.2 0.005 90)" }}>{value}</span>
        {typeof ok === "boolean" && <Pill label={ok ? "OK" : "CHECK"} tone={ok ? "ok" : "warn"} />}
      </div>
    </div>
  );
}
