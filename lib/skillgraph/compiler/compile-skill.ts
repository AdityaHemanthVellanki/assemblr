import type { MinedPattern } from "../mining/mining-types";
import type { SkillGraph, SkillNode, SkillEdge } from "./skill-schema";
import type { IntegrationId } from "@/lib/toolos/spec";

/**
 * Compile a MinedPattern into a SkillGraph DAG.
 *
 * Mapping:
 *  - Anchor event → trigger node
 *  - Each sequence step → action node (or conditional branch if optional)
 *  - Edges connect nodes in sequence order with avgDelayMs
 *  - Optional steps get conditional edges
 */
export function compilePatternToSkill(pattern: MinedPattern): SkillGraph {
  const nodes: SkillNode[] = [];
  const edges: SkillEdge[] = [];

  // 1. Trigger node (from anchor event)
  const triggerId = "trigger_0";
  nodes.push({
    id: triggerId,
    type: "trigger",
    eventType: pattern.anchorEvent,
    source: pattern.anchorSource,
    description: `Trigger: ${formatEventType(pattern.anchorEvent)}`,
    config: {},
    optional: false,
  });

  // 2. Sequence step nodes
  let prevNodeId = triggerId;
  for (let i = 0; i < pattern.sequence.length; i++) {
    const step = pattern.sequence[i];
    const nodeId = `step_${i + 1}`;

    // If there's a significant delay, insert a wait node
    if (step.avgDelayMs > 60_000 && i > 0) {
      const waitId = `wait_${i}`;
      nodes.push({
        id: waitId,
        type: "wait",
        description: `Wait ~${formatDuration(step.avgDelayMs)}`,
        config: { waitMs: step.avgDelayMs },
        optional: false,
      });
      edges.push({
        from: prevNodeId,
        to: waitId,
        avgDelayMs: 0,
      });
      prevNodeId = waitId;
    }

    // Action node
    nodes.push({
      id: nodeId,
      type: "action",
      eventType: step.eventType,
      source: step.source,
      description: `${formatEventType(step.eventType)} (${step.source})`,
      config: {},
      optional: step.optional,
    });

    // Edge from previous node
    if (step.optional) {
      // Optional steps get a conditional edge
      edges.push({
        from: prevNodeId,
        to: nodeId,
        condition: `optional_${i + 1}`,
        avgDelayMs: step.avgDelayMs,
      });

      // Also add a skip edge to the next non-optional node (if any)
      const nextNonOptional = pattern.sequence.findIndex(
        (s, j) => j > i && !s.optional,
      );
      if (nextNonOptional !== -1) {
        edges.push({
          from: prevNodeId,
          to: `step_${nextNonOptional + 1}`,
          condition: `skip_optional_${i + 1}`,
          avgDelayMs: pattern.sequence[nextNonOptional].avgDelayMs,
        });
      }
    } else {
      edges.push({
        from: prevNodeId,
        to: nodeId,
        avgDelayMs: step.avgDelayMs,
      });
    }

    prevNodeId = nodeId;
  }

  // Collect all unique integrations
  const integrations = new Set<string>([pattern.anchorSource]);
  for (const step of pattern.sequence) {
    integrations.add(step.source);
  }

  // Build description
  const description = generateDescription(pattern);

  return {
    id: `skill_${pattern.id}`,
    name: pattern.name,
    description,
    version: 1,
    trigger: {
      eventType: pattern.anchorEvent,
      source: pattern.anchorSource,
      condition: {},
    },
    nodes,
    edges,
    metadata: {
      frequency: pattern.frequency,
      confidence: pattern.confidence,
      entropy: pattern.entropy,
      crossSystem: pattern.crossSystem,
      actorCount: pattern.actors.length,
      sourcePattern: pattern.id,
      integrations: [...integrations],
    },
    status: "compiled",
    compiledAt: new Date().toISOString(),
  };
}

/**
 * Compile all mined patterns into skill graphs.
 * Only compiles patterns above the given confidence threshold.
 */
export function compileAllPatterns(
  patterns: MinedPattern[],
  minConfidence: number = 0.3,
): SkillGraph[] {
  return patterns
    .filter((p) => p.confidence >= minConfidence)
    .map(compilePatternToSkill);
}

function formatEventType(eventType: string): string {
  return eventType
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function generateDescription(pattern: MinedPattern): string {
  const steps = [
    formatEventType(pattern.anchorEvent),
    ...pattern.sequence.map(
      (s) => `${formatEventType(s.eventType)} (${s.source})`,
    ),
  ];

  const crossLabel = pattern.crossSystem
    ? " across multiple systems"
    : "";
  const actorLabel =
    pattern.actors.length > 1
      ? ` by ${pattern.actors.length} team members`
      : "";

  return (
    `Recurring workflow${crossLabel}: ` +
    steps.join(" → ") +
    `. Observed ${pattern.frequency} times${actorLabel}` +
    ` with ${Math.round(pattern.confidence * 100)}% confidence.`
  );
}
