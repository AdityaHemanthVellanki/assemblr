import type { OrgEvent } from "../events/event-schema";
import type { EventGraph, EventGraphNode, EventGraphEdge } from "./event-graph";

/**
 * Time windows for edge creation (milliseconds).
 */
const TEMPORAL_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const SAME_ACTOR_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours
const SAME_ENTITY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const CAUSAL_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Maximum edges per node to prevent graph explosion on dense event clusters.
 */
const MAX_EDGES_PER_NODE = 20;

/**
 * Build an organizational event graph from normalized events.
 *
 * Algorithm (deterministic, no LLM):
 *  1. Sort events by timestamp
 *  2. Create nodes from events
 *  3. Build indexes (actor, entity, eventType)
 *  4. Create edges based on temporal proximity, shared actors, shared entities
 *  5. "Causal" edges for events sharing both actor AND entity
 */
export function buildEventGraph(events: OrgEvent[]): EventGraph {
  if (events.length === 0) {
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

  // 1. Sort events by timestamp
  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  // 2. Create nodes
  const nodes: EventGraphNode[] = sorted.map((e) => ({
    eventId: e.id,
    source: e.source,
    eventType: e.eventType,
    actorId: e.actorId,
    entityType: e.entityType,
    entityId: e.entityId,
    timestamp: e.timestamp,
  }));

  // 3. Build indexes
  const actorIndex: Record<string, string[]> = {};
  const entityIndex: Record<string, string[]> = {};
  const eventTypeIndex: Record<string, string[]> = {};
  const timestampMap = new Map<string, number>(); // eventId → epoch ms

  for (const node of nodes) {
    // Actor index
    if (!actorIndex[node.actorId]) actorIndex[node.actorId] = [];
    actorIndex[node.actorId].push(node.eventId);

    // Entity index
    if (!entityIndex[node.entityId]) entityIndex[node.entityId] = [];
    entityIndex[node.entityId].push(node.eventId);

    // Event type index
    if (!eventTypeIndex[node.eventType]) eventTypeIndex[node.eventType] = [];
    eventTypeIndex[node.eventType].push(node.eventId);

    // Timestamp lookup
    timestampMap.set(node.eventId, new Date(node.timestamp).getTime());
  }

  // 4. Create edges
  const edges: EventGraphEdge[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.eventId, n]));
  const edgeCounts = new Map<string, number>(); // eventId → outgoing edge count

  // Helper: add an edge if under the per-node cap
  function addEdge(edge: EventGraphEdge) {
    const fromCount = edgeCounts.get(edge.from) || 0;
    const toCount = edgeCounts.get(edge.to) || 0;
    if (fromCount >= MAX_EDGES_PER_NODE || toCount >= MAX_EDGES_PER_NODE) return;
    edges.push(edge);
    edgeCounts.set(edge.from, fromCount + 1);
    edgeCounts.set(edge.to, toCount + 1);
  }

  // 4a. Same-actor edges (events by same actor within window)
  for (const [actorId, eventIds] of Object.entries(actorIndex)) {
    if (actorId === "unknown" || actorId === "system") continue;
    for (let i = 0; i < eventIds.length; i++) {
      const fromTime = timestampMap.get(eventIds[i])!;
      const fromNode = nodeMap.get(eventIds[i])!;
      for (let j = i + 1; j < eventIds.length; j++) {
        const toTime = timestampMap.get(eventIds[j])!;
        const deltaMs = toTime - fromTime;
        if (deltaMs > SAME_ACTOR_WINDOW_MS) break; // sorted, no more within window
        if (deltaMs <= 0) continue;

        const toNode = nodeMap.get(eventIds[j])!;

        // Check if this is also a same-entity edge (causal)
        if (fromNode.entityId === toNode.entityId && deltaMs <= CAUSAL_WINDOW_MS) {
          addEdge({
            from: eventIds[i],
            to: eventIds[j],
            relation: "causal",
            weight: 1 - deltaMs / CAUSAL_WINDOW_MS,
            timeDeltaMs: deltaMs,
          });
        } else {
          addEdge({
            from: eventIds[i],
            to: eventIds[j],
            relation: "same_actor",
            weight: 1 - deltaMs / SAME_ACTOR_WINDOW_MS,
            timeDeltaMs: deltaMs,
          });
        }
      }
    }
  }

  // 4b. Same-entity edges (events on same entity within window, different actors)
  for (const [entityId, eventIds] of Object.entries(entityIndex)) {
    if (eventIds.length < 2) continue;
    for (let i = 0; i < eventIds.length; i++) {
      const fromTime = timestampMap.get(eventIds[i])!;
      const fromNode = nodeMap.get(eventIds[i])!;
      for (let j = i + 1; j < eventIds.length; j++) {
        const toTime = timestampMap.get(eventIds[j])!;
        const deltaMs = toTime - fromTime;
        if (deltaMs > SAME_ENTITY_WINDOW_MS) break;
        if (deltaMs <= 0) continue;

        const toNode = nodeMap.get(eventIds[j])!;
        // Skip if same actor (already handled above as same_actor or causal)
        if (fromNode.actorId === toNode.actorId) continue;

        addEdge({
          from: eventIds[i],
          to: eventIds[j],
          relation: "same_entity",
          weight: 1 - deltaMs / SAME_ENTITY_WINDOW_MS,
          timeDeltaMs: deltaMs,
        });
      }
    }
  }

  // 4c. Temporal edges (any events within narrow time window, across integrations)
  for (let i = 0; i < nodes.length; i++) {
    const fromTime = timestampMap.get(nodes[i].eventId)!;
    for (let j = i + 1; j < nodes.length; j++) {
      const toTime = timestampMap.get(nodes[j].eventId)!;
      const deltaMs = toTime - fromTime;
      if (deltaMs > TEMPORAL_WINDOW_MS) break;
      if (deltaMs <= 0) continue;

      // Only create temporal edges between DIFFERENT integrations
      // (same-integration edges are better captured by actor/entity)
      if (nodes[i].source === nodes[j].source) continue;

      // Skip if already connected by actor or entity edge
      const fromNode = nodes[i];
      const toNode = nodes[j];
      if (fromNode.actorId === toNode.actorId) continue;
      if (fromNode.entityId === toNode.entityId) continue;

      addEdge({
        from: nodes[i].eventId,
        to: nodes[j].eventId,
        relation: "temporal",
        weight: 1 - deltaMs / TEMPORAL_WINDOW_MS,
        timeDeltaMs: deltaMs,
      });
    }
  }

  // 5. Compute stats
  let crossSystemEdges = 0;
  for (const edge of edges) {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    if (fromNode && toNode && fromNode.source !== toNode.source) {
      crossSystemEdges++;
    }
  }

  const stats = {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    uniqueActors: Object.keys(actorIndex).length,
    uniqueEntities: Object.keys(entityIndex).length,
    uniqueEventTypes: Object.keys(eventTypeIndex).length,
    crossSystemEdges,
  };

  console.log(
    `[EventGraph] Built graph: ${stats.nodeCount} nodes, ${stats.edgeCount} edges, ` +
    `${stats.crossSystemEdges} cross-system, ${stats.uniqueActors} actors, ` +
    `${stats.uniqueEventTypes} event types`,
  );

  return {
    nodes,
    edges,
    actorIndex,
    entityIndex,
    eventTypeIndex,
    stats,
  };
}
