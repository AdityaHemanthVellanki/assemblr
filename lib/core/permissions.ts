export type Permission = {
  integration: string; // IntegrationId or "*"
  capability: string; // CapabilityId or "*"
  access: "read" | "write";
  scope?: string[]; // e.g. ["repo:assemblr/*"]
};

export type PermissionSet = Permission[];

// Default Permissions (Dev Mode: Allow All)
export const DEV_PERMISSIONS: PermissionSet = [
  { integration: "*", capability: "*", access: "read" },
  { integration: "*", capability: "*", access: "write" }
];

export function checkPermission(permissions: PermissionSet, integrationId: string, capabilityId: string, access: "read" | "write"): boolean {
  return permissions.some(p => {
    const matchInt = p.integration === "*" || p.integration === integrationId;
    const matchCap = p.capability === "*" || p.capability === capabilityId;
    const matchAccess = p.access === access || (p.access === "write" && access === "read"); // Write implies Read? Maybe strict separation is better.
    // For now, strict:
    const strictAccess = p.access === access;
    
    // Actually, "write" usually implies "read" capability in broad terms, but here they are specific modes.
    // Let's keep it strict.
    return matchInt && matchCap && strictAccess;
  });
}
