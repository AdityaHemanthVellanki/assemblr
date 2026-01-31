import { ToolSection, IntegrationId, EntityType } from "@/lib/compiler/CompiledTool";
import { NormalizedEntity } from "@/lib/entities/EntityNormalizer";

export type RenderableToolUI = {
  sectionId: string;
  integration: IntegrationId;
  title: string;
  entityType: EntityType;
  layout: "table" | "list" | "form" | "grouped";
  columns: string[];
  rows: Array<{
    id: string;
    values: Record<string, string | number>;
    details?: Record<string, string | number>;
  }>;
  groups?: Array<{ label: string; rows: RenderableToolUI["rows"] }>;
  formFields?: Array<{ id: string; label: string; value: string }>;
  emptyState: { title: string; description: string };
  loading: boolean;
  error: string | null;
  actions: Array<{ type: "refresh" | "load_more" | "submit"; label: string }>;
  pagination: { limit: number; hasMore: boolean };
};

export function compileToolUX(input: {
  section: ToolSection;
  entities: NormalizedEntity[];
  limit: number;
  loading: boolean;
  error: string | null;
  supplemental?: {
    issuesByRepo?: Record<string, number>;
  };
}): RenderableToolUI {
  const { section, entities, limit, loading, error, supplemental } = input;
  if (section.execution.mode === "write") {
    return {
      sectionId: section.id,
      integration: section.integration,
      title: section.integration,
      entityType: section.entityType,
      layout: "form",
      columns: [],
      rows: [],
      formFields: Object.keys(section.capabilities[0]?.params || {}).map((key) => ({
        id: key,
        label: key,
        value: String(section.capabilities[0]?.params?.[key] ?? ""),
      })),
      emptyState: {
        title: "Ready to execute",
        description: "Submit to execute the action.",
      },
      loading,
      error,
      actions: [{ type: "submit", label: "Submit" }],
      pagination: {
        limit,
        hasMore: false,
      },
    };
  }

  // Schema Bleeding Fix: Strict Isolation
  const filteredEntities = entities.filter((entity) =>
    isEntityMatchingSection(entity, section.entityType),
  );

  const rows = filteredEntities
    .slice(0, limit)
    .map((entity) => toRow(entity, section.integration, supplemental));
  const columns = rows.length > 0 ? Object.keys(rows[0].values) : defaultColumns(section.entityType, section.integration);
  const grouped = buildGroups(section, rows);

  const emptyStateTitle = section.entityType
    ? `No ${section.entityType.toLowerCase()}s found`
    : "No data found";

  const emptyStateDescription = section.entityType === "Email"
    ? "No emails found matching your search."
    : section.entityType === "Issue"
    ? "No issues found matching your filters."
    : "Try adjusting your query or filters.";

  return {
    sectionId: section.id,
    integration: section.integration,
    title: section.integration,
    entityType: section.entityType,
    layout: grouped.length > 0 ? "grouped" : section.uiLayout === "list" ? "list" : "table",
    columns,
    rows,
    groups: grouped.length > 0 ? grouped : undefined,
    emptyState: {
      title: emptyStateTitle,
      description: emptyStateDescription,
    },
    loading,
    error,
    actions: [
      { type: "refresh", label: "Refresh" },
      { type: "load_more", label: "Load more" },
    ],
    pagination: {
      limit,
      hasMore: filteredEntities.length > limit,
    },
  };
}

function isEntityMatchingSection(entity: NormalizedEntity, entityType: EntityType | undefined): boolean {
  if (!entityType) return true;
  switch (entityType) {
    case "Email":
      return "subject" in entity && "from" in entity;
    case "Repo":
      return "stars" in entity && "name" in entity;
    case "Issue":
      return "status" in entity && "assignee" in entity;
    case "Message":
      return "text" in entity && "channel" in entity;
    case "Page":
      return "workspace" in entity && "lastEdited" in entity;
    default:
      return true;
  }
}

function toRow(
  entity: NormalizedEntity,
  integration: IntegrationId,
  supplemental?: { issuesByRepo?: Record<string, number> },
): RenderableToolUI["rows"][number] {
  if ("subject" in entity) {
    return {
      id: entity.id,
      values: {
        sender: entity.from,
        subject: entity.subject,
        preview: entity.snippet,
        date: entity.date,
      },
      details: {
        preview: entity.snippet,
      },
    };
  }
  if ("stars" in entity) {
    const issues = supplemental?.issuesByRepo?.[entity.name] ?? 0;
    return {
      id: entity.id,
      values: {
        repo: entity.name,
        stars: entity.stars,
        lastCommit: entity.lastCommit,
      },
      details: {
        owner: entity.owner,
        url: entity.url,
        issues,
      },
    };
  }
  if ("status" in entity) {
    return {
      id: entity.id,
      values: {
        title: entity.title,
        status: entity.status,
        assignee: entity.assignee || "Unassigned",
      },
    };
  }
  if ("text" in entity) {
    return {
      id: entity.id,
      values: {
        channel: entity.channel,
        text: entity.text,
        timestamp: entity.timestamp,
      },
      details: {
        text: entity.text,
        timestamp: entity.timestamp,
      },
    };
  }
  return {
    id: entity.id,
    values: {
      title: entity.title,
      workspace: entity.workspace,
      lastEdited: entity.lastEdited,
    },
  };
}

function defaultColumns(entityType: EntityType, integration: IntegrationId) {
  if (entityType === "Email") return ["sender", "subject", "preview", "date"];
  if (entityType === "Repo") return ["repo", "stars", "lastCommit"];
  if (entityType === "Issue" && integration === "linear") return ["title", "status", "assignee"];
  if (entityType === "Issue") return ["title", "status", "assignee"];
  if (entityType === "Message") return ["channel", "text", "timestamp"];
  return ["title", "workspace", "lastEdited"];
}

function buildGroups(section: ToolSection, rows: RenderableToolUI["rows"]) {
  if (section.integration === "slack") {
    return groupRows(rows, "channel");
  }
  if (section.integration === "linear") {
    return groupRows(rows, "status");
  }
  return [];
}

function groupRows(rows: RenderableToolUI["rows"], key: string) {
  const map = new Map<string, RenderableToolUI["rows"]>();
  for (const row of rows) {
    const label = String(row.values[key] ?? "Unknown");
    map.set(label, [...(map.get(label) ?? []), row]);
  }
  return Array.from(map.entries()).map(([label, rows]) => ({ label, rows }));
}
