// ─── Re-export types and constants from categories ───────────────────────────
export type { UseCaseCategory, UseCaseTrigger, UseCaseOutput, UseCaseDefinition } from "./categories";
export { useCaseCategories } from "./categories";

// ─── Re-export buildSpec from its own module (avoids circular imports) ───────
export { buildSpec } from "./build-spec";

// ─── Import and merge all category use cases ─────────────────────────────────
import type { UseCaseDefinition } from "./categories";
import { engineeringUseCases } from "./use-cases/engineering";
import { financeUseCases } from "./use-cases/finance";
import { salesUseCases } from "./use-cases/sales";
import { marketingUseCases } from "./use-cases/marketing";
import { hrUseCases } from "./use-cases/hr";
import { operationsSupportUseCases } from "./use-cases/operations-support";

export const useCases: UseCaseDefinition[] = [
  ...engineeringUseCases,
  ...financeUseCases,
  ...salesUseCases,
  ...marketingUseCases,
  ...hrUseCases,
  ...operationsSupportUseCases,
];
