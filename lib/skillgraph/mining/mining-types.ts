import { z } from "zod";
import type { IntegrationId } from "@/lib/toolos/spec";

/**
 * Workflow Mining Engine types.
 *
 * Represents the output of structural sequence mining on the event graph.
 */

/** A raw event sequence extracted from the graph (single actor's trail) */
export type EventSequence = {
  /** Ordered events in this sequence (event type + source + relative time) */
  events: Array<{
    eventType: string;
    source: IntegrationId;
    relativeTimeMs: number; // ms since the anchor event
  }>;
  /** Actor who performed this sequence */
  actorId: string;
  /** Absolute start time */
  startTime: string;
  /** Absolute end time */
  endTime: string;
};

/** A mined behavioral pattern (cluster of similar sequences) */
export type MinedPattern = {
  /** Unique pattern ID */
  id: string;
  /** Auto-generated human-readable label */
  name: string;
  /** The trigger/anchor event type that starts this pattern */
  anchorEvent: string;
  /** Anchor event source integration */
  anchorSource: IntegrationId;
  /** Ordered sequence of steps in this pattern */
  sequence: Array<{
    eventType: string;
    source: IntegrationId;
    avgDelayMs: number; // average time after anchor
    stdDevMs: number; // standard deviation of delay
    optional: boolean; // true if present in <80% of instances
  }>;
  /** How many times this pattern was observed */
  frequency: number;
  /** Which actors exhibit this pattern */
  actors: string[];
  /** Confidence: frequency / total anchor occurrences (0-1) */
  confidence: number;
  /** Entropy: normalized std deviation of inter-event times (low = deterministic) */
  entropy: number;
  /** Whether this pattern spans multiple integrations */
  crossSystem: boolean;
  /** Raw instances that matched this pattern */
  instances: EventSequence[];
};

/** Zod schema for MinedPattern serialization */
export const MinedPatternSchema = z.object({
  id: z.string(),
  name: z.string(),
  anchorEvent: z.string(),
  anchorSource: z.string(),
  sequence: z.array(
    z.object({
      eventType: z.string(),
      source: z.string(),
      avgDelayMs: z.number(),
      stdDevMs: z.number(),
      optional: z.boolean(),
    }),
  ),
  frequency: z.number(),
  actors: z.array(z.string()),
  confidence: z.number(),
  entropy: z.number(),
  crossSystem: z.boolean(),
  instances: z.array(
    z.object({
      events: z.array(
        z.object({
          eventType: z.string(),
          source: z.string(),
          relativeTimeMs: z.number(),
        }),
      ),
      actorId: z.string(),
      startTime: z.string(),
      endTime: z.string(),
    }),
  ),
});

/** Mining configuration */
export type MiningConfig = {
  /** Time window for sequence extraction (ms) */
  sequenceWindowMs: number;
  /** Minimum frequency to keep a pattern */
  minFrequency: number;
  /** Minimum confidence to keep a pattern (0-1) */
  minConfidence: number;
  /** Max edit distance for sequence clustering */
  maxEditDistance: number;
  /** Max sequence length to extract */
  maxSequenceLength: number;
};

export const DEFAULT_MINING_CONFIG: MiningConfig = {
  sequenceWindowMs: 4 * 60 * 60 * 1000, // 4 hours
  minFrequency: 3,
  minConfidence: 0.3,
  maxEditDistance: 2,
  maxSequenceLength: 10,
};
