import { z } from "zod";
import { IntegrationIdSchema } from "@/lib/toolos/spec";

/**
 * Skill Graph Schema — compiled behavioral patterns as versioned DAGs.
 *
 * Extends the existing WorkflowSpec pattern (nodes + edges) with:
 * - Typed trigger nodes
 * - Integration-aware action nodes
 * - Mining metadata (frequency, confidence, entropy)
 * - Version tracking
 */

export const SkillNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["trigger", "action", "condition", "transform", "wait", "notify"]),
  /** For trigger/action nodes: the canonical event type */
  eventType: z.string().optional(),
  /** Source integration */
  source: IntegrationIdSchema.optional(),
  /** Human-readable description */
  description: z.string(),
  /** Node-specific configuration */
  config: z.record(z.string(), z.any()).default({}),
  /** Whether this step is optional (observed in <80% of instances) */
  optional: z.boolean().default(false),
});

export type SkillNode = z.infer<typeof SkillNodeSchema>;

export const SkillEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  /** JS expression or "default" for unconditional */
  condition: z.string().optional(),
  /** Expected delay between these steps (ms) */
  avgDelayMs: z.number().optional(),
});

export type SkillEdge = z.infer<typeof SkillEdgeSchema>;

export const SkillMetadataSchema = z.object({
  /** How many times the underlying pattern was observed */
  frequency: z.number(),
  /** Confidence score (0-1) */
  confidence: z.number(),
  /** Entropy (low = more deterministic) */
  entropy: z.number(),
  /** Whether this skill spans multiple integrations */
  crossSystem: z.boolean(),
  /** Number of distinct actors who exhibit this pattern */
  actorCount: z.number(),
  /** Reference to the source MinedPattern.id */
  sourcePattern: z.string(),
  /** Integrations involved */
  integrations: z.array(z.string()),
});

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;

export const SkillGraphSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.number().default(1),
  trigger: z.object({
    eventType: z.string(),
    source: IntegrationIdSchema,
    condition: z.record(z.string(), z.any()).default({}),
  }),
  nodes: z.array(SkillNodeSchema),
  edges: z.array(SkillEdgeSchema),
  metadata: SkillMetadataSchema,
  status: z.enum(["draft", "compiled", "active", "archived"]).default("draft"),
  compiledAt: z.string().optional(),
});

export type SkillGraph = z.infer<typeof SkillGraphSchema>;
