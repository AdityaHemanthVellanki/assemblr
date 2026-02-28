import type { SkillGraphWorkspace } from "../events/event-schema";
import { buildEventGraph } from "../graph/build-graph";
import { minePatterns } from "./mine-patterns";
import { DEFAULT_MINING_CONFIG, type MiningConfig } from "./mining-types";

export type MiningStage =
  | "build_graph"
  | "mine_patterns"
  | "complete";

export type MiningProgress = {
  stage: MiningStage;
  status: "running" | "done" | "error";
  message: string;
  patternCount?: number;
  crossSystemCount?: number;
};

export type OnMiningProgress = (progress: MiningProgress) => void;

/**
 * Mining Pipeline — orchestrates event graph construction + pattern mining.
 *
 * Input: workspace with ingested events
 * Output: workspace with eventGraph + minedPatterns populated
 *
 * Adapts the stage-based execution pattern from tool-compiler.ts.
 */
export async function runMiningPipeline(params: {
  workspace: SkillGraphWorkspace;
  config?: MiningConfig;
  onProgress?: OnMiningProgress;
}): Promise<SkillGraphWorkspace> {
  const { workspace, onProgress, config = DEFAULT_MINING_CONFIG } = params;

  if (workspace.events.length === 0) {
    console.log("[MiningPipeline] No events to mine. Skipping.");
    onProgress?.({
      stage: "complete",
      status: "done",
      message: "No events to mine.",
      patternCount: 0,
    });
    return workspace;
  }

  console.log(
    `[MiningPipeline] Starting mining on ${workspace.events.length} events`,
  );

  // Stage 1: Build Event Graph
  onProgress?.({
    stage: "build_graph",
    status: "running",
    message: `Building event graph from ${workspace.events.length} events...`,
  });

  const eventGraph = buildEventGraph(workspace.events);

  onProgress?.({
    stage: "build_graph",
    status: "done",
    message: `Event graph: ${eventGraph.stats.nodeCount} nodes, ${eventGraph.stats.edgeCount} edges, ${eventGraph.stats.crossSystemEdges} cross-system`,
  });

  // Stage 2: Mine Patterns
  onProgress?.({
    stage: "mine_patterns",
    status: "running",
    message: "Mining behavioral patterns...",
  });

  const minedPatterns = minePatterns(eventGraph, config);

  const crossSystemCount = minedPatterns.filter((p) => p.crossSystem).length;

  onProgress?.({
    stage: "mine_patterns",
    status: "done",
    message: `Found ${minedPatterns.length} patterns (${crossSystemCount} cross-system)`,
    patternCount: minedPatterns.length,
    crossSystemCount,
  });

  // Complete
  onProgress?.({
    stage: "complete",
    status: "done",
    message: `Mining complete: ${minedPatterns.length} patterns discovered`,
    patternCount: minedPatterns.length,
    crossSystemCount,
  });

  return {
    ...workspace,
    eventGraph,
    minedPatterns,
  };
}
