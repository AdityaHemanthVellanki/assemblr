
import { describe, it, expect } from "vitest";
import { evaluateGoalSatisfaction, decideRendering } from "@/lib/toolos/goal-validation";

describe("Goal Validation Logic", () => {
  it("should satisfy DATA_RETRIEVAL goal when data is present", () => {
    const result = evaluateGoalSatisfaction({
      prompt: "show my latest emails",
      goalPlan: {
        kind: "DATA_RETRIEVAL",
        primary_goal: "Show latest emails",
        sub_goals: [],
        constraints: [],
        derived_entities: [],
      },
      hasData: true,
      evidence: {
        failed_commits: 0,
        failure_incidents: 0,
        related_emails: 5,
        total_emails: 5
      }
    });

    expect(result.satisfied).toBe(true);
    expect(result.level).toBe("satisfied");
    expect(result.confidence).toBe(1.0);
  });

  it("should satisfy goal with missing plan if data is present (implicit retrieval)", () => {
    const result = evaluateGoalSatisfaction({
      prompt: "show my latest emails",
      goalPlan: undefined, // No plan
      hasData: true,
      evidence: {
        failed_commits: 0,
        failure_incidents: 0,
        related_emails: 5,
        total_emails: 5
      }
    });

    expect(result.satisfied).toBe(true);
    expect(result.level).toBe("satisfied");
    expect(result.confidence).toBe(1.0);
  });

  it("should NOT satisfy goal if data is missing", () => {
    const result = evaluateGoalSatisfaction({
      prompt: "show my latest emails",
      goalPlan: {
        kind: "DATA_RETRIEVAL",
        primary_goal: "Show latest emails",
        sub_goals: [],
        constraints: [],
        derived_entities: [],
      },
      hasData: false, // No data
      evidence: {
        failed_commits: 0,
        failure_incidents: 0,
        related_emails: 0,
        total_emails: 0
      }
    });

    expect(result.satisfied).toBe(false);
    // Should be unsatisfied or partial depending on logic, but definitely not satisfied
    expect(result.level).not.toBe("satisfied");
  });

  it("should satisfy implicit retrieval even with missing success criteria", () => {
     const result = evaluateGoalSatisfaction({
      prompt: "show my latest emails",
      intentContract: {
          action: "show",
          entity: "emails",
          successCriteria: [], // Missing
          forbiddenOutputs: []
      } as any,
      hasData: true
    });

    expect(result.satisfied).toBe(true);
    expect(result.level).toBe("satisfied");
  });
});

describe("Rendering Decision Logic", () => {
  it("should render if goal is satisfied", () => {
    const decision = decideRendering({
      prompt: "show my latest emails",
      result: {
        level: "satisfied",
        satisfied: true,
        confidence: 1.0,
      }
    });

    expect(decision.kind).toBe("render");
    expect(decision.partial).toBeUndefined(); // Or false, depending on impl
  });

  it("should render partial if data exists but confidence is low (ambiguous)", () => {
      const decision = decideRendering({
      prompt: "show my latest emails",
      result: {
        level: "unsatisfied",
        satisfied: false,
        confidence: 0.5,
        absence_reason: "ambiguous_query"
      }
    });

    expect(decision.kind).toBe("render");
    expect(decision.partial).toBe(true);
    expect(decision.explanation).toContain("Assumptions were applied");
  });

  it("should ask for clarification if contradictory", () => {
      const decision = decideRendering({
      prompt: "show builds that failed but not failed",
      result: {
        level: "unsatisfied",
        satisfied: false,
        confidence: 0.5,
        absence_reason: "ambiguous_query"
      }
    });

    expect(decision.kind).toBe("ask");
    expect(decision.question).toBeDefined();
  });
});
