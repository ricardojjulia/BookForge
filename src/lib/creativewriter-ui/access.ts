import { isManagedSaasDeployment } from "@/lib/deployment/mode";

/**
 * CreativeWriter's writing desk (editing, sync, import/export) is available
 * identically in every deployment. Only its collaboration surfaces -- reader
 * comment triage and contributor suggestion/assignment review -- are a
 * managed-SaaS companion capability. There's no per-user entitlement system
 * yet, so this is deployment-wide for now; it's the seam a future real
 * per-user check plugs into later.
 */
export function isCreativeWriterCollaborationEnabled() {
  return isManagedSaasDeployment();
}
