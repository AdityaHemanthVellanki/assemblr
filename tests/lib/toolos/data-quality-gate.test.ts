
import { describe, it, expect } from "vitest";
import { validateFetchedData } from "@/lib/toolos/answer-contract";

describe("Data Quality Gate (answer-contract)", () => {
  const mockAction = { id: "action_1", integrationId: "google", name: "list_emails" } as any;

  it("should filter emails by 'last 24 hours' constraint", () => {
    const now = Date.now();
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(now - 48 * 60 * 60 * 1000).toISOString();

    const outputs = [
      {
        action: mockAction,
        output: [
          { subject: "New Email", date: oneHourAgo, snippet: "Hello" },
          { subject: "Old Email", date: twoDaysAgo, snippet: "Hi" },
        ],
      },
    ];

    const contract = {
      entity_type: "email",
      required_constraints: [{ value: "last 24 hours" }],
    } as any;

    const result = validateFetchedData(outputs, contract);
    
    // Should drop the old email
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].dropped).toBe(1);
    expect(result.violations[0].actionId).toBe("action_1");
  });

  it("should pass all emails if they match 'last 24 hours'", () => {
    const now = Date.now();
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();

    const outputs = [
      {
        action: mockAction,
        output: [
          { subject: "New Email 1", date: oneHourAgo, snippet: "Hello" },
          { subject: "New Email 2", date: oneHourAgo, snippet: "Hi" },
        ],
      },
    ];

    const contract = {
      entity_type: "email",
      required_constraints: [{ value: "last 24 hours" }],
    } as any;

    const result = validateFetchedData(outputs, contract);
    
    expect(result.violations).toHaveLength(0);
  });

  it("should filter by keyword constraint (regression)", () => {
    const outputs = [
      {
        action: mockAction,
        output: [
          { subject: "Meeting Update", date: new Date().toISOString(), snippet: "Important" },
          { subject: "Lunch", date: new Date().toISOString(), snippet: "Food" },
        ],
      },
    ];

    const contract = {
      entity_type: "email",
      required_constraints: [{ value: "Meeting" }],
    } as any;

    const result = validateFetchedData(outputs, contract);
    
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].dropped).toBe(1);
  });

  it("should handle 'newer_than' syntax", () => {
    const now = Date.now();
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(now - 48 * 60 * 60 * 1000).toISOString();

    const outputs = [
      {
        action: mockAction,
        output: [
          { subject: "New", date: oneHourAgo },
          { subject: "Old", date: twoDaysAgo },
        ],
      },
    ];

    const contract = {
      entity_type: "email",
      required_constraints: [{ value: "newer_than:1d" }],
    } as any;

    const result = validateFetchedData(outputs, contract);
    
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].dropped).toBe(1);
  });
});
