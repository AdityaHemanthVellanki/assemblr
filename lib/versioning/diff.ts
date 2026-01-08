import { DashboardSpec } from "@/lib/spec/dashboardSpec";
import { ToolSpec } from "@/lib/spec/toolSpec";
import { MiniAppSpec } from "@/lib/spec/miniAppSpec";
import { VersionDiff } from "@/lib/core/versioning";

export function calculateDiff(oldSpec: ToolSpec, newSpec: ToolSpec): VersionDiff {
  const diff: VersionDiff = {
    pages_added: [],
    pages_removed: [],
    pages_modified: [],
    actions_added: [],
    actions_removed: [],
    actions_modified: [],
    integrations_changed: [],
    permissions_changed: false,
  };

  const oldMiniApp = oldSpec as unknown as Partial<MiniAppSpec>;
  const newMiniApp = newSpec as unknown as Partial<MiniAppSpec>;

  // Pages
  const oldPageIds = new Set(oldMiniApp.pages?.map(p => p.id) || []);
  const newPageIds = new Set(newMiniApp.pages?.map(p => p.id) || []);

  newMiniApp.pages?.forEach(p => {
    if (!oldPageIds.has(p.id)) {
      diff.pages_added.push(p.id);
    } else {
      // Check modification (naive JSON stringify for now)
      const oldP = oldMiniApp.pages?.find(op => op.id === p.id);
      if (JSON.stringify(oldP) !== JSON.stringify(p)) {
        diff.pages_modified.push(p.id);
      }
    }
  });

  oldMiniApp.pages?.forEach(p => {
    if (!newPageIds.has(p.id)) {
      diff.pages_removed.push(p.id);
    }
  });

  // Actions
  const oldActionIds = new Set(oldMiniApp.actions?.map(a => a.id) || []);
  const newActionIds = new Set(newMiniApp.actions?.map(a => a.id) || []);

  newMiniApp.actions?.forEach(a => {
    if (!oldActionIds.has(a.id)) {
      diff.actions_added.push(a.id);
    } else {
      const oldA = oldMiniApp.actions?.find(oa => oa.id === a.id);
      if (JSON.stringify(oldA) !== JSON.stringify(a)) {
        diff.actions_modified.push(a.id);
      }
    }
  });

  oldMiniApp.actions?.forEach(a => {
    if (!newActionIds.has(a.id)) {
      diff.actions_removed.push(a.id);
    }
  });

  // Integrations (derived from actions)
  const oldIntegrations = new Set(oldMiniApp.actions?.map(a => a.config?.integrationId).filter(Boolean) as string[]);
  const newIntegrations = new Set(newMiniApp.actions?.map(a => a.config?.integrationId).filter(Boolean) as string[]);
  
  // Also check views/metrics if legacy
  const oldDashboard = oldSpec as unknown as Partial<DashboardSpec>;
  const newDashboard = newSpec as unknown as Partial<DashboardSpec>;

  oldDashboard.views?.forEach(v => { if (v.integrationId) oldIntegrations.add(v.integrationId) });
  newDashboard.views?.forEach(v => { if (v.integrationId) newIntegrations.add(v.integrationId) });

  // If any new integration is present that wasn't before
  newIntegrations.forEach(i => {
      if (!oldIntegrations.has(i)) diff.integrations_changed.push(i);
  });

  return diff;
}
