
import { Capability, CAPABILITY_REGISTRY, CapabilityOperation } from "./definitions";
import { assemblrABI } from "@/lib/core/abi";
import { CapabilityDefinition } from "@/lib/core/abi/types";

export type { Capability, CapabilityOperation };
export { CAPABILITY_REGISTRY };

// Helper to convert ABI CapabilityDefinition to Legacy Capability
function toLegacyCapability(def: CapabilityDefinition): Capability {
  return {
    id: def.id,
    integrationId: def.integrationId,
    // Attempt to parse description or metadata to recover resource/ops
    // For now, we rely on the fact that core capabilities are registered FROM legacy structure
    // so we might want to store the original structure in metadata if needed.
    // Or we assume this is primarily used for the Planner which needs to know fields.
    resource: "unknown", // Plugins need to expose this better if legacy code needs it
    allowedOperations: def.mode === "read" ? ["read"] : ["read", "filter"], // Approximation
    supportedFields: [],
  };
}

export function getCapability(id: string): Capability | undefined {
  // 1. Try Legacy Static Registry first (Synchronous & Safe)
  const legacy = CAPABILITY_REGISTRY.find((c) => c.id === id);
  if (legacy) return legacy;

  // 2. Try ABI Registry
  const abiCap = assemblrABI.capabilities.get(id);
  if (abiCap) {
    return toLegacyCapability(abiCap);
  }

  return undefined;
}

export function getCapabilitiesForIntegration(integrationId: string): Capability[] {
  const legacy = CAPABILITY_REGISTRY.filter((c) => c.integrationId === integrationId);
  const abi = assemblrABI.capabilities.list()
    .filter(c => c.integrationId === integrationId)
    .filter(c => !legacy.find(l => l.id === c.id)) // Dedupe
    .map(toLegacyCapability);
    
  return [...legacy, ...abi];
}

export function getAllCapabilities(): Capability[] {
    const legacy = CAPABILITY_REGISTRY;
    const abi = assemblrABI.capabilities.list()
        .filter(c => !legacy.find(l => l.id === c.id))
        .map(toLegacyCapability);
    return [...legacy, ...abi];
}
