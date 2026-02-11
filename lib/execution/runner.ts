import { Trigger } from "@/lib/core/triggers";
import { executeToolAction } from "@/app/actions/execute-action";
import { ExecutionTracer } from "@/lib/observability/tracer";

export class TriggerRunner {
    async execute(trigger: Trigger, tracer: ExecutionTracer) {
        // 1. Validate Trigger State
        if (!trigger.enabled) {
            throw new Error("Trigger is disabled");
        }

        // 2. Validate tool version exists
        if (!trigger.bound_version_id) {
            throw new Error(
                `Trigger ${trigger.id} has no bound_version_id. ` +
                `Cannot execute trigger without a versioned tool.`
            );
        }

        // 3. Log and execute
        tracer.logActionExecution({
            actionId: "resolve_trigger_target",
            type: "system",
            inputs: { trigger },
            status: "success"
        });

        // 4. Execute the trigger action
        console.log(`[TriggerRunner] Executing trigger ${trigger.id} for tool ${trigger.tool_id} version ${trigger.bound_version_id}`);

        // TODO: Determine target action from trigger metadata
        // For now, we log execution. The trigger system will be extended
        // to resolve action IDs from trigger condition mappings.
        // When a real action ID resolver is implemented, uncomment:
        // const targetActionId = resolveTriggerAction(trigger);
        // await executeToolAction(trigger.tool_id, targetActionId, eventPayload, trigger.bound_version_id);
    }
}
