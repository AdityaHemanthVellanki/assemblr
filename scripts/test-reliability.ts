
import { validateCompiledIntent, normalizeIntentSpec } from "../lib/ai/planner-logic";
import { CompiledIntent } from "../lib/core/intent";
import { loadMemory, saveMemory, setMemoryAdapterFactory } from "../lib/toolos/memory-store";
import { MemoryAdapterError, createFallbackMemoryAdapter } from "../lib/toolos/memory/memory-adapter";
import { createEphemeralMemoryAdapter } from "../lib/toolos/memory/ephemeral-memory";

async function runTests() {
  console.log("Running Reliability Tests...");
  let failures = 0;

  const assert = (condition: boolean, msg: string) => {
    if (!condition) {
      console.error(`❌ FAIL: ${msg}`);
      failures++;
    } else {
      console.log(`✅ PASS: ${msg}`);
    }
  };

  const assertDoesNotThrow = (fn: () => void, msg: string) => {
    try {
      fn();
      console.log(`✅ PASS: ${msg}`);
    } catch (e: any) {
      console.error(`❌ FAIL: ${msg} (Threw: ${e.message})`);
      failures++;
    }
  };

  const assertDoesNotReject = async (fn: () => Promise<void>, msg: string) => {
    try {
      await fn();
      console.log(`✅ PASS: ${msg}`);
    } catch (e: any) {
      console.error(`❌ FAIL: ${msg} (Threw: ${e.message})`);
      failures++;
    }
  };

  // Test 1: Spec Normalization (Derivations Array -> Object)
  console.log("\n--- Test 1: Spec Normalization ---");
  const intentMalformed: CompiledIntent = {
    intent_type: "modify",
    system_goal: "test",
    tool_mutation: {
      stateAdded: {
        __derivations: [
          { target: "d1", source: "s1", op: "filter" }
        ]
      }
    }
  } as any;

  normalizeIntentSpec(intentMalformed);
  const defs = (intentMalformed.tool_mutation as any).stateAdded.__derivations;
  assert(!Array.isArray(defs), "Derivations converted to object");
  assert(defs.d1.target === "d1", "Derivation d1 preserved");

  // Test 2: Execution Graph Injection
  console.log("\n--- Test 2: Execution Graph Injection ---");
  const intentNoGraph: CompiledIntent = {
    intent_type: "modify",
    tool_mutation: {}
  } as any;
  normalizeIntentSpec(intentNoGraph);
  assert(!!intentNoGraph.execution_graph, "Execution graph injected");
  assert(Array.isArray(intentNoGraph.execution_graph!.nodes), "Nodes array initialized");

  // Test 3: Validation Error Suppression (Unreachable Action)
  console.log("\n--- Test 3: Validation Error Suppression ---");
  const intentUnreachable: CompiledIntent = {
    intent_type: "modify",
    tool_mutation: {
      actionsAdded: [{ id: "orphan", type: "integration_call" }]
    },
    execution_graph: { nodes: [], edges: [] }
  } as any;
  
  // Should NOT throw
  assertDoesNotThrow(() => validateCompiledIntent(intentUnreachable), "Unreachable action triggers warning, not throw");

  // Test 4: Validation Error Suppression (Missing Trigger Action)
  console.log("\n--- Test 4: Missing Trigger Suppression ---");
  const intentMissingAction: CompiledIntent = {
    intent_type: "modify",
    tool_mutation: {
      pagesAdded: [{
        id: "p1",
        events: [{ type: "onPageLoad", actionId: "ghost_action" }]
      }]
    },
    execution_graph: { nodes: [], edges: [] }
  } as any;

  assertDoesNotThrow(() => validateCompiledIntent(intentMissingAction), "Missing action trigger triggers warning, not throw");

  console.log("\n--- Test 5: Memory Fallback on Missing Session Table ---");
  setMemoryAdapterFactory(async () => {
    const fallback = createEphemeralMemoryAdapter();
    const primary = {
      async get() {
        throw new MemoryAdapterError("missing_table", "missing session_memory", { table: "session_memory" });
      },
      async set() {
        throw new MemoryAdapterError("missing_table", "missing session_memory", { table: "session_memory" });
      },
      async delete() {
        throw new MemoryAdapterError("missing_table", "missing session_memory", { table: "session_memory" });
      },
    };
    return createFallbackMemoryAdapter({ primary, fallback, initialPrimaryAvailable: true });
  });

  try {
    const scope = { type: "session" as const, sessionId: "reliability-session" };
    await assertDoesNotReject(
      () =>
        saveMemory({
          scope,
          namespace: "reliability",
          key: "fallback",
          value: "ok",
        }),
      "Memory save falls back when session_memory missing",
    );
    const value = await loadMemory({
      scope,
      namespace: "reliability",
      key: "fallback",
    });
    assert(value === "ok", "Fallback memory persists when session_memory missing");
  } finally {
    setMemoryAdapterFactory(null);
  }

  if (failures === 0) {
    console.log("\n🎉 ALL RELIABILITY TESTS PASSED");
    process.exit(0);
  } else {
    console.error(`\n❌ ${failures} TESTS FAILED`);
    process.exit(1);
  }
}

runTests().catch(e => console.error(e));
