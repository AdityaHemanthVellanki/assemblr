import { ToolSystemSpec, ViewSpec } from "@/lib/toolos/spec";
import { type SnapshotRecords } from "@/lib/toolos/materialization";

export type ViewProjection = {
  id: string;
  name: string;
  type: ViewSpec["type"];
  data: any;
  actions: string[];
};

export type DefaultViewItem = {
  source: string;
  count: number;
};

export type DefaultViewSpec = {
  type: "dashboard";
  title: string;
  sections: Array<{
    type: "list";
    title: string;
    items: DefaultViewItem[];
  }>;
};

export function renderView(spec: ToolSystemSpec, state: Record<string, any>, viewId: string): ViewProjection {
  const view = spec.views.find((v) => v.id === viewId);
  if (!view) {
    throw new Error(`View ${viewId} not found`);
  }
  const data = resolveStatePath(state, view.source.statePath);
  return {
    id: view.id,
    name: view.name,
    type: view.type,
    data,
    actions: view.actions,
  };
}

export function buildDefaultViewSpec(records?: SnapshotRecords | null): DefaultViewSpec {
  const items: DefaultViewItem[] = [];
  const integrations = records?.integrations ?? {};
  const actions = records?.actions ?? {};
  const sources = Object.keys(integrations).length > 0 ? integrations : actions;

  for (const [source, output] of Object.entries(sources)) {
    let count = 0;
    if (Array.isArray(output)) {
      count = output.length;
    } else if (output && typeof output === "object") {
      const values = Object.values(output as Record<string, any>);
      count = values.reduce((sum, value) => sum + (Array.isArray(value) ? value.length : value ? 1 : 0), 0);
    } else if (output !== null && output !== undefined) {
      count = 1;
    }
    items.push({ source, count });
  }

  return {
    type: "dashboard",
    title: "Assemblr Tool Output",
    sections: [
      {
        type: "list",
        title: "Fetched Data",
        items,
      },
    ],
  };
}

function resolveStatePath(state: Record<string, any>, path: string) {
  const parts = path.split(".");
  let current: any = state;
  for (const part of parts) {
    if (current == null) return null;
    current = current[part];
  }
  return current ?? null;
}
