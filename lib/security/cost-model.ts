export type CapabilityCost = {
  baseCost: number; // Credits
};

const COST_REGISTRY: Record<string, CapabilityCost> = {
  // Metrics
  "metric_execution": { baseCost: 1 },
  
  // Actions
  "slack_message": { baseCost: 5 },
  "email_send": { baseCost: 5 },
  "github_issue": { baseCost: 10 },
  "linear_issue": { baseCost: 10 },
  
  // Queries
  "heavy_query": { baseCost: 10 },
};

export function estimateCost(type: string, params?: any): number {
  const model = COST_REGISTRY[type] || { baseCost: 1 };
  return model.baseCost;
}

export function estimateWorkflowCost(actions: Array<{ type: string }>): number {
  let total = 0;
  for (const action of actions) {
    // Map action type to registry key (e.g. "slack" -> "slack_message")
    const key = `${action.type}_message` in COST_REGISTRY ? `${action.type}_message` : 
                `${action.type}_issue` in COST_REGISTRY ? `${action.type}_issue` : 
                "metric_execution"; // Default fallback
    
    total += estimateCost(key);
  }
  return total;
}
