
import { PlannerContext } from "@/lib/ai/types";

export type CapabilityMatch = {
  capabilityId: string;
  integrationId: string;
  score: number; // 0-1
  reason: string;
};

export class CapabilityDiscoveryEngine {
  constructor(private context: PlannerContext) {}

  /**
   * Ranks available capabilities against a user query.
   * Uses heuristic string matching for now.
   */
  discover(query: string): CapabilityMatch[] {
    const matches: CapabilityMatch[] = [];
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\s+/).filter(t => t.length > 2);

    for (const [integrationId, details] of Object.entries(this.context.integrations)) {
      if (!details.connected) continue;

      for (const capId of details.capabilities) {
        let score = 0;
        const capLower = capId.toLowerCase();
        
        // 1. Exact integration match in capability ID
        if (capLower.includes(integrationId)) score += 0.3;

        // 2. Token overlap
        let matchedTokens = 0;
        for (const token of queryTokens) {
            if (capLower.includes(token)) {
                matchedTokens++;
                score += 0.2;
            }
        }
        
        // 3. Action Verb Heuristics
        if (queryLower.includes("list") || queryLower.includes("show") || queryLower.includes("get")) {
            if (capLower.includes("list") || capLower.includes("search") || capLower.includes("get")) {
                score += 0.1;
            }
        }
        if (queryLower.includes("create") || queryLower.includes("add") || queryLower.includes("new")) {
            if (capLower.includes("create") || capLower.includes("add")) {
                score += 0.2;
            }
        }

        // Cap score at 1.0
        score = Math.min(1.0, score);

        if (score > 0.1) {
            matches.push({
                capabilityId: capId,
                integrationId,
                score,
                reason: `Matched ${matchedTokens} tokens and integration ID`
            });
        }
      }
    }

    // Sort by score descending
    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Selects the best capability for a given intent.
   * Throws if ambiguity is too high or no match found.
   */
  selectBest(query: string, threshold = 0.4): CapabilityMatch | null {
      const matches = this.discover(query);
      if (matches.length === 0) return null;
      
      const best = matches[0];
      if (best.score < threshold) return null;

      return best;
  }
}
