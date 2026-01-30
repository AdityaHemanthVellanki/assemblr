// import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OrgBudget = {
  orgId: string;
  dailyLimit: number;
  monthlyLimit: number;
  usedToday: number;
  usedThisMonth: number;
};

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

export async function getBudget(orgId: string): Promise<OrgBudget> {
  const supabase = await createSupabaseServerClient();
  
  // @ts-ignore
  const { data: fetchedData } = await (supabase.from("org_budgets") as any)
    .select()
    .eq("org_id", orgId)
    .single();
  let data = fetchedData;

  if (!data) {
    // Create default budget
    // @ts-ignore
    const insert = await (supabase.from("org_budgets") as any)
      .insert({ org_id: orgId })
      .select()
      .single();
    
    if (insert.error) throw new Error("Failed to create budget");
    data = insert.data;
  }

  return mapRowToBudget(data);
}

export async function checkAndConsumeBudget(orgId: string, cost: number) {
  const supabase = await createSupabaseServerClient();
  const budget = await getBudget(orgId);

  // Check Limits
  if (budget.usedToday + cost > budget.dailyLimit) {
    throw new BudgetExceededError(`Daily budget exceeded. Used: ${budget.usedToday}/${budget.dailyLimit}, Cost: ${cost}`);
  }
  if (budget.usedThisMonth + cost > budget.monthlyLimit) {
    throw new BudgetExceededError(`Monthly budget exceeded. Used: ${budget.usedThisMonth}/${budget.monthlyLimit}, Cost: ${cost}`);
  }

  // Consume
  // @ts-ignore
  const { error } = await (supabase.from("org_budgets") as any)
    .update({
      used_today: budget.usedToday + cost,
      used_this_month: budget.usedThisMonth + cost,
    })
    .eq("org_id", orgId);

  if (error) throw new Error(`Failed to update budget: ${error.message}`);
}

function mapRowToBudget(row: any): OrgBudget {
  return {
    orgId: row.org_id,
    dailyLimit: row.daily_limit,
    monthlyLimit: row.monthly_limit,
    usedToday: row.used_today,
    usedThisMonth: row.used_this_month,
  };
}
