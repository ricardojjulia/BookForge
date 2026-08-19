export type DeploymentMode = "self_hosted" | "managed_saas";

export function getDeploymentMode(): DeploymentMode {
  return process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === "managed_saas" ? "managed_saas" : "self_hosted";
}

export function isManagedSaasDeployment() {
  return getDeploymentMode() === "managed_saas";
}
