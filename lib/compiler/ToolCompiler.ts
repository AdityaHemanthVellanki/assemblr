import { createHash } from "crypto";
import { MultiIntegrationToolIntent } from "@/lib/intent/MultiIntegrationIntentSchema";
import { getCapability } from "@/lib/capabilities/registry";
import { CompiledTool, ToolSection, CapabilityInvocation, EntityType } from "@/lib/compiler/CompiledTool";

export function compile(intent: MultiIntegrationToolIntent): CompiledTool {
  validateIntent(intent);
  const sections = intent.sections.map((section) => compileSection(section));

  return {
    toolId: generateToolId(intent),
    title: intent.title,
    description: intent.description,
    sections,
  };
}

function validateIntent(intent: MultiIntegrationToolIntent) {
  if (!intent.title || !intent.title.trim()) {
    throw new Error("Intent.title is required");
  }
  if (!intent.description || !intent.description.trim()) {
    throw new Error("Intent.description is required");
  }
  if (!Array.isArray(intent.sections) || intent.sections.length === 0) {
    throw new Error("Intent.sections must contain at least one section");
  }
}

function compileSection(section: MultiIntegrationToolIntent["sections"][number]): ToolSection {
  if (!section.id) {
    throw new Error("Section.id is required");
  }
  if (!section.integration) {
    throw new Error(`Section ${section.id} integration is required`);
  }
  if (!Array.isArray(section.capabilities) || section.capabilities.length === 0) {
    throw new Error(`Section ${section.id} must include at least one capability`);
  }
  if (!section.stateNamespace) {
    throw new Error(`Section ${section.id} stateNamespace is required`);
  }

  const compiledCaps: CapabilityInvocation[] = section.capabilities.map((cap) => {
    if (!cap.id) {
      throw new Error(`Section ${section.id} capability id is required`);
    }
    const capability = getCapability(cap.id);
    if (!capability) {
      throw new Error(`Unknown capability '${cap.id}'`);
    }
    if (capability.integrationId !== section.integration) {
      throw new Error(`Capability '${cap.id}' does not match integration '${section.integration}'`);
    }
    if (!supportsOperation(capability, cap.operation)) {
      throw new Error(`Capability '${cap.id}' does not support ${cap.operation}`);
    }

    const defaultLimit = cap.limit ?? 25;
    const maxLimit = capability.constraints?.maxLimit ?? 100;
    if (defaultLimit > maxLimit) {
      throw new Error(`Limit ${defaultLimit} exceeds max ${maxLimit} for ${cap.id}`);
    }

    return {
      id: cap.id,
      actionId: `${section.integration}.${cap.id}`,
      params: buildParams(cap.id, cap.params ?? {}, defaultLimit),
    };
  });

  const primaryCapability = getCapability(compiledCaps[0].id);
  if (!primaryCapability) {
    throw new Error(`Unknown capability '${compiledCaps[0].id}'`);
  }

  const operation = section.capabilities[0].operation;
  if (!section.capabilities.every((c) => c.operation === operation)) {
    throw new Error(`Section ${section.id} mixes operations`);
  }

  const defaultLimit = section.capabilities[0].limit ?? 25;
  const maxLimit = Math.min(
    ...section.capabilities.map((cap) => {
      const capability = getCapability(cap.id);
      return capability?.constraints?.maxLimit ?? 100;
    }),
  );

  return {
    id: section.id,
    integration: section.integration,
    capabilities: compiledCaps,
    stateNamespace: section.stateNamespace,
    uiLayout: section.uiLayout,
    execution: {
      mode: operation,
      defaultLimit,
      maxLimit,
    },
    entityType: resolveEntityType(primaryCapability.id, primaryCapability.resource),
    state: {
      data: `${section.stateNamespace}.data`,
      loading: `${section.stateNamespace}.loading`,
      error: `${section.stateNamespace}.error`,
    },
  };
}

function supportsOperation(capability: { allowedOperations: string[] }, operation: "read" | "write") {
  if (operation === "read") return capability.allowedOperations.includes("read");
  return capability.allowedOperations.includes("write");
}

function buildParams(
  capabilityId: string,
  inputParams: Record<string, any>,
  limit: number,
): Record<string, any> {
  const filters = inputParams ?? {};

  if (capabilityId === "google_gmail_list") {
    return { maxResults: limit, q: filters.q };
  }
  if (capabilityId === "google_drive_list") {
    return { pageSize: limit, q: filters.q, orderBy: filters.orderBy };
  }
  if (capabilityId === "github_repos_list") {
    return { limit };
  }
  if (capabilityId === "github_issues_list") {
    return { owner: filters.owner, repo: filters.repo, state: filters.state };
  }
  if (capabilityId === "github_commits_list") {
    return { owner: filters.owner, repo: filters.repo, limit };
  }
  if (capabilityId === "slack_channels_list") {
    return { limit, types: filters.types };
  }
  if (capabilityId === "slack_messages_list") {
    return { limit, channel: filters.channel };
  }
  if (capabilityId === "notion_pages_search") {
    return { query: filters.query };
  }
  if (capabilityId === "notion_databases_list") {
    return { query: filters.query };
  }
  if (capabilityId === "linear_issues_list") {
    return { first: limit, includeArchived: filters.includeArchived };
  }
  if (capabilityId === "linear_teams_list") {
    return {};
  }
  if (capabilityId === "google_calendar_list") {
    return {
      calendarId: filters.calendarId,
      timeMin: filters.timeMin,
      timeMax: filters.timeMax,
      maxResults: limit,
      orderBy: filters.orderBy,
      singleEvents: filters.singleEvents,
    };
  }
  return { ...filters, limit };
}

function resolveEntityType(capabilityId: string, resource: string): EntityType {
  if (capabilityId === "google_gmail_list") return "Email";
  if (capabilityId === "google_drive_list") return "Page";
  if (capabilityId === "github_repos_list") return "Repo";
  if (capabilityId === "github_issues_list") return "Issue";
  if (capabilityId === "github_commits_list") return "Repo";
  if (capabilityId === "slack_channels_list") return "Message";
  if (capabilityId === "slack_messages_list") return "Message";
  if (capabilityId === "notion_pages_search") return "Page";
  if (capabilityId === "notion_databases_list") return "Page";
  if (capabilityId === "linear_issues_list") return "Issue";
  if (capabilityId === "linear_teams_list") return "Repo";
  if (resource === "issues") return "Issue";
  if (resource === "repos") return "Repo";
  if (resource === "messages") return "Message";
  if (resource === "pages") return "Page";
  return "Page";
}

function generateToolId(intent: MultiIntegrationToolIntent): string {
  return createHash("sha256").update(stableStringify(intent)).digest("hex");
}

function stableStringify(value: any): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `"${k}":${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
