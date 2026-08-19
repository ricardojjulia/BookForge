import { afterEach, describe, expect, it } from "vitest";
import { isCreativeWriterCollaborationEnabled } from "@/lib/creativewriter-ui/access";

describe("isCreativeWriterCollaborationEnabled", () => {
  const original = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
    else process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = original;
  });

  it("is disabled when self-hosted (default)", () => {
    delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
    expect(isCreativeWriterCollaborationEnabled()).toBe(false);
  });

  it("is enabled in managed_saas mode", () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "managed_saas";
    expect(isCreativeWriterCollaborationEnabled()).toBe(true);
  });
});
