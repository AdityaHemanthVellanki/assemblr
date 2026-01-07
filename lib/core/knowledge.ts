export type ToolDependency = {
  from_tool_id: string;
  to_tool_id: string;
  data_shared: string[]; // Field names or schema refs
  trigger_conditions: string; // Description
};

export type SharedKnowledge = {
  id: string;
  org_id: string;
  entity_type: string;
  embeddings: number[];
  usage_frequency: number;
  confidence: number;
  content: any; // The actual knowledge snippet (e.g. "User table joins with Orders on user_id")
};

export type FeedbackItem = {
  id: string;
  tool_id: string;
  version_id: string;
  type: "explicit" | "implicit";
  signal: "positive" | "negative";
  comment?: string;
  created_at: string;
};
