
import { pluginManager } from "./manager";
import { SystemCorePlugin } from "./system-core";
import { GitHubPlugin } from "@/lib/integrations/plugins/github";

let coreLoaded = false;

export async function ensureCorePluginsLoaded() {
  if (coreLoaded) return;
  
  console.log("[PluginLoader] Loading core plugins...");
  
  // 1. System Core (Legacy Integrations Bridge)
  const systemCore = new SystemCorePlugin();
  await pluginManager.loadPlugin(systemCore);

  // 2. GitHub Integration (Refactored Plugin)
  const githubPlugin = new GitHubPlugin();
  await pluginManager.loadPlugin(githubPlugin);

  coreLoaded = true;
}
