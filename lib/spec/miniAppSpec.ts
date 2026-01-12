import { z } from "zod";

export const miniAppEventSchema = z
  .object({
    type: z.enum([
      "onLoad", 
      "onUnload", 
      "onInterval",
      "onPageLoad", 
      "onComponentLoad", 
      "onChange", 
      "onClick", 
      "onSubmit"
    ]),
    actionId: z.string().min(1),
    args: z.record(z.string(), z.any()).optional(),
    // For onInterval
    intervalMs: z.number().optional(), 
  })
  .strict();

export const miniAppActionStepSchema = z
  .object({
    type: z.enum(["integration_call", "state_mutation", "navigation", "derive_state"]),
    config: z.record(z.string(), z.any()).default({}),
  })
  .strict();

export const miniAppActionSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(["integration_call", "state_mutation", "navigation", "derive_state", "workflow"]),
    config: z.record(z.string(), z.any()).optional(),
    steps: z.array(miniAppActionStepSchema).optional(),
    triggeredBy: z.discriminatedUnion("type", [
      z.object({ type: z.literal("lifecycle"), event: z.string() }),
      z.object({ type: z.literal("state_change"), stateKey: z.string() }),
      z.object({ type: z.literal("internal"), reason: z.enum(["derived", "orchestration"]) }),
    ]).optional(),
  })
  .passthrough();

export const miniAppComponentSchema: z.ZodType<any> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      type: z.string().min(1),
      label: z.string().optional(),
      properties: z.record(z.string(), z.any()).default({}),
      dataSource: z
        .object({
          type: z.enum(["static", "state", "expression"]),
          value: z.any(),
        })
        .optional(),
      events: z.array(miniAppEventSchema).optional(),
      children: z.array(miniAppComponentSchema).optional(),
      layout: z
        .object({
          w: z.number().optional(),
          h: z.number().optional(),
        })
        .optional(),
    })
    .passthrough(),
);

export const miniAppPageSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    layoutMode: z.enum(["grid", "stack"]).default("grid"),
    events: z.array(miniAppEventSchema).optional(),
    components: z.array(miniAppComponentSchema).default([]),
  })
  .passthrough();

export const miniAppLifecycleSchema = z.object({
  onLoad: z.array(miniAppEventSchema).optional(),
  onUnload: z.array(miniAppEventSchema).optional(),
  onInterval: z.array(miniAppEventSchema).optional(),
}).optional();

export const miniAppSpecSchema = z
  .object({
    kind: z.literal("mini_app"),
    title: z.string().min(1),
    description: z.string().optional(),
    pages: z.array(miniAppPageSchema).default([]),
    state: z.record(z.string(), z.any()).default({}),
    actions: z.array(miniAppActionSchema).default([]),
    lifecycle: miniAppLifecycleSchema,
    permissions: z.array(z.string()).optional(),
  })
  .passthrough();

export type MiniAppSpec = z.infer<typeof miniAppSpecSchema>;
