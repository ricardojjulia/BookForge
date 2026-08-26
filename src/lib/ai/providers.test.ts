import { afterEach, describe, expect, it, vi } from "vitest";
import { assertIsOpenRouterManagementKey, assertNotOpenRouterManagementKey } from "@/lib/ai/providers";

function mockKeyResponse(body: unknown, ok = true) {
  return { ok, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}

describe("assertNotOpenRouterManagementKey (self-hosted path -- rejects a management key)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws when the key is a management/provisioning key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockKeyResponse({ data: { is_management_key: true } })));
    await expect(assertNotOpenRouterManagementKey("sk-mgmt")).rejects.toThrow(/Management\/Provisioning key/);
  });

  it("resolves for a regular key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockKeyResponse({ data: { is_management_key: false } })));
    await expect(assertNotOpenRouterManagementKey("sk-or-v1-regular")).resolves.toBeUndefined();
  });

  it("resolves on a network hiccup (lets the caller's own connection check surface it)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(assertNotOpenRouterManagementKey("sk-anything")).resolves.toBeUndefined();
  });
});

describe("assertIsOpenRouterManagementKey (managed-SaaS onboarding path -- requires a management key)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves when the key is a management/provisioning key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockKeyResponse({ data: { is_management_key: true } })));
    await expect(assertIsOpenRouterManagementKey("sk-mgmt")).resolves.toBeUndefined();
  });

  it("recognizes is_provisioning_key as equivalent to is_management_key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockKeyResponse({ data: { is_provisioning_key: true } })));
    await expect(assertIsOpenRouterManagementKey("sk-mgmt")).resolves.toBeUndefined();
  });

  it("throws when the key is a regular (non-management) key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockKeyResponse({ data: { is_management_key: false } })));
    await expect(assertIsOpenRouterManagementKey("sk-or-v1-regular")).rejects.toThrow(/doesn't look like an OpenRouter Management/);
  });

  it("resolves on a network hiccup (lets the caller's own connection check surface it)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(assertIsOpenRouterManagementKey("sk-anything")).resolves.toBeUndefined();
  });

  it("resolves on an invalid/expired key (caller's own check's job to report)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockKeyResponse({}, false)));
    await expect(assertIsOpenRouterManagementKey("sk-invalid")).resolves.toBeUndefined();
  });
});
