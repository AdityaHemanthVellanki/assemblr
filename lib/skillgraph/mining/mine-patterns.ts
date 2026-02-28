import type { EventGraph } from "../graph/event-graph";
import type {
  EventSequence,
  MinedPattern,
  MiningConfig,
} from "./mining-types";
import { DEFAULT_MINING_CONFIG } from "./mining-types";
import type { IntegrationId } from "@/lib/toolos/spec";

/**
 * Structural Sequence Mining — deterministic, no LLM.
 *
 * Algorithm:
 *  1. Extract sequences: walk the graph from high-out-degree anchor events
 *  2. Normalize: replace entity IDs with types, create canonical event chains
 *  3. Cluster: group similar sequences by edit distance
 *  4. Compute statistics: frequency, confidence, entropy
 *  5. Filter: keep patterns above thresholds
 *  6. Label: auto-generate names
 */
export function minePatterns(
  graph: EventGraph,
  config: MiningConfig = DEFAULT_MINING_CONFIG,
): MinedPattern[] {
  if (graph.nodes.length === 0) return [];

  console.log(
    `[Mining] Starting pattern mining on ${graph.nodes.length} events, ${graph.edges.length} edges`,
  );

  // 1. Identify anchor event types (high out-degree in the graph)
  const outDegree = computeOutDegree(graph);
  const anchorTypes = identifyAnchors(graph, outDegree);

  console.log(`[Mining] Identified ${anchorTypes.length} anchor event types: ${anchorTypes.join(", ")}`);

  // 2. Extract sequences starting from each anchor type
  const allSequences: Array<{ anchor: string; anchorSource: IntegrationId; sequence: EventSequence }> = [];
  const nodeMap = new Map(graph.nodes.map((n) => [n.eventId, n]));
  const adjacency = buildAdjacencyList(graph);

  for (const anchorType of anchorTypes) {
    const anchorNodeIds = graph.eventTypeIndex[anchorType] || [];
    for (const anchorId of anchorNodeIds) {
      const anchorNode = nodeMap.get(anchorId);
      if (!anchorNode) continue;

      const seq = extractSequence(
        anchorId,
        anchorNode,
        nodeMap,
        adjacency,
        config.sequenceWindowMs,
        config.maxSequenceLength,
      );
      if (seq.events.length >= 2) {
        allSequences.push({
          anchor: anchorType,
          anchorSource: anchorNode.source as IntegrationId,
          sequence: seq,
        });
      }
    }
  }

  console.log(`[Mining] Extracted ${allSequences.length} raw sequences`);

  // 3. Group by anchor type and cluster
  const byAnchor = new Map<string, typeof allSequences>();
  for (const entry of allSequences) {
    const key = entry.anchor;
    if (!byAnchor.has(key)) byAnchor.set(key, []);
    byAnchor.get(key)!.push(entry);
  }

  const patterns: MinedPattern[] = [];
  let patternIndex = 0;

  for (const [anchorType, sequences] of byAnchor) {
    // Normalize sequences to canonical form (event type chains)
    const canonicalSeqs = sequences.map((s) => ({
      canonical: s.sequence.events.map((e) => `${e.source}:${e.eventType}`).join("→"),
      original: s,
    }));

    // Cluster by edit distance
    const clusters = clusterSequences(
      canonicalSeqs.map((s) => s.canonical),
      config.maxEditDistance,
    );

    for (const clusterIndices of clusters) {
      if (clusterIndices.length < config.minFrequency) continue;

      const clusterSeqs = clusterIndices.map((i) => canonicalSeqs[i]);
      const anchorSource = clusterSeqs[0].original.anchorSource;

      // Compute pattern statistics
      const pattern = computePatternStats(
        patternIndex++,
        anchorType,
        anchorSource,
        clusterSeqs.map((s) => s.original.sequence),
        sequences.length,
      );

      if (pattern.confidence >= config.minConfidence) {
        patterns.push(pattern);
      }
    }
  }

  // Sort by frequency (descending)
  patterns.sort((a, b) => b.frequency - a.frequency);

  console.log(
    `[Mining] Found ${patterns.length} patterns. ` +
    `Cross-system: ${patterns.filter((p) => p.crossSystem).length}`,
  );

  return patterns;
}

/**
 * Compute out-degree for each event (how many forward edges it has).
 */
function computeOutDegree(graph: EventGraph): Map<string, number> {
  const counts = new Map<string, number>();
  for (const edge of graph.edges) {
    counts.set(edge.from, (counts.get(edge.from) || 0) + 1);
  }
  return counts;
}

/**
 * Identify anchor event types — those with above-median out-degree
 * and that appear at least 3 times.
 */
function identifyAnchors(
  graph: EventGraph,
  outDegree: Map<string, number>,
): string[] {
  const nodeMap = new Map(graph.nodes.map((n) => [n.eventId, n]));
  const typeOutDegree = new Map<string, number>();
  const typeCounts = new Map<string, number>();

  for (const [eventId, degree] of outDegree) {
    const node = nodeMap.get(eventId);
    if (!node) continue;
    typeOutDegree.set(
      node.eventType,
      (typeOutDegree.get(node.eventType) || 0) + degree,
    );
    typeCounts.set(
      node.eventType,
      (typeCounts.get(node.eventType) || 0) + 1,
    );
  }

  // Filter: must appear at least 3 times
  const candidates = Array.from(typeCounts.entries())
    .filter(([, count]) => count >= 3)
    .map(([type]) => type);

  if (candidates.length === 0) {
    // Fall back to all event types with count >= 2
    return Array.from(typeCounts.entries())
      .filter(([, count]) => count >= 2)
      .map(([type]) => type);
  }

  // Sort by total out-degree (descending) and take top 50%
  candidates.sort(
    (a, b) => (typeOutDegree.get(b) || 0) - (typeOutDegree.get(a) || 0),
  );

  return candidates.slice(0, Math.max(1, Math.ceil(candidates.length * 0.5)));
}

/**
 * Build adjacency list (forward edges only) from graph.
 */
function buildAdjacencyList(
  graph: EventGraph,
): Map<string, Array<{ to: string; weight: number; timeDeltaMs: number }>> {
  const adj = new Map<
    string,
    Array<{ to: string; weight: number; timeDeltaMs: number }>
  >();
  for (const edge of graph.edges) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    adj.get(edge.from)!.push({
      to: edge.to,
      weight: edge.weight,
      timeDeltaMs: edge.timeDeltaMs,
    });
  }
  return adj;
}

/**
 * Extract a forward sequence from an anchor event, following highest-weight edges.
 */
function extractSequence(
  anchorId: string,
  anchorNode: { eventType: string; source: string; actorId: string; timestamp: string },
  nodeMap: Map<string, { eventId: string; source: string; eventType: string; actorId: string; timestamp: string }>,
  adjacency: Map<string, Array<{ to: string; weight: number; timeDeltaMs: number }>>,
  windowMs: number,
  maxLength: number,
): EventSequence {
  const events: Array<{ eventType: string; source: IntegrationId; relativeTimeMs: number }> = [
    { eventType: anchorNode.eventType, source: anchorNode.source as IntegrationId, relativeTimeMs: 0 },
  ];

  const visited = new Set<string>([anchorId]);
  let currentId = anchorId;
  const anchorTimeMs = new Date(anchorNode.timestamp).getTime();

  while (events.length < maxLength) {
    const neighbors = adjacency.get(currentId) || [];
    // Filter to unvisited, within window, sorted by weight
    const candidates = neighbors
      .filter((n) => !visited.has(n.to) && n.timeDeltaMs <= windowMs && n.timeDeltaMs > 0)
      .sort((a, b) => b.weight - a.weight);

    if (candidates.length === 0) break;

    const best = candidates[0];
    const nextNode = nodeMap.get(best.to);
    if (!nextNode) break;

    visited.add(best.to);
    const relativeTimeMs = new Date(nextNode.timestamp).getTime() - anchorTimeMs;

    events.push({
      eventType: nextNode.eventType,
      source: nextNode.source as IntegrationId,
      relativeTimeMs,
    });

    currentId = best.to;
  }

  const lastEvent = events[events.length - 1];
  return {
    events,
    actorId: anchorNode.actorId,
    startTime: anchorNode.timestamp,
    endTime: new Date(anchorTimeMs + lastEvent.relativeTimeMs).toISOString(),
  };
}

/**
 * Cluster sequences by edit distance on their canonical string forms.
 * Returns arrays of indices into the input array.
 */
function clusterSequences(
  canonicals: string[],
  maxEditDistance: number,
): number[][] {
  const assigned = new Set<number>();
  const clusters: number[][] = [];

  for (let i = 0; i < canonicals.length; i++) {
    if (assigned.has(i)) continue;

    const cluster = [i];
    assigned.add(i);

    for (let j = i + 1; j < canonicals.length; j++) {
      if (assigned.has(j)) continue;
      if (sequenceEditDistance(canonicals[i], canonicals[j]) <= maxEditDistance) {
        cluster.push(j);
        assigned.add(j);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

/**
 * Simple edit distance on "→"-delimited sequence strings.
 * Operates on tokens (event steps) rather than characters.
 */
function sequenceEditDistance(a: string, b: string): number {
  const tokensA = a.split("→");
  const tokensB = b.split("→");
  const m = tokensA.length;
  const n = tokensB.length;

  // Short-circuit for identical or very different lengths
  if (a === b) return 0;
  if (Math.abs(m - n) > 3) return Math.abs(m - n);

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = tokensA[i - 1] === tokensB[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[m][n];
}

/**
 * Compute pattern statistics from a cluster of sequences.
 */
function computePatternStats(
  index: number,
  anchorEvent: string,
  anchorSource: IntegrationId,
  sequences: EventSequence[],
  totalAnchorOccurrences: number,
): MinedPattern {
  const frequency = sequences.length;
  const confidence = totalAnchorOccurrences > 0
    ? frequency / totalAnchorOccurrences
    : 0;

  // Build the "canonical" sequence from the most common events at each position
  const maxLen = Math.max(...sequences.map((s) => s.events.length));
  const stepBuckets: Array<
    Map<string, { delays: number[]; source: IntegrationId }>
  > = [];

  for (let pos = 1; pos < maxLen; pos++) {
    // Skip position 0 (anchor)
    const bucket = new Map<string, { delays: number[]; source: IntegrationId }>();
    for (const seq of sequences) {
      if (pos >= seq.events.length) continue;
      const step = seq.events[pos];
      const key = `${step.source}:${step.eventType}`;
      if (!bucket.has(key)) {
        bucket.set(key, { delays: [], source: step.source });
      }
      bucket.get(key)!.delays.push(step.relativeTimeMs);
    }
    stepBuckets.push(bucket);
  }

  // Build sequence steps from most frequent event at each position
  const patternSequence: MinedPattern["sequence"] = [];
  const sources = new Set<string>([anchorSource]);

  for (const bucket of stepBuckets) {
    if (bucket.size === 0) continue;
    // Pick the most common event type at this position
    let bestKey = "";
    let bestCount = 0;
    for (const [key, data] of bucket) {
      if (data.delays.length > bestCount) {
        bestCount = data.delays.length;
        bestKey = key;
      }
    }

    const data = bucket.get(bestKey)!;
    const [source, ...eventTypeParts] = bestKey.split(":");
    const eventType = eventTypeParts.join(":");
    const avgDelay = data.delays.reduce((a, b) => a + b, 0) / data.delays.length;
    const stdDev = Math.sqrt(
      data.delays.reduce((sum, d) => sum + (d - avgDelay) ** 2, 0) /
        Math.max(1, data.delays.length - 1),
    );

    sources.add(source);
    patternSequence.push({
      eventType,
      source: source as IntegrationId,
      avgDelayMs: Math.round(avgDelay),
      stdDevMs: Math.round(stdDev),
      optional: bestCount < frequency * 0.8,
    });
  }

  // Entropy: average normalized std deviation across steps
  const entropy =
    patternSequence.length > 0
      ? patternSequence.reduce((sum, step) => {
          const norm = step.avgDelayMs > 0 ? step.stdDevMs / step.avgDelayMs : 0;
          return sum + norm;
        }, 0) / patternSequence.length
      : 0;

  // Generate name from the sequence
  const name = generatePatternName(anchorEvent, patternSequence);

  return {
    id: `pattern_${index}`,
    name,
    anchorEvent,
    anchorSource,
    sequence: patternSequence,
    frequency,
    actors: [...new Set(sequences.map((s) => s.actorId))],
    confidence: Math.round(confidence * 100) / 100,
    entropy: Math.round(entropy * 100) / 100,
    crossSystem: sources.size > 1,
    instances: sequences,
  };
}

/**
 * Generate a human-readable pattern name from event types.
 */
function generatePatternName(
  anchor: string,
  steps: Array<{ eventType: string; source: IntegrationId }>,
): string {
  const parts = [formatEventType(anchor)];
  for (const step of steps.slice(0, 3)) {
    parts.push(formatEventType(step.eventType));
  }
  if (steps.length > 3) parts.push(`+${steps.length - 3} more`);
  return parts.join(" → ");
}

function formatEventType(eventType: string): string {
  return eventType
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
