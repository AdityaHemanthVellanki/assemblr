import { parseChatPlan } from "@/lib/ai/chat-planner";

function expectThrows(fn: () => void) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error("expected function to throw");
  }
}

async function run() {
  expectThrows(() => {
    parseChatPlan({
      intent: "tool_modification",
      requested_integration_ids: [],
    });
  });

  expectThrows(() => {
    parseChatPlan({
      intent: "tool_modification",
      required_capabilities: [],
    });
  });

  expectThrows(() => {
    parseChatPlan({
      intent: "tool_modification",
      required_capabilities: "payment_transactions",
      requested_integration_ids: [],
    });
  });

  expectThrows(() => {
    // invalid JSON should fail hard before parsing
    JSON.parse("{not json");
  });

  parseChatPlan({
    intent: "tool_modification",
    required_capabilities: [],
    requested_integration_ids: [],
  });
}

run().catch((err) => {
  console.error("chat-planner-contract-tests failed", err);
  process.exit(1);
});
