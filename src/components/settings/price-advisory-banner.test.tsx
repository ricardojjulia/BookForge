import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PriceAdvisoryBanner } from "./price-advisory-banner";

const { getUser, maybeSingle, upsert, isManagedSaasDeployment, fetchAllowedModelsForCurrentUser, fetchCurrentModelPricing, refresh } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    maybeSingle: vi.fn(),
    upsert: vi.fn(async () => ({ error: null })),
    isManagedSaasDeployment: vi.fn(() => true),
    fetchAllowedModelsForCurrentUser: vi.fn(),
    fetchCurrentModelPricing: vi.fn(),
    refresh: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

vi.mock("@/lib/deployment/mode", () => ({
  isManagedSaasDeployment,
}));

vi.mock("@/lib/subscription/client-tier-models", () => ({
  fetchAllowedModelsForCurrentUser,
  fetchCurrentModelPricing,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser },
    from: (table: string) => {
      if (table === "user_settings") {
        return {
          select: () => ({ eq: () => ({ maybeSingle }) }),
          upsert,
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

function renderBanner() {
  return render(
    <MantineProvider>
      <PriceAdvisoryBanner />
    </MantineProvider>,
  );
}

describe("PriceAdvisoryBanner", () => {
  beforeEach(() => {
    window.localStorage.clear();
    getUser.mockReset();
    maybeSingle.mockReset();
    upsert.mockClear();
    isManagedSaasDeployment.mockReturnValue(true);
    fetchAllowedModelsForCurrentUser.mockReset();
    fetchCurrentModelPricing.mockReset();
    refresh.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    fetchAllowedModelsForCurrentUser.mockResolvedValue(new Set(["google/gemini-2.5-flash", "deepseek/deepseek-v4-pro"]));
  });

  afterEach(() => {
    cleanup();
  });

  it("suggests a switch when the configured model is meaningfully more expensive than the current recommendation", async () => {
    maybeSingle.mockResolvedValue({
      data: { llm_critic_model: "google/gemini-2.5-flash", llm_rewrite_model: null, llm_planning_model: null },
    });
    fetchCurrentModelPricing.mockResolvedValue(
      new Map([
        ["google/gemini-2.5-flash", { inputUsdMicrosPerMillion: 2_000_000, outputUsdMicrosPerMillion: 2_000_000 }],
        ["deepseek/deepseek-v4-pro", { inputUsdMicrosPerMillion: 100_000, outputUsdMicrosPerMillion: 100_000 }],
      ]),
    );

    renderBanner();

    await screen.findByText("Cheaper models are available");
    expect(screen.getByText(/google\/gemini-2.5-flash → deepseek\/deepseek-v4-pro/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Switch now" }));

    await waitFor(() => {
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: "user-1", llm_critic_model: "deepseek/deepseek-v4-pro" }),
        { onConflict: "user_id" },
      );
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("does not show when the price gap is below the worth-switching threshold", async () => {
    maybeSingle.mockResolvedValue({
      data: { llm_critic_model: "google/gemini-2.5-flash", llm_rewrite_model: null, llm_planning_model: null },
    });
    // DeepSeek is only marginally cheaper -- not enough to interrupt anyone.
    fetchCurrentModelPricing.mockResolvedValue(
      new Map([
        ["google/gemini-2.5-flash", { inputUsdMicrosPerMillion: 1_000_000, outputUsdMicrosPerMillion: 1_000_000 }],
        ["deepseek/deepseek-v4-pro", { inputUsdMicrosPerMillion: 980_000, outputUsdMicrosPerMillion: 980_000 }],
      ]),
    );

    renderBanner();

    await waitFor(() => expect(fetchCurrentModelPricing).toHaveBeenCalled());
    expect(screen.queryByText("Cheaper models are available")).not.toBeInTheDocument();
  });

  it("does nothing on self-hosted deployments", async () => {
    isManagedSaasDeployment.mockReturnValue(false);
    renderBanner();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("does nothing when the account has never configured a cloud model", async () => {
    maybeSingle.mockResolvedValue({
      data: { llm_critic_model: null, llm_rewrite_model: null, llm_planning_model: null },
    });

    renderBanner();

    await waitFor(() => expect(maybeSingle).toHaveBeenCalled());
    expect(fetchAllowedModelsForCurrentUser).not.toHaveBeenCalled();
    expect(screen.queryByText("Cheaper models are available")).not.toBeInTheDocument();
  });

  it("snoozes for future mounts once dismissed", async () => {
    maybeSingle.mockResolvedValue({
      data: { llm_critic_model: "google/gemini-2.5-flash", llm_rewrite_model: null, llm_planning_model: null },
    });
    fetchCurrentModelPricing.mockResolvedValue(
      new Map([
        ["google/gemini-2.5-flash", { inputUsdMicrosPerMillion: 2_000_000, outputUsdMicrosPerMillion: 2_000_000 }],
        ["deepseek/deepseek-v4-pro", { inputUsdMicrosPerMillion: 100_000, outputUsdMicrosPerMillion: 100_000 }],
      ]),
    );

    renderBanner();
    await screen.findByText("Cheaper models are available");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Not now" }));

    expect(screen.queryByText("Cheaper models are available")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("bookforge:price-advisory-snoozed-until")).not.toBeNull();

    cleanup();
    getUser.mockClear();
    renderBanner();
    expect(getUser).not.toHaveBeenCalled();
  });
});
