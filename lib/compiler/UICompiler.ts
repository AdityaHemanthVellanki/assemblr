import { createHash } from "crypto";
import { Intent } from "@/lib/intent/IntentSchema";

export interface CompiledUI {
  type: "table" | "list" | "card" | "text";
  componentId: string;
  dataKey: string;
  fields?: string[];
}

export function compileUI(input: {
  intent: Intent;
  orgId: string;
  toolId: string;
  dataKey: string;
}): CompiledUI {
  const { intent, orgId, toolId, dataKey } = input;
  const hash = createHash("sha256")
    .update(`${orgId}:${toolId}:${intent.presentation.type}`)
    .digest("hex");
  return {
    type: intent.presentation.type,
    componentId: hash,
    dataKey,
    fields: intent.presentation.fields,
  };
}
