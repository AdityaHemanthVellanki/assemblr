import { z } from "zod";
import { IntegrationIdSchema } from "@/lib/toolos/spec";

/**
 * Universal Event Model — canonical schema for all organizational events.
 *
 * Every external integration event (GitHub commit, Slack message, Linear issue, etc.)
 * is normalized into this shape before entering the event graph and mining pipeline.
 */
export const OrgEventSchema = z.object({
  /** Unique event ID (deterministic: `${source}:${eventType}:${entityId}:${timestamp}`) */
  id: z.string(),
  /** Organization that owns this event */
  orgId: z.string(),
  /** Integration source */
  source: IntegrationIdSchema,
  /** Canonical event type: `<noun>.<verb>` (e.g., "commit.created", "message.sent") */
  eventType: z.string(),
  /** Normalized actor identifier (email or integration-specific user ID) */
  actorId: z.string(),
  /** Human-readable actor name */
  actorName: z.string().optional(),
  /** Entity type being acted upon (e.g., "repo", "channel", "issue", "deal") */
  entityType: z.string(),
  /** External entity ID from the source system */
  entityId: z.string(),
  /** Human-readable entity name */
  entityName: z.string().optional(),
  /** When the event occurred (ISO 8601) */
  timestamp: z.string().datetime(),
  /** Source-specific metadata (varies by integration) */
  metadata: z.record(z.string(), z.any()).default({}),
  /** IDs of related entities (e.g., a PR links to an issue) */
  relatedEntityIds: z.array(z.string()).default([]),
});

export type OrgEvent = z.infer<typeof OrgEventSchema>;

/**
 * Generate a deterministic event ID from its components.
 * This ensures deduplication across multiple ingestion runs.
 */
export function makeEventId(
  source: string,
  eventType: string,
  entityId: string,
  timestamp: string,
): string {
  return `${source}:${eventType}:${entityId}:${timestamp}`;
}

/**
 * Workspace spec shape stored in Project.spec JSONB.
 */
export const SkillGraphWorkspaceSchema = z.object({
  type: z.literal("skill_graph_workspace"),
  events: z.array(OrgEventSchema).default([]),
  eventGraph: z.any().optional(),
  minedPatterns: z.array(z.any()).default([]),
  compiledSkills: z.array(z.any()).default([]),
  ingestionState: z
    .object({
      lastSync: z.record(z.string(), z.string()).default({}),
      status: z.record(z.string(), z.enum(["idle", "syncing", "done", "error"])).default({}),
      totalEvents: z.number().default(0),
      errors: z.record(z.string(), z.string()).default({}),
    })
    .default({
      lastSync: {},
      status: {},
      totalEvents: 0,
      errors: {},
    }),
});

export type SkillGraphWorkspace = z.infer<typeof SkillGraphWorkspaceSchema>;

export function createEmptyWorkspace(): SkillGraphWorkspace {
  return {
    type: "skill_graph_workspace",
    events: [],
    minedPatterns: [],
    compiledSkills: [],
    ingestionState: {
      lastSync: {},
      status: {},
      totalEvents: 0,
      errors: {},
    },
  };
}
