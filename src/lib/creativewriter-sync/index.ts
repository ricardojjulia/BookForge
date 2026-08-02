import { z } from "zod";

export const creativeWriterSyncEntityTypeSchema = z.enum([
  "book",
  "chapter",
  "scene",
  "paragraph",
  "note",
  "research",
  "bible",
  "metadata",
  "revision",
  "comment",
]);
export type CreativeWriterSyncEntityType = z.infer<typeof creativeWriterSyncEntityTypeSchema>;

export const creativeWriterSyncOperationSchema = z.enum([
  "create",
  "update",
  "delete",
  "reorder",
  "accept_revision",
  "reject_revision",
  "metadata_update",
]);
export type CreativeWriterSyncOperation = z.infer<typeof creativeWriterSyncOperationSchema>;

export const creativeWriterEntityVersionSchema = z.object({
  entityType: creativeWriterSyncEntityTypeSchema,
  entityId: z.string().min(1),
  version: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
});
export type CreativeWriterEntityVersion = z.infer<typeof creativeWriterEntityVersionSchema>;

export const creativeWriterLinkedProjectSchema = z.object({
  localProjectId: z.string().min(1),
  accountId: z.string().min(1),
  bookforgeBookId: z.string().min(1),
  syncCursor: z.string().optional(),
  lastCloudVersion: z.number().int().nonnegative().optional(),
  linkedAt: z.string().min(1),
});
export type CreativeWriterLinkedProject = z.infer<typeof creativeWriterLinkedProjectSchema>;

export const creativeWriterLocalChangeSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  entityType: creativeWriterSyncEntityTypeSchema,
  entityId: z.string().min(1),
  operation: creativeWriterSyncOperationSchema,
  payload: z.record(z.string(), z.unknown()),
  baseVersion: z.number().int().nonnegative(),
  localVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
  createdAt: z.string().min(1),
});
export type CreativeWriterLocalChange = z.infer<typeof creativeWriterLocalChangeSchema>;

export const creativeWriterCloudChangeSchema = z.object({
  entityType: creativeWriterSyncEntityTypeSchema,
  entityId: z.string().min(1),
  operation: creativeWriterSyncOperationSchema,
  payload: z.record(z.string(), z.unknown()),
  cloudVersion: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
});
export type CreativeWriterCloudChange = z.infer<typeof creativeWriterCloudChangeSchema>;

export const creativeWriterConflictSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  entityType: creativeWriterSyncEntityTypeSchema,
  entityId: z.string().min(1),
  conflictType: z.enum(["content", "metadata", "order", "delete_update", "revision_state"]),
  baseVersion: z.number().int().nonnegative(),
  localPayload: z.record(z.string(), z.unknown()),
  cloudPayload: z.record(z.string(), z.unknown()),
  resolutionStatus: z.enum(["unresolved", "resolved_local", "resolved_cloud", "resolved_manual"]),
  createdAt: z.string().min(1),
});
export type CreativeWriterConflict = z.infer<typeof creativeWriterConflictSchema>;

export const creativeWriterSyncPullResponseSchema = z.object({
  project: creativeWriterLinkedProjectSchema,
  syncCursor: z.string(),
  cloudVersion: z.number().int().nonnegative(),
  changes: z.array(creativeWriterCloudChangeSchema),
  conflicts: z.array(creativeWriterConflictSchema).default([]),
});
export type CreativeWriterSyncPullResponse = z.infer<typeof creativeWriterSyncPullResponseSchema>;

export const creativeWriterSyncPushRequestSchema = z.object({
  project: creativeWriterLinkedProjectSchema,
  baseSyncCursor: z.string().optional(),
  changes: z.array(creativeWriterLocalChangeSchema),
});
export type CreativeWriterSyncPushRequest = z.infer<typeof creativeWriterSyncPushRequestSchema>;

export const creativeWriterSyncPushResponseSchema = z.object({
  project: creativeWriterLinkedProjectSchema,
  syncCursor: z.string(),
  cloudVersion: z.number().int().nonnegative(),
  appliedChanges: z.array(z.string()),
  conflicts: z.array(creativeWriterConflictSchema).default([]),
  rejectedChanges: z
    .array(
      z.object({
        changeId: z.string().min(1),
        reason: z.string().min(1),
      }),
    )
    .default([]),
});
export type CreativeWriterSyncPushResponse = z.infer<typeof creativeWriterSyncPushResponseSchema>;

export const creativeWriterConflictResolutionSchema = z.object({
  project: creativeWriterLinkedProjectSchema,
  conflictId: z.string().min(1),
  resolution: z.enum(["resolved_local", "resolved_cloud", "resolved_manual"]),
  resolvedPayload: z.record(z.string(), z.unknown()).optional(),
  note: z.string().max(2000).optional(),
});
export type CreativeWriterConflictResolutionRequest = z.infer<typeof creativeWriterConflictResolutionSchema>;

export const creativeWriterConflictResolutionResponseSchema = z.object({
  conflictId: z.string().min(1),
  resolutionStatus: z.enum(["resolved_local", "resolved_cloud", "resolved_manual"]),
  cloudVersion: z.number().int().nonnegative(),
  syncCursor: z.string(),
});
export type CreativeWriterConflictResolutionResponse = z.infer<typeof creativeWriterConflictResolutionResponseSchema>;

export function detectCreativeWriterConflict(input: {
  localBaseVersion: number;
  cloudVersion: number;
  localDirty: boolean;
  cloudChanged: boolean;
}): boolean {
  return input.localDirty && input.cloudChanged && input.cloudVersion > input.localBaseVersion;
}

export function createCreativeWriterSyncCursor(input: { bookId: string; cloudVersion: number }): string {
  return `book:${input.bookId}:version:${input.cloudVersion}`;
}
