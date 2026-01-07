import { DashboardSpec } from "@/lib/spec/dashboardSpec";
import { VersionDiff } from "@/lib/core/versioning";

export function calculateDiff(oldSpec: DashboardSpec, newSpec: DashboardSpec): VersionDiff {
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

  // Pages
  const oldPageIds = new Set(oldSpec.pages?.map(p => p.id) || []);
  const newPageIds = new Set(newSpec.pages?.map(p => p.id) || []);

  newSpec.pages?.forEach(p => {
    if (!oldPageIds.has(p.id)) {
      diff.pages_added.push(p.id);
    } else {
      // Check modification (naive JSON stringify for now)
      const oldP = oldSpec.pages?.find(op => op.id === p.id);
      if (JSON.stringify(oldP) !== JSON.stringify(p)) {
        diff.pages_modified.push(p.id);
      }
    }
  });

  oldSpec.pages?.forEach(p => {
    if (!newPageIds.has(p.id)) {
      diff.pages_removed.push(p.id);
    }
  });

  // Actions
  const oldActionIds = new Set(oldSpec.actions?.map(a => a.id) || []);
  const newActionIds = new Set(newSpec.actions?.map(a => a.id) || []);

  newSpec.actions?.forEach(a => {
    if (!oldActionIds.has(a.id)) {
      diff.actions_added.push(a.id);
    } else {
      const oldA = oldSpec.actions?.find(oa => oa.id === a.id);
      if (JSON.stringify(oldA) !== JSON.stringify(a)) {
        diff.actions_modified.push(a.id);
      }
    }
  });

  oldSpec.actions?.forEach(a => {
    if (!newActionIds.has(a.id)) {
      diff.actions_removed.push(a.id);
    }
  });

  // Integrations (derived from actions)
  const oldIntegrations = new Set(oldSpec.actions?.map(a => a.config?.integrationId).filter(Boolean) as string[]);
  const newIntegrations = new Set(newSpec.actions?.map(a => a.config?.integrationId).filter(Boolean) as string[]);
  
  // Also check views/metrics if legacy
  oldSpec.views?.forEach(v => { if (v.integrationId) oldIntegrations.add(v.integrationId) });
  newSpec.views?.forEach(v => { if (v.integrationId) newIntegrations.add(v.integrationId) });

  // If any new integration is present that wasn't before
  newIntegrations.forEach(i => {
      if (!oldIntegrations.has(i)) diff.integrations_changed.push(i);
  });

  return diff;
}
