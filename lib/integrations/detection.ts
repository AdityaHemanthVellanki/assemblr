/**
 * Centralized integration detection from natural language.
 *
 * Maps domain-specific keywords and concepts to the integrations that serve them.
 * Used by the chat planner, tool-chat layer, and compiler pipeline so detection
 * logic is consistent and comprehensive across the entire stack.
 */

import type { IntegrationId } from "@/lib/toolos/spec";

// Phase 1 supported integrations
const PHASE1: IntegrationId[] = ["github", "slack", "notion", "linear", "google"];

type Signal = {
  pattern: RegExp;
  integrations: IntegrationId[];
};

/**
 * Semantic signals: regex patterns that map natural language concepts to integrations.
 *
 * Rules:
 * - Patterns use word boundaries (\b) to avoid false substring matches.
 * - Case-insensitive via the `i` flag.
 * - Ordered by specificity: more specific patterns first.
 * - Multi-word patterns (e.g. "pull request") come before their shorter variants.
 */
const SIGNALS: Signal[] = [
  // ─── GitHub: version control, code, CI/CD ─────────────────────────
  { pattern: /\bgithub\b/i, integrations: ["github"] },
  { pattern: /\bcommits?\b/i, integrations: ["github"] },
  { pattern: /\bpull\s*requests?\b/i, integrations: ["github"] },
  { pattern: /\bprs?\b/i, integrations: ["github"] },
  { pattern: /\bmerge[ds]?\b/i, integrations: ["github"] },
  { pattern: /\bbranch(es|ing)?\b/i, integrations: ["github"] },
  { pattern: /\brepos?(itor(y|ies))?\b/i, integrations: ["github"] },
  { pattern: /\bforks?(ed|ing)?\b/i, integrations: ["github"] },
  { pattern: /\breleases?\b/i, integrations: ["github"] },
  { pattern: /\bcode\s*reviews?\b/i, integrations: ["github"] },
  { pattern: /\bdiffs?\b/i, integrations: ["github"] },
  { pattern: /\bdeploy(ments?|ed|ing|s)?\b/i, integrations: ["github"] },
  { pattern: /\bcontribut(ors?|ions?|ing)\b/i, integrations: ["github"] },
  { pattern: /\bgit\b/i, integrations: ["github"] },
  { pattern: /\bci\s*[\/\s]\s*cd\b/i, integrations: ["github"] },
  { pattern: /\bworkflow\s*runs?\b/i, integrations: ["github"] },
  { pattern: /\bgithub\s*actions?\b/i, integrations: ["github"] },
  { pattern: /\bopen\s*source\b/i, integrations: ["github"] },
  { pattern: /\bsource\s*code\b/i, integrations: ["github"] },
  { pattern: /\bcodebase\b/i, integrations: ["github"] },
  { pattern: /\bstargazers?\b/i, integrations: ["github"] },
  { pattern: /\bpipelines?\b/i, integrations: ["github"] },
  { pattern: /\bbuild\s*status\b/i, integrations: ["github"] },
  { pattern: /\bcheck\s*runs?\b/i, integrations: ["github"] },
  { pattern: /\bpushed?\b/i, integrations: ["github"] },
  { pattern: /\bclone[ds]?\b/i, integrations: ["github"] },
  { pattern: /\bgists?\b/i, integrations: ["github"] },
  { pattern: /\bREADME\b/i, integrations: ["github"] },
  { pattern: /\bpackage\.json\b/i, integrations: ["github"] },

  // ─── Slack: messaging, channels, notifications ────────────────────
  { pattern: /\bslack\b/i, integrations: ["slack"] },
  { pattern: /\bchannels?\b/i, integrations: ["slack"] },
  { pattern: /\bdirect\s*messages?\b/i, integrations: ["slack"] },
  { pattern: /\bdms?\b/i, integrations: ["slack"] },
  { pattern: /\bthreads?\b/i, integrations: ["slack"] },
  { pattern: /\bstand\s*-?\s*ups?\b/i, integrations: ["slack"] },
  { pattern: /\bmessages?\b/i, integrations: ["slack"] },
  { pattern: /\bnotifications?\b/i, integrations: ["slack"] },
  { pattern: /\bmentions?\b/i, integrations: ["slack"] },
  { pattern: /\bannouncements?\b/i, integrations: ["slack"] },
  { pattern: /\bchat\s*history\b/i, integrations: ["slack"] },
  { pattern: /\bconversations?\b/i, integrations: ["slack"] },
  { pattern: /\b#[a-z][\w-]+\b/i, integrations: ["slack"] }, // #channel-name

  // ─── Notion: docs, wikis, knowledge management ────────────────────
  { pattern: /\bnotion\b/i, integrations: ["notion"] },
  { pattern: /\bwiki\b/i, integrations: ["notion"] },
  { pattern: /\bknowledge\s*base\b/i, integrations: ["notion"] },
  { pattern: /\bnotion\s*(pages?|databases?)\b/i, integrations: ["notion"] },
  { pattern: /\bnotes?\b/i, integrations: ["notion"] },

  // ─── Linear: project management, sprints, issues ──────────────────
  { pattern: /\blinear\b/i, integrations: ["linear"] },
  { pattern: /\bsprints?\b/i, integrations: ["linear"] },
  { pattern: /\bcycles?\b/i, integrations: ["linear"] },
  { pattern: /\bbacklog\b/i, integrations: ["linear"] },
  { pattern: /\broadmaps?\b/i, integrations: ["linear"] },
  { pattern: /\bproject\s*boards?\b/i, integrations: ["linear"] },
  { pattern: /\btickets?\b/i, integrations: ["linear"] },
  { pattern: /\btriage\b/i, integrations: ["linear"] },
  { pattern: /\bvelocity\b/i, integrations: ["linear"] },
  { pattern: /\bepics?\b/i, integrations: ["linear"] },
  { pattern: /\bpriority\s*(p[0-4]|urgent|high|medium|low)\b/i, integrations: ["linear"] },

  // ─── Google: email, sheets, docs, calendar, drive ─────────────────
  { pattern: /\bgoogle\b/i, integrations: ["google"] },
  { pattern: /\bgmail\b/i, integrations: ["google"] },
  { pattern: /\bgoogle\s*(sheets?|docs?|drive|meet|calendar)\b/i, integrations: ["google"] },
  { pattern: /\bspreadsheets?\b/i, integrations: ["google"] },
  { pattern: /\binbox\b/i, integrations: ["google"] },
  { pattern: /\be-?mails?\b/i, integrations: ["google"] },
  { pattern: /\bcalendar\b/i, integrations: ["google"] },
  { pattern: /\bmeetings?\b/i, integrations: ["google"] },
  { pattern: /\bdrive\b/i, integrations: ["google"] },
  { pattern: /\bmail\b/i, integrations: ["google"] },

  // ─── Shared / ambiguous concepts ──────────────────────────────────
  { pattern: /\bissues?\b/i, integrations: ["github", "linear"] },
  { pattern: /\bdocs?\b/i, integrations: ["notion", "google"] },
  { pattern: /\bdocuments?\b/i, integrations: ["notion", "google"] },
  { pattern: /\btasks?\b/i, integrations: ["linear"] },
  { pattern: /\bpages?\b/i, integrations: ["notion"] },
  { pattern: /\bdatabases?\b/i, integrations: ["notion"] },
];

/**
 * Detect integrations from natural language text using semantic keyword matching.
 *
 * Returns only Phase 1 integration IDs (github, slack, notion, linear, google).
 */
export function detectIntegrationsFromText(text: string): IntegrationId[] {
  const hits = new Set<IntegrationId>();
  for (const signal of SIGNALS) {
    if (signal.pattern.test(text)) {
      for (const id of signal.integrations) {
        if (PHASE1.includes(id)) {
          hits.add(id);
        }
      }
    }
  }
  return Array.from(hits);
}
