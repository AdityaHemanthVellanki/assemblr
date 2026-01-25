export const ORG_ROLES = ["owner", "editor", "viewer"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export class PermissionError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export function canViewDashboards(role: OrgRole) {
  return role === "owner" || role === "editor" || role === "viewer";
}

export function canEditProjects(role: OrgRole) {
  return role === "owner" || role === "editor";
}

export function canGenerateSpec(role: OrgRole) {
  return role === "owner" || role === "editor";
}

export function canManageDataSources(role: OrgRole) {
  return role === "owner";
}

export function canManageMembers(role: OrgRole) {
  return role === "owner";
}

export function canManageIntegrations(role: OrgRole) {
  return role === "owner" || role === "editor";
}

export function canCreateWorkflows(role: OrgRole) {
  return role === "owner" || role === "editor";
}

export function canApproveWorkflows(role: OrgRole) {
  return role === "owner";
}

export function requiresApproval(role: OrgRole, actions: any[]) {
  if (role === "owner") return false;
  if (role === "editor") {
    return actions.length > 0;
  }
  return true;
}

export function roleLabel(role: OrgRole) {
  if (role === "owner") return "Owner";
  if (role === "editor") return "Editor";
  return "Viewer";
}
