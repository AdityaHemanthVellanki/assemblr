import { ToolSystemSpec, ViewSpec } from "@/lib/toolos/spec";

export type ViewProjection = {
  id: string;
  name: string;
  type: ViewSpec["type"];
  data: any;
  actions: string[];
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

function resolveStatePath(state: Record<string, any>, path: string) {
  const parts = path.split(".");
  let current: any = state;
  for (const part of parts) {
    if (current == null) return null;
    current = current[part];
  }
  return current ?? null;
}
