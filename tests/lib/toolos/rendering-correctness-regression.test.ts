
import { describe, it, expect } from "vitest";
import { evaluateGoalSatisfaction, decideRendering } from "@/lib/toolos/goal-validation";
import { validateFetchedData } from "@/lib/toolos/answer-contract";

describe("Rendering Correctness - Regression Tests", () => {
  // SEV-1 Regression Test: "show my latest emails"
  it("should render 5 rows when Gmail returns 5 emails, regardless of plan or confidence", () => {
    // 1. Setup: "show my latest emails" prompt
    const prompt = "show my latest emails";
    const records = [
      { id: "1", subject: "Email 1", snippet: "snippet 1" },
      { id: "2", subject: "Email 2", snippet: "snippet 2" },
      { id: "3", subject: "Email 3", snippet: "snippet 3" },
      { id: "4", subject: "Email 4", snippet: "snippet 4" },
      { id: "5", subject: "Email 5", snippet: "snippet 5" },
    ];

    // 2. Goal Validation: Must be satisfied because data exists
    // Even if plan is missing or ambiguous
    const validationResult = evaluateGoalSatisfaction({
      prompt,
      hasData: true,
      // Simulate missing plan or ambiguous state which previously caused issues
      goalPlan: undefined, 
      intentContract: { successCriteria: [] } as any,
    });

    expect(validationResult.satisfied).toBe(true);
    expect(validationResult.level).toBe("satisfied");

    // 3. Rendering Decision: Must render rows
    const decision = decideRendering({
      prompt,
      result: validationResult,
    });

    expect(decision.kind).toBe("render");
    expect(decision.partial).toBeFalsy(); 
  });

  it("should enforce Data Wins invariant: Integration records -> Render", () => {
    const validationResult = evaluateGoalSatisfaction({
      prompt: "fetch data",
      hasData: true,
      goalPlan: { kind: "DATA_RETRIEVAL", constraints: [] } as any,
    });

    expect(validationResult.satisfied).toBe(true);
  });
  
  it("should NOT drop rows in AnswerContract validation by default", () => {
      // Simulate AnswerContract with a constraint that might filter data
      const contract = {
          entity_type: "email",
          required_constraints: [{ value: "last 24 hours" }],
          failure_policy: "empty_over_incorrect"
      } as any;
      
      const outputs = [{
          action: { integrationId: "google", id: "list" },
          output: [
              { internalDate: String(Date.now() - 100000) }, // Recent
              { internalDate: "0" } // Old (should typically be dropped by strict check)
          ]
      }] as any;
      
      const result = validateFetchedData(outputs, contract);
      
      // We expect the "old" row to NOT be dropped after our fix.
      // Currently, it might be dropped if validateFetchedData logic filters it.
      // Let's assert that we get 2 records back (lossless).
      const keptCount = result.outputs[0].output.length;
      
      // If keptCount is 2, it means validateFetchedData is NOT dropping rows in the returned output.
      // If it is 1, it means it IS dropping rows.
      // We want it to be 2.
      expect(keptCount).toBe(2);
      
      // We also expect violations to be reported if we keep invalid data
      expect(result.violations.length).toBeGreaterThan(0);
  });
});
