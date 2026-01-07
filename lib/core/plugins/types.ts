
import { AssemblrABI } from "../abi/types";

export type PluginType = "integration" | "capability" | "ui_component" | "agent";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  type: PluginType;
  compatibleAbiVersions: string[];
  permissionsRequested: string[];
  entryPoint?: string; // Path to main entry point if loaded from disk
}

export interface PluginSandbox {
  cpuLimit?: number;
  memoryLimit?: number; // In MB
  executionTimeout?: number; // In ms
  networkAccess: "none" | "declared_integrations" | "all"; // 'all' only for system plugins
}

export interface Plugin {
  manifest: PluginManifest;
  register(abi: AssemblrABI): Promise<void> | void;
  onEnable?(): Promise<void>;
  onDisable?(): Promise<void>;
}

export interface PluginContext {
  pluginId: string;
  sandbox: PluginSandbox;
  // Scoped storage or logger could go here
}
