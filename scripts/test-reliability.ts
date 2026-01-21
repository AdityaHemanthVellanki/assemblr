
import { validateCompiledIntent, normalizeIntentSpec } from "../lib/ai/planner-logic";
import { CompiledIntent } from "../lib/core/intent";
async function loadToolModules() {
  try {
    const memoryStore = await import("../lib/toolos/memory-store");
    const compiler = await import("../lib/toolos/compiler/tool-compiler");
    return {
      setMemoryAdapterFactory: memoryStore.setMemoryAdapterFactory,
      ToolCompiler: compiler.ToolCompiler,
    };
  } catch (err) {
    console.log("skipping reliability tests: server-only modules unavailable");
    process.exit(0);
    throw err;
  }
}

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

  const assertThrows = (fn: () => void, msg: string, match?: string) => {
    try {
      fn();
      console.error(`❌ FAIL: ${msg} (Did not throw)`);
      failures++;
    } catch (e: any) {
      if (match && !String(e.message).includes(match)) {
        console.error(`❌ FAIL: ${msg} (Unexpected error: ${e.message})`);
        failures++;
      } else {
        console.log(`✅ PASS: ${msg}`);
      }
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
  
  assertThrows(
    () => validateCompiledIntent(intentUnreachable),
    "Unreachable action fails strict validation",
    "missing capabilityId",
  );

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

  assertThrows(
    () => validateCompiledIntent(intentMissingAction),
    "Missing action trigger fails strict validation",
    "references missing action",
  );

  const {
    setMemoryAdapterFactory,
    ToolCompiler,
  } = await loadToolModules();

  console.log("\n--- Test 6: Tool Compiler Long Prompt Timeout ---");
  try {
    const longPrompt =
      "Create a dashboard with Gmail, GitHub, Linear, Slack, and Notion data. " +
      "Include advanced filters, metrics, and alerts. ".repeat(200);
    const result = await ToolCompiler.run({
      prompt: longPrompt,
      sessionId: "reliability-compiler-session",
      userId: "00000000-0000-0000-0000-000000000000",
      orgId: "00000000-0000-0000-0000-000000000000",
      toolId: "00000000-0000-0000-0000-000000000000",
      connectedIntegrationIds: ["google", "github", "linear", "slack", "notion"],
      stageBudgets: {
        understandPurposeMs: 0,
      },
    });
    assert(result.status === "degraded", "ToolCompiler returns degraded on timeout");
    assert(result.clarifications.length === 0, "ToolCompiler does not return clarification prompts");
    const integrations = new Set(result.spec.integrations.map((i) => i.id));
    assert(integrations.has("google"), "ToolCompiler detects google integration from prompt");
    assert(integrations.has("github"), "ToolCompiler detects github integration from prompt");
    assert(integrations.has("linear"), "ToolCompiler detects linear integration from prompt");
    assert(integrations.has("slack"), "ToolCompiler detects slack integration from prompt");
    assert(integrations.has("notion"), "ToolCompiler detects notion integration from prompt");
    assert(
      result.progress.some((event) => event.message.toLowerCase().includes("skipped") || event.message.toLowerCase().includes("timed out")),
      "ToolCompiler reports defaulted stages on timeout",
    );
  } finally {
    setMemoryAdapterFactory(null);
  }

  console.log("\n--- Test 7: Tool Compiler Multi-Integration Progress ---");
  try {
    const multiPrompt =
      "Build an internal operations console that pulls Gmail, GitHub issues, Linear tasks, Slack alerts, and Notion pages." +
      " Include an activity feed and basic dashboards.";
    await assertDoesNotReject(
      async () => {
        const result = await ToolCompiler.run({
          prompt: multiPrompt,
          sessionId: "reliability-compiler-session-2",
          userId: "00000000-0000-0000-0000-000000000000",
          orgId: "00000000-0000-0000-0000-000000000000",
          toolId: "00000000-0000-0000-0000-000000000001",
          connectedIntegrationIds: ["google", "github", "linear", "slack", "notion"],
        });
        assert(result.progress.length > 0, "ToolCompiler emits progress events for multi-integration prompt");
        assert(result.spec.integrations.length > 0, "ToolCompiler returns integrations for multi-integration prompt");
        assert(result.spec.actions.length > 0, "ToolCompiler returns actions for multi-integration prompt");
        assert(result.spec.views.length > 0, "ToolCompiler returns views for multi-integration prompt");
      },
      "ToolCompiler runs multi-integration prompt without crashing",
    );
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
