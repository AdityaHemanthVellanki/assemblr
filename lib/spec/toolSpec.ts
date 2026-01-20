import { ToolSystemSpecSchema, type ToolSystemSpec } from "@/lib/toolos/spec";

export type ToolSpec = ToolSystemSpec;

export function parseToolSpec(input: unknown): ToolSpec {
  return ToolSystemSpecSchema.parse(input);
}
