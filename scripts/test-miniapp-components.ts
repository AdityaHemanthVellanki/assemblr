
import { validateRegisteredComponents } from "@/components/miniapp/runtime";
import { MINI_APP_COMPONENTS } from "@/components/miniapp/components";
import { MiniAppSpec } from "@/lib/spec/miniAppSpec";

console.log("Running Mini App Component Acceptance Tests...");

// Test 1: Verify Registry
console.log("1. Verifying Component Registry...");
const required = ["panel", "banner", "Panel", "Banner"];
const missing = required.filter(k => !MINI_APP_COMPONENTS[k]);
if (missing.length) {
  console.error("FAIL: Missing components in registry:", missing);
  process.exit(1);
}
console.log("PASS: All required components registered.");

// Test 2: Verify Validation Logic (and Canonicalization)
console.log("2. Verifying Validation & Canonicalization...");

// Mock spec to match MiniAppSpec type
const testSpec: any = {
  kind: "mini_app",
  title: "Test Spec",
  pages: [
    {
      id: "p1",
      name: "Page 1",
      components: [
        { id: "c1", type: "Panel", properties: { title: "Details" } },
        { id: "c2", type: "Banner", properties: { message: "Alert" } },
        { id: "c3", type: "panel", properties: {} },
        { id: "c4", type: "banner", properties: {} }
      ]
    }
  ],
  actions: []
};

try {
  validateRegisteredComponents(testSpec);
  console.log("PASS: Validation succeeded for Panel and Banner (mixed case).");
} catch (e) {
  console.error("FAIL: Validation failed:", e);
  process.exit(1);
}

// Verify canonicalization happened
const c1 = testSpec.pages[0].components[0];
if (c1.type !== "panel") {
  console.error(`FAIL: Canonicalization failed. Expected 'panel', got '${c1.type}'`);
  process.exit(1);
}
console.log("PASS: Component types canonicalized to lowercase.");

console.log("All tests passed!");
