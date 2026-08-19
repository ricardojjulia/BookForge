import { isManagedSaasDeployment } from "@/lib/deployment/mode";

/**
 * Returns a denial reason if CreativeWriter isn't available in the current
 * deployment, or null if access is allowed. Framework-agnostic on purpose:
 * a Server Component page can't return a NextResponse, so callers decide how
 * to surface the denial (render an Alert, or wrap it in a 403 JSON response).
 *
 * There's no per-user entitlement system yet, so managed-SaaS deployments
 * disable CreativeWriter outright rather than silently opening it to every
 * signed-in account. Self-hosted (the default) is unaffected.
 */
export function creativeWriterAccessDenied(): string | null {
  if (isManagedSaasDeployment()) {
    return "CreativeWriter isn't available on this plan yet.";
  }
  return null;
}
