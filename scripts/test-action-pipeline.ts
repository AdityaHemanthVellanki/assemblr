
import { validateCompiledIntent, repairCompiledIntent, buildExecutionGraph } from "../lib/ai/planner-logic";
import { normalizeActionId } from "../lib/spec/action-id";
import { ActionRegistry } from "../lib/spec/action-registry";
import { MiniAppStore } from "../components/miniapp/runtime";
import { CompiledIntent } from "../lib/core/intent";
import { MiniAppSpec } from "../lib/spec/miniAppSpec";
import { materializeSpec } from "../lib/spec/materializer";

async function runTests() {
  console.log("Running Action Pipeline Tests...");
  let failures = 0;

  const assert = (condition: boolean, msg: string) => {
    if (!condition) {
      console.error(`❌ FAIL: ${msg}`);
      failures++;
    } else {
      console.log(`✅ PASS: ${msg}`);
    }
  };

  const assertThrows = (fn: () => void, msg: string) => {
    try {
      fn();
      console.error(`❌ FAIL: ${msg} (Did not throw)`);
      failures++;
    } catch (e: any) {
      console.log(`✅ PASS: ${msg} (Threw: ${e.message})`);
    }
  };

  // Test 1: Normalization Logic
  console.log("\n--- Test 1: Normalization Logic ---");
  assert(normalizeActionId("fetch-github-activity") === "fetch_github_activity", "kebab -> snake");
  assert(normalizeActionId("fetchGitHubActivity") === "fetchgithubactivity", "camel -> lower"); // My util lowers everything
  assert(normalizeActionId("Fetch Data") === "fetch_data", "spaces -> snake");

  // Test 2: Strict Mode Validation (Missing Action)
  console.log("\n--- Test 2: Strict Mode Validation ---");
  const intentMissingAction: CompiledIntent = {
    intent_type: "modify",
    system_goal: "test",
    constraints: [],
    integrations_required: [],
    output_mode: "mini_app",
    execution_graph: { nodes: [], edges: [] },
    execution_policy: { deterministic: true, parallelizable: false, retries: 0 },
    tool_mutation: {
      pagesUpdated: [{
        pageId: "p1",
        patch: {
          events: [{ type: "onPageLoad", actionId: "missing_action" }]
        }
      }]
    },
    outcome: "success"
  } as any;
  try {
    validateCompiledIntent(intentMissingAction);
    console.log("✅ PASS: Trigger references missing action do not crash validation");
  } catch (e: any) {
    console.error(`❌ FAIL: Trigger references missing action (Threw: ${e.message})`);
    failures++;
  }

  // Test 2b: Strict Mode (Lifecycle references missing action)
  const intentMissingLifecycleAction: CompiledIntent = {
    intent_type: "modify",
    system_goal: "test",
    constraints: [],
    integrations_required: [],
    output_mode: "mini_app",
    execution_graph: { nodes: [], edges: [] },
    execution_policy: { deterministic: true, parallelizable: false, retries: 0 },
    tool_mutation: {
        toolPropsUpdated: { title: "Test" },
    },
    outcome: "success"
  } as any;
  // Note: validateCompiledIntent mostly checks what's IN the mutation. 
  // If we want to test materializer validation, we should call materializeSpec.

  // Test 2c: Materializer Validation
  console.log("\n--- Test 2c: Materializer Validation ---");
  const baseSpec = { kind: "mini_app", title: "Test", pages: [], actions: [], state: {} };
  const mutationWithBadLifecycle: any = { // ToolMutation type
      // We can't easily inject lifecycle via standard ToolMutation unless we use a backdoor or if ToolMutation supports it.
      // Wait, ToolMutation doesn't have 'lifecycleUpdated'. It's missing from the type definition in materializer.ts snippet I saw.
      // If the user wants lifecycle updates, they usually come via... where?
      // Checking miniAppSpec.ts, lifecycle is part of the spec.
      // Checking ToolMutation in materializer.ts: 
      // It has toolPropsUpdated, pagesAdded, etc. NO lifecycleUpdated.
      // How does lifecycle get added? 
      // Maybe it's not supported in mutation yet?
      // If so, that's a gap.
      // BUT, the user issue is about `onPageLoad` which is a PAGE event.
      // Page events ARE supported in pagesUpdated.
  };
  
  // Let's test Page Event validation in Materializer
  const badPageUpdate = {
      pagesUpdated: [{
          pageId: "p1",
          patch: {
              events: [{ type: "onPageLoad", actionId: "ghost_action" }]
          }
      }]
  };
  // We need a base spec with page p1
  const specWithPage: any = {
      kind: "mini_app", title: "Test",
      pages: [{ id: "p1", name: "Home", components: [] }],
      actions: [],
      state: {}
  };

  const materializer = await import("../lib/spec/materializer");
  try {
    const next = materializer.materializeSpec(specWithPage, badPageUpdate);
    assert(next.pages.length === 1, "Spec with bad page event still materializes");
    console.log("✅ PASS: Page update with missing action does not crash materializer");
  } catch (e: any) {
    console.error(`❌ FAIL: Page update references missing action (Threw: ${e.message})`);
    failures++;
  }

  console.log("\n--- Test 2d: containerPropsUpdated for newly added root container ---");
  {
    const baseSpec2: any = { kind: "mini_app", title: "Test", pages: [], actions: [], state: {} };
    const mutationContainerInline: any = {
      pagesAdded: [
        {
          id: "p_root",
          name: "Home",
          components: [
            {
              id: "main_layout",
              type: "container",
              properties: { layout: "column", gap: 1 }
            }
          ]
        }
      ],
      containerPropsUpdated: [
        { id: "main_layout", propertiesPatch: { gap: 3 } }
      ]
    };
    try {
      const next: any = materializer.materializeSpec(baseSpec2 as any, mutationContainerInline);
      const page = next.pages[0];
      const container = page.components.find((c: any) => c.id === "main_layout");
      assert(!!container, "main_layout container exists after materialization");
      assert(container.properties.layout === "column", "preserves existing layout property on main_layout");
      assert(container.properties.gap === 3, "applies containerPropsUpdated patch to main_layout");
      console.log("✅ PASS: containerPropsUpdated applied to newly added root container");
    } catch (e: any) {
      console.error(`❌ FAIL: containerPropsUpdated for new root container: ${e.message}`);
      failures++;
    }
  }

  console.log("\n--- Test 2e: containerPropsUpdated for nested container ---");
  {
    const baseSpecNested: any = {
      kind: "mini_app",
      title: "Test",
      pages: [
        {
          id: "p_nested",
          name: "Nested",
          components: [
            {
              id: "outer_container",
              type: "container",
              properties: { layout: "row", gap: 1 },
              children: [
                {
                  id: "inner_container",
                  type: "container",
                  properties: { layout: "column", gap: 2 }
                }
              ]
            }
          ]
        }
      ],
      actions: [],
      state: {}
    };
    const mutationNested: any = {
      containerPropsUpdated: [
        { id: "inner_container", propertiesPatch: { gap: 5 } }
      ]
    };
    try {
      const next: any = materializer.materializeSpec(baseSpecNested as any, mutationNested);
      const page = next.pages.find((p: any) => p.id === "p_nested");
      const outer = page.components.find((c: any) => c.id === "outer_container");
      const inner = (outer.children || []).find((c: any) => c.id === "inner_container");
      assert(!!inner, "inner_container exists after nested materialization");
      assert(inner.properties.layout === "column", "preserves existing layout on inner_container");
      assert(inner.properties.gap === 5, "applies containerPropsUpdated patch to nested container");
      console.log("✅ PASS: containerPropsUpdated applied to nested container");
    } catch (e: any) {
      console.error(`❌ FAIL: containerPropsUpdated for nested container: ${e.message}`);
      failures++;
    }
  }

  console.log("\n--- Test 2f: containerPropsUpdated unknown component preflight ---");
  {
    const baseSpecBad: any = {
      kind: "mini_app",
      title: "Test",
      pages: [{ id: "p_unknown", name: "Page", components: [] }],
      actions: [],
      state: {}
    };
    const mutationBad: any = {
      containerPropsUpdated: [
        { id: "missing_container", propertiesPatch: { gap: 1 } }
      ]
    };
    assertThrows(
      () => materializer.materializeSpec(baseSpecBad, mutationBad),
      "Spec inconsistency: containerPropsUpdated references unknown component",
    );
  }

  // Test 3: Unreachable Action
  const intentUnreachable: CompiledIntent = {
    intent_type: "modify",
    system_goal: "test",
    constraints: [],
    integrations_required: [],
    output_mode: "mini_app",
    execution_graph: { nodes: [], edges: [] },
    execution_policy: { deterministic: true, parallelizable: false, retries: 0 },
    tool_mutation: {
      actionsAdded: [{ id: "orphan_action", type: "integration_call" }]
    },
    outcome: "success"
  } as any;
  assertThrows(() => validateCompiledIntent(intentUnreachable), "Action defined but unreachable");

  // Test 4: Repair & Normalization
  console.log("\n--- Test 4: Repair & Normalization ---");
  const intentToRepair: CompiledIntent = {
    intent_type: "modify",
    system_goal: "test",
    constraints: [],
    integrations_required: [],
    output_mode: "mini_app",
    execution_graph: { nodes: [], edges: [] },
    execution_policy: { deterministic: true, parallelizable: false, retries: 0 },
    tool_mutation: {
      actionsAdded: [
        { id: "fetch-data", type: "integration_call", effectOnly: true, config: { assign: "data" } } // Orphan, kebab-case
      ],
      pagesAdded: [{ id: "p1" }],
      componentsAdded: [
        { id: "c1", type: "text", dataSource: { type: "state", value: "data" } }
      ]
    },
    outcome: "success"
  } as any;
  
  repairCompiledIntent(intentToRepair);
  // @ts-ignore
  const repairedAction = intentToRepair.tool_mutation.actionsAdded[0];
  assert(repairedAction.id === "fetch_data", "Action ID normalized in repair");
  assert(repairedAction.triggeredBy?.type === "lifecycle", "Orphan action auto-bound to lifecycle");
  
  // Verify it passes validation now
  try {
    validateCompiledIntent(intentToRepair);
    console.log("✅ PASS: Repaired intent passes validation");
  } catch (e: any) {
    console.error(`❌ FAIL: Repaired intent failed validation: ${e.message}`);
    failures++;
  }

  // Test 4b: Repair Integration Pipeline (Auto-Inject Normalizer)
  console.log("\n--- Test 4b: Repair Integration Pipeline ---");
  const intentPipeline: CompiledIntent = {
    intent_type: "modify",
    system_goal: "test",
    tool_mutation: {
      actionsAdded: [
        { id: "fetch_raw_data", type: "integration_call", config: { assign: "rawData", capabilityId: "test_capability_raw" } }
      ],
      pagesAdded: [{ id: "p1" }],
      componentsAdded: [
        { id: "list1", type: "list", dataSource: { type: "state", value: "rawItems" } } // Binds to FUTURE normalized data
      ]
    },
    outcome: "success"
  } as any;

  repairCompiledIntent(intentPipeline);
  const actions = intentPipeline.tool_mutation!.actionsAdded!;
  const normalizer = actions.find((a: any) => a.id === "normalize_raw_data");
  assert(!!normalizer, "Auto-injected normalization action");
  assert(normalizer?.config?.assign === "rawItems", "Normalizer assigns to expected key");
  assert(normalizer?.triggeredBy?.type === "state_change" && normalizer.triggeredBy.stateKey === "rawData", "Normalizer triggered by raw data change");
  
  // Test Option A: Direct binding (No status mapper)
  const listComp = intentPipeline.tool_mutation!.componentsAdded![0];
  // Note: logic wires loadingKey to *integration* status (rawDataStatus)
  assert(listComp.properties?.loadingKey === "rawDataStatus", "Auto-wired loadingKey");
  assert(listComp.properties?.errorKey === "rawDataError", "Auto-wired errorKey");
  
  try {
      validateCompiledIntent(intentPipeline);
      console.log("✅ PASS: Pipeline intent passes validation");
  } catch (e: any) {
      console.error(`❌ FAIL: Pipeline intent failed validation: ${e.message}`);
      failures++;
  }

  console.log("\n--- Test 4c: Normalizer-only consumption (no status binding) ---");
  const intentDerivedOnly: CompiledIntent = {
    intent_type: "modify",
    system_goal: "test derived consumption",
    tool_mutation: {
      actionsAdded: [
        { id: "load_activity_list", type: "integration_call", config: { assign: "activityList", capabilityId: "test_capability_activity_list" } }
      ],
      pagesAdded: [{ id: "activity_page" }],
      componentsAdded: [
        { id: "activity_list", type: "list", dataSource: { type: "state", value: "activityItems" } }
      ]
    },
    outcome: "success"
  } as any;

  repairCompiledIntent(intentDerivedOnly);
  try {
    validateCompiledIntent(intentDerivedOnly);
    console.log("✅ PASS: Derived-only pipeline passes validation without status bindings");
  } catch (e: any) {
    console.error(`❌ FAIL: Derived-only pipeline failed validation: ${e.message}`);
    failures++;
  }

  // Test 4c: Status Mirroring for Generic List
  console.log("\n--- Test 4c: Status Mirroring for Generic List ---");
  const intentGenericList: CompiledIntent = {
    intent_type: "modify",
    system_goal: "test",
    tool_mutation: {
      actionsAdded: [
        { id: "fetch_github_commits", type: "integration_call", config: { assign: "github_commits", capabilityId: "test_capability_github_commits" } }
      ],
      pagesAdded: [{ id: "p1" }],
      componentsAdded: [
        { id: "list_generic", type: "list", dataSource: { type: "state", value: "filteredActivity" }, properties: { loadingKey: "activityListStatus", errorKey: "activityListError" } }
      ]
    },
    outcome: "success"
  } as any;
  repairCompiledIntent(intentGenericList);
  const mirror = intentGenericList.tool_mutation!.actionsAdded!.find((a: any) => a.id === "mirror_status_github_commits");
  assert(!!mirror, "Injected status mirroring action");
  assert(Array.isArray(mirror.triggeredBy) && mirror.triggeredBy.length === 2, "Mirroring action triggered by both status and error changes");
  assert(mirror.type === "workflow" && Array.isArray(mirror.steps) && mirror.steps[0].type === "state_mutation", "Mirroring uses state_mutation step");
  try {
    validateCompiledIntent(intentGenericList);
    console.log("✅ PASS: Generic list intent passes validation");
  } catch (e: any) {
    console.error(`❌ FAIL: Generic list intent failed validation: ${e.message}`);
    failures++;
  }

  // Test 6: New Validation Rules
  console.log("\n--- Test 6: New Validation Rules ---");
  const intentBadType: CompiledIntent = {
      intent_type: "modify",
      tool_mutation: {
          actionsAdded: [{ id: "bad", type: "custom_function" }]
      },
      outcome: "success"
  } as any;
  assertThrows(() => validateCompiledIntent(intentBadType), "Invalid action type");

  // Test 6c: state_assign is normalized to internal and passes validation
  {
    const intentStateAssign: CompiledIntent = {
      intent_type: "modify",
      tool_mutation: {
        actionsAdded: [{
          id: "update_activity_filters",
          type: "state_assign",
          config: { source: "{{state.filters.integration_filter}}", target: "filters.integration_filter" }
        }],
        componentsAdded: [
          { id: "integration_filter", type: "select", properties: { bindKey: "filters.integration_filter" } }
        ],
        stateAdded: { "filters.integration_filter": null }
      },
      outcome: "success"
    } as any;
    repairCompiledIntent(intentStateAssign);
    try {
      validateCompiledIntent(intentStateAssign);
      console.log("✅ PASS: state_assign normalized and validated");
    } catch (e: any) {
      console.error(`❌ FAIL: state_assign normalization failed validation: ${e.message}`);
      failures++;
    }
    const upd2 = intentStateAssign.tool_mutation!.actionsAdded![0] as any;
    assert(upd2.type === "internal", "Converted state_assign to internal");
    assert(Array.isArray(upd2.steps) && upd2.steps[0]?.type === "state_mutation", "Injected explicit state_mutation step");
    const triggers = Array.isArray(upd2.triggeredBy) ? upd2.triggeredBy : (upd2.triggeredBy ? [upd2.triggeredBy] : []);
    assert(triggers.some((t: any) => t.type === "state_change" && t.stateKey === "filters.integration_filter"), "Auto-attached state_change trigger for filter key");
  }

  // Test 6b: state_update is repaired to internal
  const intentStateUpdate: CompiledIntent = {
      intent_type: "modify",
      tool_mutation: {
          actionsAdded: [{
              id: "update_filter_state",
              type: "state_update",
              config: { updates: { "filters.type": "{{ state.filters.type }}", "filters.integration": "{{ state.filters.integration }}" } },
              triggeredBy: { type: "lifecycle", event: "onPageLoad" }
          }]
      },
      outcome: "success"
  } as any;
  repairCompiledIntent(intentStateUpdate);
  const upd = intentStateUpdate.tool_mutation!.actionsAdded![0] as any;
  assert(upd.type === "internal", "Converted state_update to internal");
  assert(Array.isArray(upd.steps) && upd.steps[0]?.type === "state_mutation", "Added explicit state_mutation step");
  try {
    validateCompiledIntent(intentStateUpdate);
    console.log("✅ PASS: Repaired state_update intent passes validation");
  } catch (e: any) {
    console.error(`❌ FAIL: Repaired state_update intent failed validation: ${e.message}`);
    failures++;
  }

  const intentBadClick: CompiledIntent = {
      intent_type: "modify",
      tool_mutation: {
          componentsAdded: [{ 
              id: "l1", type: "list", 
              properties: { itemTemplate: { onClick: "some_action" } } 
          }]
      },
      outcome: "success"
  } as any;
  assertThrows(() => validateCompiledIntent(intentBadClick), "defines onClick on itemTemplate");

  console.log("\n--- Test 5: Assign Action Normalization ---");
  const intentAssign: CompiledIntent = {
    intent_type: "modify",
    system_goal: "test assign normalization",
    constraints: [],
    integrations_required: [],
    output_mode: "mini_app",
    execution_graph: { nodes: [], edges: [] },
    execution_policy: { deterministic: true, parallelizable: false, retries: 0 },
    tool_mutation: {
      actionsAdded: [
        {
          id: "select_activity_item",
          type: "assign",
          config: {
            source: "{{state.activityItems.selectedId}}",
            target: "selectedActivityId",
          },
        },
      ],
      componentsAdded: [
        {
          id: "activity_list",
          type: "list",
          dataSource: { type: "state", value: "activityItems" },
          events: [{ type: "onSelect", actionId: "select_activity_item" }],
        },
      ],
      stateAdded: {
        activityItems: [],
        selectedActivityId: null,
      },
    },
    outcome: "success",
  } as any;

  repairCompiledIntent(intentAssign);
  try {
    validateCompiledIntent(intentAssign);
    console.log("✅ PASS: assign action normalized and validated");
  } catch (e: any) {
    console.error(`❌ FAIL: assign action normalization failed validation: ${e.message}`);
    failures++;
  }

  const assignActions = (intentAssign.tool_mutation as any).actionsAdded as any[];
  assert(
    !assignActions.some((a: any) => a.type === "assign"),
    "No action with type 'assign' after normalization",
  );
  const selectAction = assignActions.find((a: any) => a.id === "select_activity_item");
  assert(selectAction.type === "internal", "select_activity_item converted to internal");
  assert(
    selectAction.config?.operation === "assign",
    "select_activity_item tagged with operation=assign",
  );
  assert(
    Array.isArray(selectAction.steps) && selectAction.steps[0]?.type === "state_mutation",
    "assign normalization injects state_mutation step",
  );

  console.log("\n--- Test 5b: Runtime execution of normalized assign ---");
  const specAssign: MiniAppSpec = {
    kind: "mini_app",
    title: "Assign Test App",
    state: { selectedActivityId: null, activityItems: [] },
    pages: [
      {
        id: "home",
        name: "Home",
        layoutMode: "grid",
        components: [
          {
            id: "activity_list",
            type: "list",
            dataSource: { type: "state", value: "activityItems" },
            events: [{ type: "onSelect", actionId: "select_activity_item" }],
          } as any,
        ],
      } as any,
    ],
    actions: [
      {
        id: "select_activity_item",
        type: "internal",
        config: { operation: "assign", source: "{{payload.item.id}}", target: "selectedActivityId" },
        steps: [{ type: "state_mutation", config: { updates: { selectedActivityId: "{{payload.item.id}}" } } }],
      } as any,
    ],
  };
  try {
    const storeAssign = new MiniAppStore(specAssign, { call: async () => ({ status: "success", rows: [] } as any) }, {});
    await storeAssign.dispatch("select_activity_item", { item: { id: "X123" } }, { event: "onSelect", originId: "activity_list" });
    const snap = storeAssign.getSnapshot();
    assert(snap.state.selectedActivityId === "X123", "Runtime executed normalized assign and updated state");
  } catch (e: any) {
    console.error(`❌ FAIL: Runtime assign execution failed: ${e.message}`);
    failures++;
  }

  console.log("\n--- Test 6: Runtime Registry & Execution ---");
  const spec: MiniAppSpec = {
    kind: "mini_app",
    title: "Test App",
    state: {},
    pages: [{ id: "p1", name: "Home", layoutMode: "grid", components: [], events: [{ type: "onPageLoad", actionId: "fetch-data" }] }], // Kebab ref
    actions: [{ id: "fetch_data", type: "integration_call" }] // Snake def
  };

  let callCount = 0;
  const mockIntegrations = {
    call: async (id: string, args: any) => {
      console.log(`Mock integration called: ${id}`);
      if (id === "fetch_data") callCount++;
      return { status: "success", rows: [] } as any;
    }
  };

  try {
    const store = new MiniAppStore(spec, mockIntegrations, {});
    // Simulate page load dispatch
    await store.dispatch("fetch-data", {}, { event: "onPageLoad" }); // Dispatch with kebab
    assert(callCount === 1, "Runtime executed action despite ID mismatch (normalized)");
    
    const action = store.getAction("fetch-data");
    assert(!!action, "Runtime found action via kebab-case lookup");
  } catch (e: any) {
    console.error(`❌ FAIL: Runtime test error: ${e.message}`);
    failures++;
  }

  console.log("\n--- Test 7: Inline event actions are hoisted into actionsAdded ---");
  {
    const intentInline: CompiledIntent = {
      intent_type: "modify",
      system_goal: "ui-only dashboard",
      constraints: [],
      integrations_required: [],
      output_mode: "mini_app",
      execution_graph: { nodes: [], edges: [] },
      execution_policy: { deterministic: true, parallelizable: false, retries: 0 },
      tool_mutation: {
        stateAdded: {
          toolFilter: null,
          activityTypeFilter: null,
          timeRangeFilter: null,
          selectedActivityId: null,
        },
        pagesAdded: [
          { id: "activity_dashboard", name: "Activity Dashboard", components: [] } as any,
        ],
        componentsAdded: [
          {
            id: "tool-filter",
            type: "select",
            properties: { bindKey: "toolFilter" },
            events: [
              {
                type: "onChange",
                action: {
                  type: "state_assign",
                  config: {
                    operation: "assign_state",
                    params: { key: "toolFilter", value: "{{event.value}}" },
                  },
                },
              },
            ],
          } as any,
          {
            id: "activitytype-filter",
            type: "select",
            properties: { bindKey: "activityTypeFilter" },
            events: [
              {
                type: "onChange",
                action: {
                  type: "state_assign",
                  config: {
                    operation: "assign_state",
                    params: { key: "activityTypeFilter", value: "{{event.value}}" },
                  },
                },
              },
            ],
          } as any,
          {
            id: "timerange-filter",
            type: "select",
            properties: { bindKey: "timeRangeFilter" },
            events: [
              {
                type: "onChange",
                action: {
                  type: "state_assign",
                  config: {
                    operation: "assign_state",
                    params: { key: "timeRangeFilter", value: "{{event.value}}" },
                  },
                },
              },
            ],
          } as any,
          {
            id: "activity-list",
            type: "list",
            dataSource: { type: "state", value: "activityItems" },
            events: [
              {
                type: "onItemClick",
                action: {
                  type: "state_assign",
                  config: {
                    operation: "assign_state",
                    params: { key: "selectedActivityId", value: "{{event.item.id}}" },
                  },
                },
              },
            ],
          } as any,
        ],
      },
      outcome: "success",
    } as any;

    const baseSpec: MiniAppSpec = {
      kind: "mini_app",
      title: "Inline Event Test",
      state: {},
      pages: [],
      actions: [],
    };

    repairCompiledIntent(intentInline);
    const mutation: any = intentInline.tool_mutation;
    const events = (mutation.componentsAdded || []).flatMap((c: any) => c.events || []);
    assert(events.every((e: any) => !e.action && typeof e.actionId === "string" && e.actionId.length > 0), "All component events reference actionId only");
    const actionIds = new Set((mutation.actionsAdded || []).map((a: any) => a.id));
    assert(actionIds.has("set_tool_filter"), "set_tool_filter action created");
    assert(actionIds.has("set_activity_type_filter"), "set_activity_type_filter action created");
    assert(actionIds.has("set_time_range_filter"), "set_time_range_filter action created");
    assert(actionIds.has("select_activity"), "select_activity action created");

    try {
      const nextSpec = materializeSpec(baseSpec as any, mutation) as MiniAppSpec;
      assert(nextSpec.actions.length >= 4, "Materialized spec carries hoisted actions");
      assert(nextSpec.pages.length >= 0, "Materialized spec built without error");
      console.log("✅ PASS: Inline event actions hoisted and spec materializes without missing-action errors");
    } catch (e: any) {
      console.error(`❌ FAIL: Inline event hoisting spec materialization failed: ${e.message}`);
      failures++;
    }
  }

  console.log("\n--- Test 8: UI renders with zero actions ---");
  try {
    const specZeroActions: MiniAppSpec = {
      kind: "mini_app",
      title: "Zero Actions App",
      state: { message: "Hello" },
      pages: [
        {
          id: "page-zero",
          name: "Zero",
          layoutMode: "stack",
          components: [
            {
              id: "text1",
              type: "text",
              properties: { content: "Static: {{state.message}}" },
            } as any,
          ],
        },
      ],
      actions: [],
    };
    const storeZero = new MiniAppStore(specZeroActions, { call: async () => ({ status: "success", rows: [] } as any) }, {});
    const snapZero = storeZero.getSnapshot();
    assert(snapZero.activePageId === "page-zero", "Active page set correctly with zero actions");
    assert(snapZero.state.message === "Hello", "State initialized correctly with zero actions");
    console.log("✅ PASS: UI store initializes with zero actions");
  } catch (e: any) {
    console.error(`❌ FAIL: Zero actions runtime test failed: ${e.message}`);
    failures++;
  }

  console.log("\n--- Test 9: Filters work via declarative derivations (no actions) ---");
  try {
    const specFilters: MiniAppSpec = {
      kind: "mini_app",
      title: "Filter App",
      state: {
        items: [
          { id: 1, kind: "a" },
          { id: 2, kind: "b" },
        ],
        kindFilter: "a",
        __derivations: [
          { target: "filtered", source: "items", op: "filter", args: { field: "kind", equalsKey: "kindFilter" } },
        ],
      } as any,
      pages: [
        {
          id: "page-filters",
          name: "Filters",
          layoutMode: "stack",
          components: [],
        },
      ],
      actions: [],
    };
    const storeFilters = new MiniAppStore(specFilters, { call: async () => ({ status: "success", rows: [] } as any) }, {});
    const snapFilters = storeFilters.getSnapshot();
    assert(Array.isArray(snapFilters.state.filtered), "Derived filtered list exists");
    assert(snapFilters.state.filtered.length === 1, "Filter reduces items based on state");
    console.log("✅ PASS: Declarative derivations compute filtered state without actions");
  } catch (e: any) {
    console.error(`❌ FAIL: Declarative filter derivation failed: ${e.message}`);
    failures++;
  }

  console.log("\n--- Test 10: Invalid capability IDs are downgraded and do not break validation ---");
  try {
    const intentBadCap: CompiledIntent = {
      intent_type: "create",
      system_goal: "Bad capability test",
      constraints: [],
      integrations_required: [],
      output_mode: "mini_app",
      execution_graph: { nodes: [], edges: [] },
      execution_policy: { deterministic: true, parallelizable: false, retries: 0 },
      tool_mutation: {
        pagesAdded: [
          {
            id: "page-badcap",
            name: "BadCap",
            layoutMode: "stack",
            components: [],
            events: [{ type: "onPageLoad", actionId: "load-bad" }],
          } as any,
        ],
        actionsAdded: [
          {
            id: "load-bad",
            type: "integration_call",
            config: { capabilityId: "nonexistent_capability" },
            triggeredBy: { type: "lifecycle", event: "onPageLoad" },
          } as any,
        ],
        stateAdded: {},
      },
    };
    buildExecutionGraph(intentBadCap);
    validateCompiledIntent(intentBadCap);
    const nodes = intentBadCap.execution_graph.nodes;
    assert(nodes.length === 1, "Execution graph has one node for invalid capability action");
    assert(nodes[0].type === "emit_event", "Invalid capability action downgraded to emit_event");
    assert(!nodes[0].capabilityId, "Execution node does not carry invalid capabilityId");
    console.log("✅ PASS: Invalid capability IDs are downgraded without throwing InvalidIntentGraph");
  } catch (e: any) {
    console.error(`❌ FAIL: Invalid capability downgrade test failed: ${e.message}`);
    failures++;
  }

  console.log("\n--- Test 11: Materializer auto-generates noop actions for missing references ---");
  try {
    const baseSpecMissing: MiniAppSpec = {
      kind: "mini_app",
      title: "Missing Action App",
      state: {},
      pages: [
        {
          id: "page-missing",
          name: "Missing",
          layoutMode: "stack",
          components: [
            {
              id: "btn1",
              type: "button",
              properties: { text: "Click" },
              events: [{ type: "onClick", actionId: "missing_action_id" }],
            } as any,
          ],
        },
      ],
      actions: [],
    };
    const mutationMissing: any = {
      pagesAdded: [],
      actionsAdded: [],
      stateAdded: {},
    };
    const nextSpec = materializeSpec(baseSpecMissing as any, mutationMissing) as MiniAppSpec;
    assert(nextSpec.pages.length === 1, "Spec with missing action still materializes");
    console.log("✅ PASS: Materializer does not throw for missing action references");
  } catch (e: any) {
    console.error(`❌ FAIL: Materializer missing-action resilience test failed: ${e.message}`);
    failures++;
  }

  if (failures === 0) {
    console.log("\n🎉 ALL TESTS PASSED");
    process.exit(0);
  } else {
    console.error(`\n❌ ${failures} TESTS FAILED`);
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
