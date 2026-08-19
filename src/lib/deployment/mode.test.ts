import { afterEach, describe, expect, it } from "vitest";
import { getDeploymentMode, isManagedSaasDeployment } from "@/lib/deployment/mode";

describe("deployment mode", () => {
  const original = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
    else process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = original;
  });

  it("defaults to self_hosted when unset", () => {
    delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
    expect(getDeploymentMode()).toBe("self_hosted");
    expect(isManagedSaasDeployment()).toBe(false);
  });

  it("treats any non-managed_saas value as self_hosted", () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "something_else";
    expect(getDeploymentMode()).toBe("self_hosted");
    expect(isManagedSaasDeployment()).toBe(false);
  });

  it("recognizes managed_saas", () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "managed_saas";
    expect(getDeploymentMode()).toBe("managed_saas");
    expect(isManagedSaasDeployment()).toBe(true);
  });
});
