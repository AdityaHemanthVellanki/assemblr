import { getAzureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import type { SkillGraphWorkspace } from "../events/event-schema";
import type { MinedPattern } from "../mining/mining-types";
import type { SkillGraph } from "../compiler/skill-schema";

/**
 * Skill Chat — chat-guided exploration of discovered patterns and skill graphs.
 *
 * Users can ask questions like:
 *  - "What patterns did you find?"
 *  - "Show me cross-system workflows"
 *  - "What does the team do after a deploy?"
 *  - "How often does the PR review pattern happen?"
 */

export type SkillChatIntent =
  | "list_patterns"
  | "filter_patterns"
  | "describe_pattern"
  | "list_skills"
  | "describe_skill"
  | "query_events"
  | "summary"
  | "unknown";

export interface SkillChatRequest {
  userMessage: string;
  workspace: SkillGraphWorkspace;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface SkillChatResponse {
  message: string;
  intent: SkillChatIntent;
  data?: {
    patterns?: MinedPattern[];
    skills?: SkillGraph[];
    stats?: Record<string, number>;
  };
}

const SKILL_CHAT_SYSTEM_PROMPT = `You are an organizational behavior analyst. You help users explore workflow patterns discovered from their connected integrations.

You have access to the following workspace data:
- Events: normalized activity from connected integrations (GitHub, Slack, Linear, etc.)
- Mined Patterns: recurring behavioral sequences detected through structural mining
- Compiled Skills: patterns compiled into executable skill graph DAGs

Your role:
1. Answer questions about discovered patterns and workflows
2. Explain what patterns mean and how they work
3. Help users understand cross-system workflows
4. Provide statistical insights (frequency, confidence, entropy)

Respond in a helpful, concise manner. Use bullet points for lists.
When describing patterns, explain the sequence of events and which integrations are involved.
When giving statistics, include frequency (how often), confidence (how reliable), and whether it crosses systems.`;

/**
 * Classify user intent from the message using lightweight keyword matching.
 * Falls back to "unknown" which triggers the LLM for general Q&A.
 */
function classifyIntent(message: string): SkillChatIntent {
  const text = message.toLowerCase();

  // Pattern-related queries
  if (
    text.includes("pattern") ||
    text.includes("workflow") ||
    text.includes("behavior") ||
    text.includes("sequence")
  ) {
    if (text.includes("cross") || text.includes("multi") || text.includes("between")) {
      return "filter_patterns";
    }
    if (text.includes("list") || text.includes("all") || text.includes("what") || text.includes("show")) {
      return "list_patterns";
    }
    if (text.includes("describe") || text.includes("explain") || text.includes("how")) {
      return "describe_pattern";
    }
    return "list_patterns";
  }

  // Skill-related queries
  if (text.includes("skill") || text.includes("graph") || text.includes("dag")) {
    if (text.includes("list") || text.includes("all") || text.includes("show")) {
      return "list_skills";
    }
    return "describe_skill";
  }

  // Event/data queries
  if (
    text.includes("event") ||
    text.includes("after") ||
    text.includes("before") ||
    text.includes("when") ||
    text.includes("how often")
  ) {
    return "query_events";
  }

  // Summary / overview
  if (
    text.includes("summary") ||
    text.includes("overview") ||
    text.includes("status") ||
    text.includes("stats")
  ) {
    return "summary";
  }

  return "unknown";
}

/**
 * Build context about the workspace for the LLM.
 */
function buildWorkspaceContext(workspace: SkillGraphWorkspace): string {
  const eventCount = workspace.events.length;
  const patternCount = workspace.minedPatterns.length;
  const skillCount = workspace.compiledSkills.length;
  const crossSystemCount = workspace.minedPatterns.filter(
    (p: any) => p.crossSystem,
  ).length;

  const sources = new Set(workspace.events.map((e) => e.source));

  let context = `## Workspace Overview
- Total events: ${eventCount}
- Data sources: ${Array.from(sources).join(", ") || "none"}
- Mined patterns: ${patternCount} (${crossSystemCount} cross-system)
- Compiled skills: ${skillCount}
`;

  // Add pattern summaries
  if (workspace.minedPatterns.length > 0) {
    context += "\n## Discovered Patterns\n";
    for (const p of workspace.minedPatterns.slice(0, 15)) {
      const csLabel = (p as any).crossSystem ? " [CROSS-SYSTEM]" : "";
      context += `- **${p.name}**${csLabel}: ${p.sequence.map((s: any) => `${s.source}:${s.eventType}`).join(" → ")} (freq: ${p.frequency}, conf: ${(p.confidence * 100).toFixed(0)}%)\n`;
    }
  }

  // Add skill summaries
  if (workspace.compiledSkills.length > 0) {
    context += "\n## Compiled Skills\n";
    for (const s of workspace.compiledSkills.slice(0, 10)) {
      context += `- **${s.name}**: ${s.description} (${s.nodes.length} nodes, conf: ${(s.metadata.confidence * 100).toFixed(0)}%)\n`;
    }
  }

  return context;
}

/**
 * Handle deterministic intents without calling the LLM.
 */
function handleDeterministicIntent(
  intent: SkillChatIntent,
  workspace: SkillGraphWorkspace,
  _userMessage: string,
): SkillChatResponse | null {
  switch (intent) {
    case "list_patterns": {
      const patterns = workspace.minedPatterns;
      if (patterns.length === 0) {
        return {
          message:
            "No patterns have been discovered yet. Run ingestion first to collect events, then mine patterns.",
          intent,
          data: { patterns: [], stats: { total: 0 } },
        };
      }
      const crossSystem = patterns.filter((p: any) => p.crossSystem);
      const lines = patterns.map(
        (p, i) =>
          `${i + 1}. **${p.name}** — ${p.sequence.map((s: any) => `${s.source}:${s.eventType}`).join(" → ")} (frequency: ${p.frequency}, confidence: ${(p.confidence * 100).toFixed(0)}%)`,
      );
      return {
        message: `Found **${patterns.length} patterns** (${crossSystem.length} cross-system):\n\n${lines.join("\n")}`,
        intent,
        data: {
          patterns,
          stats: {
            total: patterns.length,
            crossSystem: crossSystem.length,
          },
        },
      };
    }

    case "filter_patterns": {
      const crossSystem = workspace.minedPatterns.filter(
        (p: any) => p.crossSystem,
      );
      if (crossSystem.length === 0) {
        return {
          message:
            "No cross-system patterns found. Cross-system patterns involve events from multiple integrations (e.g., GitHub + Slack).",
          intent,
          data: { patterns: [], stats: { total: 0 } },
        };
      }
      const lines = crossSystem.map(
        (p, i) =>
          `${i + 1}. **${p.name}** — ${p.sequence.map((s: any) => `${s.source}:${s.eventType}`).join(" → ")} (frequency: ${p.frequency})`,
      );
      return {
        message: `Found **${crossSystem.length} cross-system patterns**:\n\n${lines.join("\n")}`,
        intent,
        data: { patterns: crossSystem },
      };
    }

    case "list_skills": {
      const skills = workspace.compiledSkills;
      if (skills.length === 0) {
        return {
          message:
            "No compiled skills yet. Run mining first to discover patterns, then they'll be compiled into skill graphs.",
          intent,
          data: { skills: [], stats: { total: 0 } },
        };
      }
      const lines = skills.map(
        (s, i) =>
          `${i + 1}. **${s.name}** — ${s.description} (${s.nodes.length} nodes, confidence: ${(s.metadata.confidence * 100).toFixed(0)}%)`,
      );
      return {
        message: `**${skills.length} compiled skill graphs**:\n\n${lines.join("\n")}`,
        intent,
        data: { skills },
      };
    }

    case "summary": {
      const eventCount = workspace.events.length;
      const sources = new Set(workspace.events.map((e) => e.source));
      const patternCount = workspace.minedPatterns.length;
      const crossSystem = workspace.minedPatterns.filter(
        (p: any) => p.crossSystem,
      ).length;
      const skillCount = workspace.compiledSkills.length;
      const graphStats = (workspace.eventGraph as any)?.stats;

      let msg = `## Workspace Summary\n\n`;
      msg += `- **Events**: ${eventCount} from ${sources.size} integrations (${Array.from(sources).join(", ")})\n`;
      if (graphStats) {
        msg += `- **Event Graph**: ${graphStats.nodeCount} nodes, ${graphStats.edgeCount} edges, ${graphStats.crossSystemEdges} cross-system edges\n`;
      }
      msg += `- **Patterns**: ${patternCount} discovered (${crossSystem} cross-system)\n`;
      msg += `- **Skills**: ${skillCount} compiled\n`;

      return {
        message: msg,
        intent,
        data: {
          stats: {
            events: eventCount,
            sources: sources.size,
            patterns: patternCount,
            crossSystem,
            skills: skillCount,
          },
        },
      };
    }

    default:
      return null;
  }
}

/**
 * Process a skill graph chat message.
 * Deterministic intents are handled locally; complex queries go to the LLM.
 */
export async function processSkillChat(
  request: SkillChatRequest,
): Promise<SkillChatResponse> {
  const { userMessage, workspace, history } = request;
  const intent = classifyIntent(userMessage);

  // Try deterministic handling first
  const deterministic = handleDeterministicIntent(intent, workspace, userMessage);
  if (deterministic) return deterministic;

  // Fall back to LLM for complex queries
  const env = getServerEnv();
  const workspaceContext = buildWorkspaceContext(workspace);

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SKILL_CHAT_SYSTEM_PROMPT + "\n\n" + workspaceContext },
    // Include last 10 history messages for context
    ...history.slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  try {
    const response = await getAzureOpenAIClient().chat.completions.create({
      model: env.AZURE_OPENAI_DEPLOYMENT_NAME!,
      messages,
      max_tokens: 1024,
      temperature: 0.3,
    });

    const content =
      response.choices[0]?.message?.content || "I couldn't generate a response.";

    return {
      message: content,
      intent: intent === "unknown" ? "query_events" : intent,
    };
  } catch (error: any) {
    console.error("[SkillChat] LLM call failed:", error.message);
    return {
      message: `I encountered an error processing your question. Here's a workspace summary instead:\n\n${buildWorkspaceContext(workspace)}`,
      intent: "summary",
    };
  }
}
