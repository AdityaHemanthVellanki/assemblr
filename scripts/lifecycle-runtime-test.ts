
import { MiniAppStore } from "../components/miniapp/runtime";
import { MiniAppSpec } from "../lib/spec/miniAppSpec";

async function runTest() {
  console.log("Running Regression Test: Lifecycle-only integration_call executes correctly on page load");

  const actionId = "fetch-github-activity";
  const spec: MiniAppSpec = {
    kind: "mini_app",
    title: "Test App",
    pages: [
      {
        id: "page1",
        name: "Home",
        layoutMode: "stack",
        components: [
          { id: "text1", type: "text", properties: { content: "Hello" } }
        ],
        events: [
          { type: "onPageLoad", actionId: actionId, args: { autoAttached: true } }
        ]
      }
    ],
    actions: [
      {
        id: actionId,
        type: "integration_call",
        config: {
          capabilityId: "github_activity",
          assign: "activityData"
        },
        triggeredBy: { type: "lifecycle", event: "onPageLoad" }
      }
    ],
    state: {
      activityData: []
    }
  };

  let callCount = 0;
  const mockIntegrations = {
    call: async (id: string, args: any) => {
      console.log(`[MockIntegration] Called ${id} with args:`, args);
      // Runtime normalizes ID, so we check against normalized version or allow both
      if (id === actionId || id === actionId.replace(/-/g, "_")) {
        callCount++;
        return { status: "success", rows: [{ id: 1, type: "push" }] };
      }
      return { status: "error", error: "Unknown action" };
    }
  };

  try {
    const store = new MiniAppStore(spec, mockIntegrations as any, {});
    
    // Simulate Page Load
    console.log("Dispatching onPageLoad...");
    // In the real app, this is triggered by useEffect in MiniAppRoot.
    // We manually dispatch it here to simulate the effect.
    await store.dispatch(actionId, { autoAttached: true }, { event: "onPageLoad", originId: "page1", auto: true });

    // Check if called
    if (callCount === 1) {
      console.log("SUCCESS: Action executed correctly.");
    } else {
      console.error(`FAILURE: Expected 1 call, got ${callCount}`);
      process.exit(1);
    }

    // Check state update
    const snapshot = store.getSnapshot();
    if (snapshot.state.activityData?.length === 1) {
        console.log("SUCCESS: State updated correctly.");
    } else {
        console.error("FAILURE: State not updated.", snapshot.state.activityData);
        process.exit(1);
    }

  } catch (err) {
    console.error("Test Crashed:", err);
    process.exit(1);
  }
}

runTest();
