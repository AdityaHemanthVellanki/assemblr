
import { assemblrABI } from "../abi";
import { Plugin, PluginManifest } from "./types";

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private activePlugins: Set<string> = new Set();

  async loadPlugin(plugin: Plugin): Promise<void> {
    console.log(`[PluginManager] Loading plugin: ${plugin.manifest.name} (${plugin.manifest.id})`);
    
    // 1. Validate Manifest
    this.validateManifest(plugin.manifest);

    // 2. Check Permissions (Mock)
    // In a real system, we would prompt the user or check a policy database.
    console.log(`[PluginManager] Permissions requested:`, plugin.manifest.permissionsRequested);

    // 3. Register Plugin
    this.plugins.set(plugin.manifest.id, plugin);

    // 4. Enable Plugin
    await this.enablePlugin(plugin.manifest.id);
  }

  async enablePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

    if (this.activePlugins.has(pluginId)) {
      console.warn(`Plugin ${pluginId} is already active.`);
      return;
    }

    try {
      // Sandboxing note: In a real implementation, we would wrap the ABI 
      // passed to the plugin in a Proxy that enforces the sandbox constraints.
      await plugin.register(assemblrABI);
      
      if (plugin.onEnable) {
        await plugin.onEnable();
      }
      
      this.activePlugins.add(pluginId);
      console.log(`[PluginManager] Enabled plugin: ${pluginId}`);
    } catch (e) {
      console.error(`[PluginManager] Failed to enable plugin ${pluginId}:`, e);
      throw e;
    }
  }

  async disablePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

    if (!this.activePlugins.has(pluginId)) {
      return;
    }

    if (plugin.onDisable) {
      await plugin.onDisable();
    }

    this.activePlugins.delete(pluginId);
    console.log(`[PluginManager] Disabled plugin: ${pluginId}`);
  }

  private validateManifest(manifest: PluginManifest) {
    if (!manifest.id || !manifest.name || !manifest.version) {
      throw new Error("Invalid plugin manifest: missing required fields");
    }
    // Check ABI compatibility
    if (!manifest.compatibleAbiVersions.includes(assemblrABI.version)) {
       console.warn(`[PluginManager] Warning: Plugin ${manifest.id} declares compatibility with ABI versions [${manifest.compatibleAbiVersions.join(", ")}], but current ABI is ${assemblrABI.version}.`);
    }
  }

  getPlugin(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  listPlugins(): PluginManifest[] {
    return Array.from(this.plugins.values()).map(p => p.manifest);
  }
}

export const pluginManager = new PluginManager();
