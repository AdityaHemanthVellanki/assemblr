import { z } from "zod";

import { requireOrgMember, requireProjectOrgAccess, requireRole } from "@/lib/auth/permissions.server";
import { getToolBudget, getToolBudgetUsage, updateToolBudget } from "@/lib/security/tool-budget";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

const patchSchema = z.object({
  monthlyLimit: z.number().optional(),
  perRunLimit: z.number().optional(),
});

const COST_PER_1K_TOKENS = 0.01;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    await requireProjectOrgAccess(ctx, toolId);
    const budget = await getToolBudget(ctx.orgId, toolId);
    const usage = await getToolBudgetUsage(ctx.orgId, toolId);
    const costEstimate = (usage.tokensUsed / 1000) * COST_PER_1K_TOKENS;
    const projected = estimateProjectedTokens(usage.tokensUsed);
    const projectedCost = (projected / 1000) * COST_PER_1K_TOKENS;
    return jsonResponse({
      budget,
      usage,
      costEstimate,
      projectedMonthlyTokens: projected,
      projectedMonthlyCost: projectedCost,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireRole("editor");
    await requireProjectOrgAccess(ctx, toolId);
    const json = await req.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return errorResponse("Invalid body", 400);
    }
    const budget = await updateToolBudget(ctx.orgId, toolId, parsed.data);
    return jsonResponse({ budget });
  } catch (e) {
    return handleApiError(e);
  }
}

function estimateProjectedTokens(tokensUsed: number) {
  const now = new Date();
  const day = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  if (day <= 0) return tokensUsed;
  return Math.round((tokensUsed / day) * daysInMonth);
}
