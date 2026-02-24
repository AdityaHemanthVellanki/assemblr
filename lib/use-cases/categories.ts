import type { IntegrationId, ToolSystemSpec } from "@/lib/toolos/spec";

export type UseCaseCategory =
  | "Engineering"
  | "Finance"
  | "Sales"
  | "Marketing"
  | "HR"
  | "Operations & Support";

export type UseCaseTrigger = "Prompt-based" | "Event-based" | "Time-based";
export type UseCaseOutput = "Table" | "Summary" | "Alert" | "Document";

export type UseCaseDefinition = {
  id: string;
  name: string;
  description: string;
  category: UseCaseCategory;
  integrations: IntegrationId[];
  trigger: UseCaseTrigger;
  output: UseCaseOutput;
  prompt: string;
  spec: ToolSystemSpec;
};

export const useCaseCategories: UseCaseCategory[] = [
  "Engineering",
  "Finance",
  "Sales",
  "Marketing",
  "HR",
  "Operations & Support",
];
