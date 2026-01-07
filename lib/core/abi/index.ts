
import { AssemblrABI } from "./types";
import { IntegrationRegistry } from "../registry/integrations";
import { CapabilityRegistry } from "../registry/capabilities";
import { AgentRegistry } from "../registry/agents";
import { UIRegistry } from "../registry/ui";
import { ExecutionRegistry } from "../registry/execution";

class AssemblrABIImpl implements AssemblrABI {
  version = "1.0.0";
  integrations = new IntegrationRegistry();
  capabilities = new CapabilityRegistry();
  agents = new AgentRegistry();
  ui = new UIRegistry();
  execution = new ExecutionRegistry();
}

export const assemblrABI = new AssemblrABIImpl();
