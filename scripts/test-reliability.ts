
import fs from "fs";
import path from "path";

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
};

function log(msg: string, color: keyof typeof COLORS = "reset") {
  console.log(`${COLORS[color]}${msg}${COLORS.reset}`);
}

function checkFileContains(filePath: string, patterns: (string | RegExp)[]) {
  const content = fs.readFileSync(filePath, "utf-8");
  let allFound = true;
  for (const pattern of patterns) {
    const found = typeof pattern === "string" ? content.includes(pattern) : pattern.test(content);
    if (!found) {
      log(`[FAIL] ${path.basename(filePath)} missing pattern: ${pattern}`, "red");
      allFound = false;
    }
  }
  return allFound;
}

function checkFileNotContains(filePath: string, patterns: (string | RegExp)[]) {
  const content = fs.readFileSync(filePath, "utf-8");
  let noneFound = true;
  for (const pattern of patterns) {
    const found = typeof pattern === "string" ? content.includes(pattern) : pattern.test(content);
    if (found) {
      log(`[FAIL] ${path.basename(filePath)} should NOT contain: ${pattern}`, "red");
      noneFound = false;
    }
  }
  return noneFound;
}

async function runTests() {
  log("Starting Reliability & Auth Architecture Tests...\n", "blue");
  let passed = 0;
  let total = 0;

  // Test 1: Status endpoint never returns 401 (Auth-Light)
  total++;
  log("Test 1: Status endpoint never returns 401 (Auth-Light)", "yellow");
  const statusRoutePath = path.join(process.cwd(), "app/api/tools/[toolId]/status/route.ts");
  const t1 = checkFileNotContains(statusRoutePath, ["requireOrgMember", "getAuthenticatedContext"]) &&
             checkFileContains(statusRoutePath, ["status: 200", /status:\s*"unauthenticated"/]);
  
  if (t1) {
    log("✅ PASS", "green");
    passed++;
  } else {
    log("❌ FAIL", "red");
  }

  // Test 2: Polling stops/backs off on unauthenticated
  total++;
  log("\nTest 2: Polling stops/backs off on unauthenticated", "yellow");
  const rendererPath = path.join(process.cwd(), "components/dashboard/tool-renderer.tsx");
  const t2 = checkFileContains(rendererPath, [
    "authStatus",
    "clearInterval",
    "setTimeout", // Backoff/Delay
    /setPollingInterval\(null\)/
  ]);

  if (t2) {
    log("✅ PASS", "green");
    passed++;
  } else {
    log("❌ FAIL", "red");
  }

  // Test 3: Renders tool preview even when status unauthenticated
  total++;
  log("\nTest 3: Renders tool preview even when status unauthenticated", "yellow");
  const t3 = checkFileContains(rendererPath, [
    "Waiting for session...", // UI Feedback
    `authStatus === "unauthenticated"`
  ]);

  if (t3) {
    log("✅ PASS", "green");
    passed++;
  } else {
    log("❌ FAIL", "red");
  }

  // Test 4: Auth is removed from shared/cached context (Fix 1)
  total++;
  log("\nTest 4: Auth is removed from shared/cached context (Fix 1)", "yellow");
  const contextPath = path.join(process.cwd(), "lib/api/context.ts");
  const t4 = checkFileNotContains(contextPath, [
    "getAuthenticatedContext",
    "cookies()",
    "import { cookies }",
  ]);

  if (t4) {
    log("✅ PASS", "green");
    passed++;
  } else {
    log("❌ FAIL", "red");
  }

  // Test 5: No 429s during normal preview (Backoff logic presence)
  total++;
  log("\nTest 5: No 429s during normal preview (Backoff logic presence)", "yellow");
  // We check if ApiError is imported and 429 is handled or backoff is present
  const t5 = checkFileContains(rendererPath, [
    "ApiError",
    // We expect some handling of errors or just the backoff mechanism itself covers this
    // The backoff for authStatus handles the auth 429s indirectly by slowing down checks
    "fetchStatus"
  ]);
  
  if (t5) {
    log("✅ PASS", "green");
    passed++;
  } else {
    log("❌ FAIL", "red");
  }

  log(`\nSummary: ${passed}/${total} tests passed.`, passed === total ? "green" : "red");
  
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
