
import { PlannerContext } from "@/lib/ai/types";
import { getCapability } from "@/lib/capabilities/registry";

export type CapabilityMatch = {
  capabilityId: string;
  integrationId: string;
  score: number; // 0-1
  reason: string;
};

const RESOURCE_SYNONYMS: Record<string, string[]> = {
  "email": ["gmail", "messages"],
  "mail": ["gmail", "messages"],
  "message": ["slack", "gmail", "messages"],
  "chat": ["slack", "messages"],
  "file": ["drive", "notion", "pages"],
  "document": ["drive", "notion", "pages"],
  "doc": ["drive", "notion", "pages"],
  "repo": ["github", "repos"],
  "code": ["github", "repos"],
  "bug": ["issues", "linear", "github"],
  "task": ["issues", "linear", "github"],
  "issue": ["github", "linear", "issues"],
  "ticket": ["linear", "issues"],
  "commit": ["github", "commits"],
  "channel": ["slack", "channels"],
};

export class CapabilityDiscoveryEngine {
  constructor(private context: PlannerContext) {}

  /**
   * Ranks available capabilities against a user query.
   * Uses heuristic string matching and resource awareness.
   */
  discover(query: string): CapabilityMatch[] {
    const matches: CapabilityMatch[] = [];
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\s+/).filter(t => t.length > 2);

    for (const [integrationId, details] of Object.entries(this.context.integrations)) {
      if (!details.connected) continue;

      for (const capId of details.capabilities) {
        const capDef = getCapability(capId);
        if (!capDef) continue;

        let score = 0;
        const reasons: string[] = [];
        const capLower = capId.toLowerCase();
        const resourceLower = capDef.resource?.toLowerCase() || "";
        
        // 1. Exact integration match in capability ID
        if (capLower.includes(integrationId)) {
            score += 0.05; // Base boost for validity
        }

        // 2. Resource Match (High Value)
        if (resourceLower && queryLower.includes(resourceLower)) {
            score += 0.4;
            reasons.push(`Matches resource '${resourceLower}'`);
        }

        // 3. Synonym Matching
        for (const [synonym, targets] of Object.entries(RESOURCE_SYNONYMS)) {
            if (queryLower.includes(synonym)) {
                if (targets.some(t => capLower.includes(t) || resourceLower.includes(t))) {
                    score += 0.3;
                    reasons.push(`Matches synonym '${synonym}'`);
                    break; // Count synonym match once per capability
                }
            }
        }

        // 4. Token overlap
        let matchedTokens = 0;
        for (const token of queryTokens) {
            if (capLower.includes(token) || resourceLower.includes(token)) {
                matchedTokens++;
                score += 0.1;
            }
        }
        
        // 5. Action Verb Heuristics
        if (queryLower.includes("list") || queryLower.includes("show") || queryLower.includes("get") || queryLower.includes("find")) {
            if (capDef.allowedOperations.includes("read") || capDef.allowedOperations.includes("filter")) {
                score += 0.1;
            }
        }
        if (queryLower.includes("create") || queryLower.includes("add") || queryLower.includes("new")) {
             // Future: check for 'write' op
             if (capLower.includes("create") || capLower.includes("add")) {
                score += 0.2;
            }
        }

        // Cap score at 1.0
        score = Math.min(score, 1.0);

        if (score > 0.2) { // Threshold to reduce noise
            matches.push({
                capabilityId: capId,
                integrationId,
                score,
                reason: reasons.join(", ")
            });
        }
      }
    }

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
