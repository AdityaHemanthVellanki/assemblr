
import { pluginManager } from "./manager";
import { SystemCorePlugin } from "./system-core";

let coreLoaded = false;

export async function ensureCorePluginsLoaded() {
  if (coreLoaded) return;

  console.log("[PluginLoader] Loading core plugins...");

  // 1. System Core (Legacy Integrations Bridge)
  // const systemCore = new SystemCorePlugin(); // Already loaded above? No, I pasted it twice in previous step.
  // Actually, I should just have one block.

  if (!coreLoaded) {
    const systemCore = new SystemCorePlugin();
    await pluginManager.loadPlugin(systemCore);
  }

  coreLoaded = true;
}
