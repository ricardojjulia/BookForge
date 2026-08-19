import { afterEach, describe, expect, it } from "vitest";
import { creativeWriterAccessDenied } from "@/lib/creativewriter-ui/access";

describe("creativeWriterAccessDenied", () => {
  const original = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
    else process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = original;
  });

  it("allows access when self-hosted (default)", () => {
    delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
    expect(creativeWriterAccessDenied()).toBeNull();
  });

  it("denies access with a message in managed_saas mode", () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "managed_saas";
    expect(creativeWriterAccessDenied()).toBe("CreativeWriter isn't available on this plan yet.");
  });
});
