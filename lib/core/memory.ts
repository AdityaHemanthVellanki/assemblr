import { Trigger } from "./triggers";

export type PersistentAgent = {
  id: string;
  tool_id: string;
  domain: string; // IntegrationId or "analysis"
  objectives: string[];
  triggers: Trigger[];
  memory_store_id: string;
};

export type MemoryItem = {
  id: string;
  agent_id: string;
  timestamp: string;
  type: "short_term" | "long_term";
  content: string;
  metadata?: any;
  version_id?: string;
};

export interface MemoryStore {
  add(item: Omit<MemoryItem, "id">): Promise<string>;
  query(agentId: string, query: string, limit?: number): Promise<MemoryItem[]>;
  getRecent(agentId: string, limit?: number): Promise<MemoryItem[]>;
}
