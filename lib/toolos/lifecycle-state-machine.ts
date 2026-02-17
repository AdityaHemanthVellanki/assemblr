/**
 * Lifecycle State Machine
 *
 * Central authority for tool lifecycle transitions.
 *
 * DB Constraint (from 20260210_lifecycle_states migration):
 * status IN ('CREATED', 'PLANNED', 'READY_TO_EXECUTE', 'EXECUTING', 'MATERIALIZED', 'FAILED')
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ToolLifecycleState =
    | "CREATED"
    | "PLANNED"
    | "READY_TO_EXECUTE"
    | "EXECUTING"
    | "MATERIALIZED"
    | "FAILED";

const LEGAL_TRANSITIONS: Record<ToolLifecycleState, ToolLifecycleState[]> = {
    CREATED: ["PLANNED", "EXECUTING", "MATERIALIZED", "FAILED"],
    PLANNED: ["READY_TO_EXECUTE", "EXECUTING", "FAILED"],
    READY_TO_EXECUTE: ["EXECUTING", "FAILED"],
    EXECUTING: ["MATERIALIZED", "FAILED"],
    MATERIALIZED: ["EXECUTING", "FAILED"], // Re-execution allowed
    FAILED: ["CREATED", "EXECUTING"], // Retry allowed
};

/**
 * Validate whether a transition is legal.
 * Throws if the transition is illegal.
 */
export function assertLegalTransition(
    from: ToolLifecycleState,
    to: ToolLifecycleState,
): void {
    const allowed = LEGAL_TRANSITIONS[from];
    if (!allowed || !allowed.includes(to)) {
        throw new Error(
            `Illegal lifecycle transition: ${from} → ${to}. Allowed from ${from}: [${(allowed || []).join(", ")}]`,
        );
    }
}

/**
 * Check if a state is terminal (no further transitions possible).
 */
export function isTerminalState(state: ToolLifecycleState): boolean {
    return state === "FAILED" || state === "MATERIALIZED";
}

/**
 * Check if a state allows execution.
 */
export function isExecutableState(state: ToolLifecycleState): boolean {
    return state === "READY_TO_EXECUTE" || state === "EXECUTING" || state === "MATERIALIZED";
}

/**
 * Atomically transition a tool's lifecycle state in the database.
 */
export async function transitionToolState(params: {
    toolId: string;
    to: ToolLifecycleState;
    errorMessage?: string;
    supabase?: ReturnType<typeof createSupabaseAdminClient>;
}): Promise<ToolLifecycleState> {
    const supabase = params.supabase ?? createSupabaseAdminClient();

    // 1. Read current state
    const { data: project, error: readError } = await (supabase.from("projects") as any)
        .select("id, status")
        .eq("id", params.toolId)
        .single();

    if (readError || !project) {
        throw new Error(`Cannot transition: project ${params.toolId} not found`);
    }

    const currentState = project.status as ToolLifecycleState;

    // 2. Validate transition
    assertLegalTransition(currentState, params.to);

    // 3. Build update payload
    const updatePayload: Record<string, any> = {
        status: params.to,
        updated_at: new Date().toISOString(),
    };

    if (params.to === "FAILED" && params.errorMessage) {
        updatePayload.error_message = params.errorMessage;
    }

    if (params.to === "MATERIALIZED") {
        updatePayload.lifecycle_done = true;
        updatePayload.finalized_at = new Date().toISOString();
    }

    // 4. Atomic update with status guard
    const { error: updateError } = await (supabase.from("projects") as any)
        .update(updatePayload)
        .eq("id", params.toolId)
        .eq("status", currentState);

    if (updateError) {
        throw new Error(
            `Failed to transition ${params.toolId} from ${currentState} to ${params.to}: ${updateError.message}`,
        );
    }

    console.log(`[Lifecycle] ${params.toolId}: ${currentState} → ${params.to}`);
    return params.to;
}

/**
 * Force-fail a tool.
 */
export async function forceFailTool(params: {
    toolId: string;
    errorMessage: string;
    supabase?: ReturnType<typeof createSupabaseAdminClient>;
}): Promise<void> {
    const supabase = params.supabase ?? createSupabaseAdminClient();

    const { error } = await (supabase.from("projects") as any)
        .update({
            status: "FAILED",
            error_message: params.errorMessage,
            lifecycle_done: true,
            updated_at: new Date().toISOString(),
        })
        .eq("id", params.toolId);

    if (error) {
        console.error(`[Lifecycle] Force-fail failed for ${params.toolId}:`, error);
    } else {
        console.log(`[Lifecycle] ${params.toolId}: FORCE → FAILED (${params.errorMessage})`);
    }
}

/**
 * Read the current lifecycle state of a tool.
 */
export async function getToolLifecycleState(params: {
    toolId: string;
    supabase?: ReturnType<typeof createSupabaseAdminClient>;
}): Promise<ToolLifecycleState | null> {
    const supabase = params.supabase ?? createSupabaseAdminClient();

    const { data } = await (supabase.from("projects") as any)
        .select("status")
        .eq("id", params.toolId)
        .single();

    return (data?.status as ToolLifecycleState) ?? null;
}
