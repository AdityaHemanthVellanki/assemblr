import { z } from "zod";
import type { IntegrationId } from "@/lib/toolos/spec";

/**
 * Organizational Event Graph types.
 *
 * A temporal graph where:
 * - Nodes = organizational events (from the Universal Event Model)
 * - Edges = relationships between events (temporal, same actor, same entity, causal)
 */

export type EventGraphNode = {
  eventId: string;
  source: IntegrationId;
  eventType: string;
  actorId: string;
  entityType: string;
  entityId: string;
  timestamp: string;
};

export type EdgeRelation = "temporal" | "same_actor" | "same_entity" | "causal";

export type EventGraphEdge = {
  from: string; // eventId
  to: string; // eventId
  relation: EdgeRelation;
  weight: number; // 0-1 strength (closer in time = higher)
  timeDeltaMs: number;
};

export type EventGraph = {
  nodes: EventGraphNode[];
  edges: EventGraphEdge[];
  /** Index: actorId → eventIds (for fast actor-based traversal) */
  actorIndex: Record<string, string[]>;
  /** Index: entityId → eventIds (for fast entity-based traversal) */
  entityIndex: Record<string, string[]>;
  /** Index: eventType → eventIds */
  eventTypeIndex: Record<string, string[]>;
  /** Statistics */
  stats: {
    nodeCount: number;
    edgeCount: number;
    uniqueActors: number;
    uniqueEntities: number;
    uniqueEventTypes: number;
    crossSystemEdges: number;
  };
};

/** Zod schema for serialization/validation */
export const EventGraphSchema = z.object({
  nodes: z.array(
    z.object({
      eventId: z.string(),
      source: z.string(),
      eventType: z.string(),
      actorId: z.string(),
      entityType: z.string(),
      entityId: z.string(),
      timestamp: z.string(),
    }),
  ),
  edges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      relation: z.enum(["temporal", "same_actor", "same_entity", "causal"]),
      weight: z.number(),
      timeDeltaMs: z.number(),
    }),
  ),
  actorIndex: z.record(z.string(), z.array(z.string())),
  entityIndex: z.record(z.string(), z.array(z.string())),
  eventTypeIndex: z.record(z.string(), z.array(z.string())),
  stats: z.object({
    nodeCount: z.number(),
    edgeCount: z.number(),
    uniqueActors: z.number(),
    uniqueEntities: z.number(),
    uniqueEventTypes: z.number(),
    crossSystemEdges: z.number(),
  }),
});

export function createEmptyEventGraph(): EventGraph {
  return {
    nodes: [],
    edges: [],
    actorIndex: {},
    entityIndex: {},
    eventTypeIndex: {},
    stats: {
      nodeCount: 0,
      edgeCount: 0,
      uniqueActors: 0,
      uniqueEntities: 0,
      uniqueEventTypes: 0,
      crossSystemEdges: 0,
    },
  };
}
