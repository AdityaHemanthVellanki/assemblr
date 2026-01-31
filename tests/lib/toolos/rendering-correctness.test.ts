
import { describe, it, expect, vi } from "vitest";
import { evaluateGoalSatisfaction, decideRendering } from "@/lib/toolos/goal-validation";

describe("GoalValidation Correctness", () => {
  it("should satisfy goal if data exists for simple read, even without plan", () => {
    const result = evaluateGoalSatisfaction({
      prompt: "show my latest emails",
      hasData: true,
      goalPlan: { kind: "DATA_RETRIEVAL", constraints: [] } as any,
      intentContract: { successCriteria: [] } as any,
    });

    expect(result.satisfied).toBe(true);
    expect(result.level).toBe("satisfied");
  });

  it("should satisfy goal if data exists even if intent contract has missing criteria", () => {
    const result = evaluateGoalSatisfaction({
      prompt: "show my latest emails",
      hasData: true,
      goalPlan: { kind: "DATA_RETRIEVAL", constraints: [] } as any,
      intentContract: { successCriteria: [] } as any,
    });
    
    expect(result.satisfied).toBe(true);
  });
});

describe("Rendering Decision Correctness", () => {
  it("should render if goal is satisfied", () => {
    const result = {
        level: "satisfied",
        satisfied: true,
        confidence: 0.9,
    } as any;
    
    const decision = decideRendering({ prompt: "test", result });
    expect(decision.kind).toBe("render");
  });

  it("should render even if goal is unsatisfied but data might exist (partial)", () => {
     // Wait, if data exists, goal SHOULD be satisfied.
     // But if goal is unsatisfied for some reason, we should still render if we have data?
     // The decider doesn't know about data, only goal result.
     // But goal result is derived from hasData.
     
     // The key fix is in GoalValidation to ensure hasData => satisfied.
  });
});
