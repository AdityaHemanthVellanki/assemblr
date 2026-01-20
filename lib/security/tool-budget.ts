import { loadMemory, saveMemory, MemoryScope } from "@/lib/toolos/memory-store";

export type ToolBudget = {
  monthlyLimit: number;
  perRunLimit: number;
};

export type ToolBudgetUsage = {
  monthKey: string;
  tokensUsed: number;
};

export class BudgetExceededError extends Error {
  limitType: "monthly" | "per_run";
  constructor(limitType: "monthly" | "per_run", message: string) {
    super(message);
    this.limitType = limitType;
  }
}

const DEFAULT_BUDGET: ToolBudget = {
  monthlyLimit: 200000,
  perRunLimit: 20000,
};

export async function getToolBudget(orgId: string, toolId: string) {
  const scope: MemoryScope = { type: "tool_org", toolId, orgId };
  const budget = await loadMemory({
    scope,
    namespace: "tool_builder",
    key: "token_budget",
  });
  return { ...DEFAULT_BUDGET, ...(budget ?? {}) } as ToolBudget;
}

export async function getToolBudgetUsage(orgId: string, toolId: string) {
  const scope: MemoryScope = { type: "tool_org", toolId, orgId };
  const usage = await loadMemory({
    scope,
    namespace: "tool_builder",
    key: "token_usage",
  });
  const monthKey = getMonthKey(new Date());
  if (!usage || usage.monthKey !== monthKey) {
    return { monthKey, tokensUsed: 0 } as ToolBudgetUsage;
  }
  return usage as ToolBudgetUsage;
}

export async function updateToolBudget(
  orgId: string,
  toolId: string,
  patch: Partial<ToolBudget>,
) {
  const current = await getToolBudget(orgId, toolId);
  const next = { ...current, ...patch };
  const scope: MemoryScope = { type: "tool_org", toolId, orgId };
  await saveMemory({
    scope,
    namespace: "tool_builder",
    key: "token_budget",
    value: next,
  });
  return next;
}

export async function consumeToolBudget(params: {
  orgId: string;
  toolId: string;
  tokens: number;
  runTokens: number;
}) {
  const { orgId, toolId, tokens, runTokens } = params;
  const budget = await getToolBudget(orgId, toolId);
  if (budget.perRunLimit > 0 && runTokens > budget.perRunLimit) {
    throw new BudgetExceededError("per_run", "Per-run token budget exceeded");
  }
  const usage = await getToolBudgetUsage(orgId, toolId);
  const nextUsage = { ...usage, tokensUsed: usage.tokensUsed + tokens };
  if (budget.monthlyLimit > 0 && nextUsage.tokensUsed > budget.monthlyLimit) {
    throw new BudgetExceededError("monthly", "Monthly token budget exceeded");
  }
  const scope: MemoryScope = { type: "tool_org", toolId, orgId };
  await saveMemory({
    scope,
    namespace: "tool_builder",
    key: "token_usage",
    value: nextUsage,
  });
  return { budget, usage: nextUsage };
}

function getMonthKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
